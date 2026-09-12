import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { supplierRequestedNoContact, supplierTranscript, transcriptText, verifyElevenLabsSignature, type TranscriptTurn } from '../../../src/features/voice/webhook.ts'

const quoteSchema={type:'object',additionalProperties:false,required:['quoteProvided','quantity','unit','unitPriceCents','subtotalCents','discountCents','deliveryCents','feesCents','taxCents','totalCents','available','deliveryTime','paymentDays','depositBps','isSubstitution','certifications','termsConfirmed','evidence'],properties:{quoteProvided:{type:'boolean'},quantity:{type:['number','null']},unit:{type:['string','null']},unitPriceCents:{type:['integer','null']},subtotalCents:{type:['integer','null']},discountCents:{type:['integer','null']},deliveryCents:{type:['integer','null']},feesCents:{type:['integer','null']},taxCents:{type:['integer','null']},totalCents:{type:['integer','null']},available:{type:['boolean','null']},deliveryTime:{type:['string','null']},paymentDays:{type:['integer','null']},depositBps:{type:['integer','null']},isSubstitution:{type:'boolean'},certifications:{type:'array',items:{type:'string'}},termsConfirmed:{type:'boolean'},evidence:{type:'array',items:{type:'object',additionalProperties:false,required:['field','text'],properties:{field:{type:'string'},text:{type:'string'}}}}}}

Deno.serve(async request=>{
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  const rawBody=await request.text()
  const secret=Deno.env.get('ELEVENLABS_WEBHOOK_SECRET')||''
  if(!await verifyElevenLabsSignature(rawBody,request.headers.get('ElevenLabs-Signature'),secret))return json({error:'Invalid webhook signature.'},401)
  try{
    const event=JSON.parse(rawBody) as {type:string;event_timestamp:number;data:{agent_id?:string;conversation_id?:string;failure_reason?:string;transcript?:TranscriptTurn[];metadata?:Record<string,unknown>;analysis?:Record<string,unknown>}}
    const conversationId=event.data?.conversation_id
    if(!conversationId)return json({error:'Conversation ID is missing.'},400)
    const expectedAgent=Deno.env.get('ELEVENLABS_AGENT_ID')
    if(expectedAgent&&event.data.agent_id&&event.data.agent_id!==expectedAgent)return json({error:'Unexpected agent.'},401)
    const supabaseUrl=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if(!supabaseUrl||!serviceKey)throw new Error('Supabase function secrets are incomplete.')
    const client=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:call}=await client.from('supplier_calls').select('id,owner_id,request_id,supplier_id').eq('provider_conversation_id',conversationId).single()
    if(!call)return json({error:'Conversation is not registered.'},404)
    if(event.type==='call_initiation_failure'){
      await client.from('supplier_calls').update({status:'failed',provider_error:event.data.failure_reason||'Call initiation failed',completed_at:new Date().toISOString(),provider_analysis:event.data.metadata||{}}).eq('id',call.id)
      return json({status:'received'})
    }
    if(event.type!=='post_call_transcription')return json({status:'ignored'})
    const turns=Array.isArray(event.data.transcript)?event.data.transcript.slice(0,500):[]
    const transcript=transcriptText(turns).slice(0,100_000),supplierOnly=supplierTranscript(turns).slice(0,60_000)
    const optedOut=supplierRequestedNoContact(supplierOnly)
    await client.from('supplier_calls').update({status:optedOut?'stopped':'completed',transcript,transcript_json:turns,provider_analysis:event.data.analysis||{},do_not_contact:optedOut,completed_at:new Date().toISOString()}).eq('id',call.id)
    if(optedOut)await client.from('supplier_imports').update({do_not_contact:true}).eq('id',call.supplier_id).eq('owner_id',call.owner_id)
    if(!supplierOnly.trim())return json({status:'received',quote:'no supplier speech'})
    const [{data:recovery},{data:supplier}]=await Promise.all([
      client.from('recovery_requests').select('details').eq('id',call.request_id).eq('owner_id',call.owner_id).single(),
      client.from('supplier_imports').select('name').eq('id',call.supplier_id).eq('owner_id',call.owner_id).single(),
    ])
    if(!recovery||!supplier)throw new Error('Call context was not found.')
    const apiKey=Deno.env.get('OPENAI_API_KEY')
    if(!apiKey)throw new Error('OPENAI_API_KEY is not configured.')
    const model=Deno.env.get('OPENAI_EXTRACTION_MODEL')||'gpt-5.6-luna'
    const extraction=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,input:[{role:'system',content:[{type:'input_text',text:'Extract a procurement quote using only statements made by the SUPPLIER. Agent questions, proposed targets, budgets, and read-backs are not evidence unless the supplier explicitly confirms them. Use integer cents and basis points. Use null for unstated facts. termsConfirmed is true only when quantity, final total including all fees, delivery timing, payment days, and deposit are explicit. Evidence must be short supplier excerpts.'}]},{role:'user',content:[{type:'input_text',text:`Requested requirements:\n${JSON.stringify(recovery.details)}\n\nSupplier transcript only:\n${supplierOnly}`}]}],text:{format:{type:'json_schema',name:'supplier_quote',strict:true,schema:quoteSchema}}})})
    if(!extraction.ok)throw new Error(`Quote extraction failed with ${extraction.status}.`)
    const extractionBody=await extraction.json()
    const output=extractionBody.output?.flatMap((item:{content?:unknown[]})=>item.content??[]).find((item:{type?:string})=>item.type==='output_text')?.text
    if(!output)throw new Error('Quote extraction returned no structured result.')
    const quote=JSON.parse(output) as Record<string,unknown>
    if(!quote.quoteProvided)return json({status:'received',quote:'not provided'})
    const quantity=positiveNumber(quote.quantity),total=nonNegativeInteger(quote.totalCents),computed=computeTotal(quote,quantity)
    const reconciles=total!==null&&(computed===null||computed===total)
    const needsReview=!quantity||total===null||!quote.available||!quote.deliveryTime||!quote.termsConfirmed||!reconciles
    if(quantity&&total!==null){
      const row={owner_id:call.owner_id,request_id:call.request_id,supplier_id:call.supplier_id,call_id:call.id,total_cents:total,quantity,payment_days:boundedInteger(quote.paymentDays,0,365,0),deposit_bps:boundedInteger(quote.depositBps,0,10000,0),terms_confirmed:Boolean(quote.termsConfirmed)&&reconciles,details:{...quote,supplierName:supplier.name,reconciledTotalCents:computed,providerMetadata:event.data.metadata||{}},extraction_model:model,extraction_evidence:Array.isArray(quote.evidence)?quote.evidence:[],needs_review:needsReview}
      const {error}=await client.from('supplier_quotes').upsert(row,{onConflict:'call_id'})
      if(error)throw error
      await client.from('recovery_requests').update({status:'Needs approval'}).eq('id',call.request_id).eq('owner_id',call.owner_id).in('status',['Ready to source','Calling suppliers'])
    }
    return json({status:'received',quote:quantity&&total!==null?'stored':'incomplete',needsReview})
  }catch(error){return json({error:error instanceof Error?error.message:'Webhook processing failed.'},500)}
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
