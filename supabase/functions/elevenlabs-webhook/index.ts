import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { supplierRequestedNoContact, supplierTranscript, transcriptText, verifyElevenLabsSignature, voicemailDetected, type TranscriptTurn } from '../../../src/features/voice/webhook.ts'
import { completeQueueItem, dispatchNextSupplierCall, retryQueueItemAfterInitiationFailure } from '../_shared/call-queue.ts'
import { sendMissedOwnerCallFallback } from '../_shared/owner-notifications.ts'

declare const EdgeRuntime:{waitUntil(promise:Promise<unknown>):void}

const quoteSchema={type:'object',additionalProperties:false,required:['quoteProvided','quantity','unit','unitPriceCents','subtotalCents','discountCents','deliveryCents','feesCents','taxCents','totalCents','available','deliveryTime','paymentDays','depositBps','isSubstitution','specificationConfirmed','certifications','termsConfirmed','evidence'],properties:{quoteProvided:{type:'boolean'},quantity:{type:['number','null']},unit:{type:['string','null']},unitPriceCents:{type:['integer','null']},subtotalCents:{type:['integer','null']},discountCents:{type:['integer','null']},deliveryCents:{type:['integer','null']},feesCents:{type:['integer','null']},taxCents:{type:['integer','null']},totalCents:{type:['integer','null']},available:{type:['boolean','null']},deliveryTime:{type:['string','null']},paymentDays:{type:['integer','null']},depositBps:{type:['integer','null']},isSubstitution:{type:'boolean'},specificationConfirmed:{type:'boolean'},certifications:{type:'array',items:{type:'string'}},termsConfirmed:{type:'boolean'},evidence:{type:'array',items:{type:'object',additionalProperties:false,required:['field','text'],properties:{field:{type:'string'},text:{type:'string'}}}}}}

Deno.serve(async request=>{
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  const rawBody=await request.text()
  const secret=Deno.env.get('ELEVENLABS_WEBHOOK_SECRET')||''
  if(!await verifyElevenLabsSignature(rawBody,request.headers.get('ElevenLabs-Signature'),secret))return json({error:'Invalid webhook signature.'},401)
  let queueContext:{client:ReturnType<typeof createClient>;organizationId:string;requestId:string}|undefined
  try{
    const event=JSON.parse(rawBody) as {type:string;event_timestamp:number;data:{agent_id?:string;conversation_id?:string;failure_reason?:string;transcript?:TranscriptTurn[];metadata?:Record<string,unknown>;analysis?:Record<string,unknown>}}
    const conversationId=event.data?.conversation_id
    if(!conversationId)return json({error:'Conversation ID is missing.'},400)
    const expectedAgent=Deno.env.get('ELEVENLABS_AGENT_ID')
    const ownerNotificationAgent=Deno.env.get('ELEVENLABS_OWNER_NOTIFICATION_AGENT_ID')
    const supabaseUrl=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if(!supabaseUrl||!serviceKey)throw new Error('Supabase function secrets are incomplete.')
    const client=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
    if(ownerNotificationAgent&&event.data.agent_id===ownerNotificationAgent){
      const {data:notification}=await client.from('communication_events').select('id,organization_id,request_id,supplier_id,quote_id,recipient,payload').eq('provider_id',conversationId).eq('channel','voice').eq('purpose','owner_completion').maybeSingle()
      if(!notification)return json({error:'Owner notification call is not registered.'},404)
      const voicemail=event.type==='post_call_transcription'&&voicemailDetected(Array.isArray(event.data.transcript)?event.data.transcript:[])
      if(event.type!=='call_initiation_failure'&&!voicemail)return json({status:'received',kind:'owner_completion',outcome:event.type==='post_call_transcription'?'answered':'ignored'})
      const reason=voicemail?'voicemail detected':event.data.failure_reason||'call initiation failed'
      await client.from('communication_events').update({status:'failed',provider_error:reason}).eq('id',notification.id)
      const payload=notification.payload as {summary?:unknown;ownerEmail?:unknown}
      const summary=typeof payload.summary==='string'?payload.summary:''
      const email=typeof payload.ownerEmail==='string'?payload.ownerEmail:''
      if(!summary)return json({error:'Owner completion summary is missing.'},409)
      const fallback=await sendMissedOwnerCallFallback(client,{organizationId:notification.organization_id,requestId:notification.request_id,supplierId:notification.supplier_id,quoteId:notification.quote_id,phone:notification.recipient,email,summary,reason})
      return json({status:'received',kind:'owner_completion',outcome:'not_answered',fallback})
    }
    if(expectedAgent&&event.data.agent_id&&event.data.agent_id!==expectedAgent)return json({error:'Unexpected agent.'},401)
    const {data:call}=await client.from('supplier_calls').select('id,organization_id,request_id,supplier_id,queue_item_id').eq('provider_conversation_id',conversationId).single()
    if(!call)return json({error:'Conversation is not registered.'},404)
    if(event.type==='call_initiation_failure'){
      await client.from('supplier_calls').update({status:'failed',provider_error:event.data.failure_reason||'Call initiation failed',completed_at:new Date().toISOString(),provider_analysis:event.data.metadata||{}}).eq('id',call.id)
      await retryQueueItemAfterInitiationFailure(client,call.queue_item_id,call.id,event.data.failure_reason||'Call initiation failed')
      EdgeRuntime.waitUntil(dispatchNextSupplierCall(client,call.organization_id,call.request_id).catch(error=>console.error('Unable to continue supplier call queue',error)))
      return json({status:'received'})
    }
    if(event.type!=='post_call_transcription')return json({status:'ignored'})
    const turns=Array.isArray(event.data.transcript)?event.data.transcript.slice(0,500):[]
    const transcript=transcriptText(turns).slice(0,100_000),supplierOnly=supplierTranscript(turns).slice(0,60_000)
    const optedOut=supplierRequestedNoContact(supplierOnly)
    await client.from('supplier_calls').update({status:optedOut?'stopped':'completed',transcript,transcript_json:turns,provider_analysis:event.data.analysis||{},do_not_contact:optedOut,completed_at:new Date().toISOString()}).eq('id',call.id)
    await completeQueueItem(client,call.queue_item_id,call.id,'completed')
    queueContext={client,organizationId:call.organization_id,requestId:call.request_id}
    if(optedOut)await client.from('suppliers').update({do_not_contact:true}).eq('id',call.supplier_id).eq('organization_id',call.organization_id)
    if(!supplierOnly.trim())return json({status:'received',quote:'no supplier speech'})
    const [{data:procurementRequest},{data:supplier}]=await Promise.all([
      client.from('procurement_requests').select('details').eq('id',call.request_id).eq('organization_id',call.organization_id).single(),
      client.from('suppliers').select('name').eq('id',call.supplier_id).eq('organization_id',call.organization_id).single(),
    ])
    if(!procurementRequest||!supplier)throw new Error('Call context was not found.')
    const apiKey=Deno.env.get('OPENAI_API_KEY')
    if(!apiKey)throw new Error('OPENAI_API_KEY is not configured.')
    const model=Deno.env.get('OPENAI_EXTRACTION_MODEL')||'gpt-5.6-luna'
    const extraction=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,input:[{role:'system',content:[{type:'input_text',text:'Extract a procurement quote using only statements made by the SUPPLIER. Agent questions, proposed targets, budgets, and read-backs are not evidence unless the supplier explicitly confirms them. Use integer cents and basis points. Use null for unstated facts. specificationConfirmed is true only when the supplier explicitly confirms the requested item, cut or format, freshness, and certification requirements. termsConfirmed is true only when quantity, final total including all fees, delivery timing, payment days, and deposit are explicit. Evidence must be short supplier excerpts.'}]},{role:'user',content:[{type:'input_text',text:`Requested requirements:\n${JSON.stringify(procurementRequest.details)}\n\nSupplier transcript only:\n${supplierOnly}`}]}],text:{format:{type:'json_schema',name:'supplier_quote',strict:true,schema:quoteSchema}}})})
    if(!extraction.ok)throw new Error(`Quote extraction failed with ${extraction.status}.`)
    const extractionBody=await extraction.json()
    const output=extractionBody.output?.flatMap((item:{content?:unknown[]})=>item.content??[]).find((item:{type?:string})=>item.type==='output_text')?.text
    if(!output)throw new Error('Quote extraction returned no structured result.')
    const quote=JSON.parse(output) as Record<string,unknown>
    if(!quote.quoteProvided)return json({status:'received',quote:'not provided'})
    const quantity=positiveNumber(quote.quantity),total=nonNegativeInteger(quote.totalCents),computed=computeTotal(quote,quantity)
    const reconciles=total!==null&&(computed===null||computed===total)
    const needsReview=!quantity||total===null||!quote.available||!quote.deliveryTime||!quote.specificationConfirmed||!quote.termsConfirmed||!reconciles
    if(quantity&&total!==null){
      const row={organization_id:call.organization_id,request_id:call.request_id,supplier_id:call.supplier_id,call_id:call.id,total_cents:total,quantity,payment_days:boundedInteger(quote.paymentDays,0,365,0),deposit_bps:boundedInteger(quote.depositBps,0,10000,0),terms_confirmed:Boolean(quote.termsConfirmed)&&reconciles,details:{...quote,supplierName:supplier.name,reconciledTotalCents:computed,providerMetadata:event.data.metadata||{}},extraction_model:model,extraction_evidence:Array.isArray(quote.evidence)?quote.evidence:[],needs_review:needsReview}
      const {data:storedQuote,error}=await client.from('supplier_quotes').upsert(row,{onConflict:'call_id'}).select('id').single()
      if(error)throw error
      const functionUrl=`${supabaseUrl}/functions/v1/procurement-action`
      const purchaseResponse=await fetch(functionUrl,{method:'POST',headers:{Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({action:'auto_purchase',organizationId:call.organization_id,quoteId:storedQuote.id})})
      const purchase=await purchaseResponse.json().catch(()=>({})) as {status?:string}
      if(purchase.status!=='sent')await client.from('procurement_requests').update({status:'Needs approval'}).eq('id',call.request_id).eq('organization_id',call.organization_id).in('status',['Ready to source','Calling suppliers'])
      if(purchase.status==='sent')return json({status:'received',quote:'stored',needsReview:false,autoPurchase:'sent'})
    }
    return json({status:'received',quote:quantity&&total!==null?'stored':'incomplete',needsReview})
  }catch(error){return json({error:error instanceof Error?error.message:'Webhook processing failed.'},500)}
  finally{if(queueContext)EdgeRuntime.waitUntil(dispatchNextSupplierCall(queueContext.client,queueContext.organizationId,queueContext.requestId).catch(error=>console.error('Unable to continue supplier call queue',error)))}
})

function positiveNumber(value:unknown){const number=Number(value);return Number.isFinite(number)&&number>0?number:null}
function nonNegativeInteger(value:unknown){const number=Number(value);return Number.isInteger(number)&&number>=0?number:null}
function boundedInteger(value:unknown,min:number,max:number,fallback:number){const number=Number(value);return Number.isInteger(number)&&number>=min&&number<=max?number:fallback}
function computeTotal(quote:Record<string,unknown>,quantity:number|null){
  let subtotal=nonNegativeInteger(quote.subtotalCents)
  const unit=nonNegativeInteger(quote.unitPriceCents)
  if(subtotal===null&&unit!==null&&quantity!==null)subtotal=Math.round(unit*quantity)
  if(subtotal===null)return null
  return subtotal-boundedInteger(quote.discountCents,0,subtotal,0)+boundedInteger(quote.deliveryCents,0,100_000_000,0)+boundedInteger(quote.feesCents,0,100_000_000,0)+boundedInteger(quote.taxCents,0,100_000_000,0)
}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})}
