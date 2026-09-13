import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { checkContactPolicy, normalizeAustralianPhone, outboundTrustPrompt, trustedProductIntroduction } from '../../../src/features/voice/trustPolicy.ts'

export type QueueJob={id:string;organization_id:string;request_id:string;supplier_id:string;attempt_count:number;max_attempts:number}
export type DispatchedCall={callId:string;conversationId:string;status:'initiated';firstMessage:string;queueItemId:string}

export async function dispatchNextSupplierCall(client:SupabaseClient,organizationId:string,requestId:string):Promise<DispatchedCall|null>{
  for(let skipped=0;skipped<20;skipped+=1){
    const workerId=crypto.randomUUID()
    const {data,error}=await client.rpc('claim_next_supplier_call',{p_organization_id:organizationId,p_request_id:requestId,p_worker_id:workerId,p_lease_seconds:120})
    if(error)throw error
    const job=(Array.isArray(data)?data[0]:data) as QueueJob|undefined
    if(!job)return null
    try{
      const result=await dispatchJob(client,job)
      if(result)return result
    }catch(error){
      await releaseAfterFailure(client,job,error instanceof Error?error.message:'Call dispatch failed',true)
    }
  }
  return null
}

async function dispatchJob(client:SupabaseClient,job:QueueJob):Promise<DispatchedCall|null>{
  const [{data:supplier},{data:request},{data:verification},{data:policy}]=await Promise.all([
    client.from('suppliers').select('id,organization_id,name,abn,phone,authorised,contact_source,time_zone,do_not_contact').eq('id',job.supplier_id).eq('organization_id',job.organization_id).single(),
    client.from('procurement_requests').select('id,organization_id,details,status').eq('id',job.request_id).eq('organization_id',job.organization_id).single(),
    client.from('supplier_verifications').select('active,name_matched,contact_confirmed,checked_at').eq('supplier_id',job.supplier_id).eq('organization_id',job.organization_id).single(),
    client.from('negotiation_policies').select('maximum_total_cents,minimum_payment_days,maximum_deposit_bps,maximum_counteroffers,allow_substitutions,allow_anonymous_market_anchor,auto_purchase').eq('request_id',job.request_id).eq('organization_id',job.organization_id).single(),
  ])
  if(!supplier||!request){await blockJob(client,job,'Supplier or request no longer exists');return null}
  if(request.status==='Approved'){await cancelRequestQueue(client,job.organization_id,job.request_id);return null}
  const details=request.details as Record<string,unknown>
  const businessName=(Deno.env.get('CALLING_BUSINESS_NAME')||'').trim(),callbackNumber=(Deno.env.get('ELEVENLABS_CALLBACK_NUMBER')||'').trim()
  const verified=Boolean(verification?.active&&verification?.name_matched&&verification?.contact_confirmed&&fresh(verification.checked_at))
  const since=new Date(Date.now()-86_400_000).toISOString()
  const {count}=await client.from('supplier_calls').select('id',{count:'exact',head:true}).eq('organization_id',job.organization_id).eq('supplier_id',supplier.id).gte('created_at',since).neq('status','failed')
  let localHour=0
  try{localHour=Number(new Intl.DateTimeFormat('en-AU',{timeZone:supplier.time_zone,hour:'2-digit',hourCycle:'h23'}).format(new Date()))}
  catch{await blockJob(client,job,'Supplier time zone is invalid');return null}
  const contact=checkContactPolicy({abnVerified:verified,authorised:supplier.authorised,optedOut:supplier.do_not_contact,localHour,attemptsToday:count||0,callbackNumber,businessName})
  const snapshot=policySnapshot(details,policy,contact,supplier.time_zone)
  if(!contact.allowed){
    await Promise.all([
      blockJob(client,job,contact.blockers.join('; ')),
      recordDecision(client,job.organization_id,request.id,supplier.id,'block',contact.blockers,snapshot),
    ])
    return null
  }
  const apiKey=Deno.env.get('ELEVENLABS_API_KEY'),agentId=Deno.env.get('ELEVENLABS_AGENT_ID'),phoneNumberId=Deno.env.get('ELEVENLABS_PHONE_NUMBER_ID')
  if(!apiKey||!agentId||!phoneNumberId)throw new Error('ElevenLabs outbound telephony secrets are incomplete.')
  const toNumber=normalizeAustralianPhone(supplier.phone)
  normalizeAustralianPhone(callbackNumber)
  const item=requiredText(details.item,'product'),product=[details.requiresHalal===true?'halal':details.requiresHalal===false?'no halal requirement':'',details.freshness,details.cut,item].filter(Boolean).join(' '),unit=requiredText(details.unit,'unit'),deliveryLocation=requiredText(details.location,'delivery location'),deadline=requiredText(details.deadline,'deadline')
  const quantity=requiredNumber(details.quantity,'quantity')
  const firstMessage=trustedProductIntroduction({businessName,callbackNumber,product,quantity,unit,contactSource:supplier.contact_source})
  const prompt=outboundTrustPrompt({businessName,callbackNumber,product,quantity,unit,deliveryLocation,deadline,maximumTotalCents:snapshot.maximumTotalCents,minimumPaymentDays:snapshot.minimumPaymentDays,maximumDepositBps:snapshot.maximumDepositBps,maximumCounteroffers:snapshot.maximumCounteroffers,allowSubstitutions:snapshot.allowSubstitutions})
  const {data:call,error:callError}=await client.from('supplier_calls').insert({organization_id:job.organization_id,request_id:request.id,supplier_id:supplier.id,queue_item_id:job.id,status:'queued',first_message:firstMessage,callback_number:callbackNumber,policy_snapshot:snapshot}).select('id').single()
  if(callError)throw callError
  await client.from('supplier_call_queue').update({call_id:call.id,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','processing')
  const provider=await fetch('https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call',{method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({agent_id:agentId,agent_phone_number_id:phoneNumberId,to_number:toNumber,conversation_initiation_client_data:{dynamic_variables:{supplier_name:supplier.name,business_name:businessName,product,quantity,unit,delivery_location:deliveryLocation,deadline,callback_number:callbackNumber,maximum_total_aud:(snapshot.maximumTotalCents/100).toFixed(2),minimum_payment_days:snapshot.minimumPaymentDays,maximum_deposit_percent:snapshot.maximumDepositBps/100,maximum_counteroffers:snapshot.maximumCounteroffers},conversation_config_override:{agent:{first_message:firstMessage,prompt:{prompt}}}}}})})
  const providerBody=await provider.json().catch(()=>({})) as {success?:boolean;message?:string;conversation_id?:string;sip_call_id?:string}
  if(!provider.ok||!providerBody.success||!providerBody.conversation_id){
    const message=providerBody.message||`ElevenLabs returned ${provider.status}`
    await client.from('supplier_calls').update({status:'failed',provider_error:message,completed_at:new Date().toISOString()}).eq('id',call.id)
    await releaseAfterFailure(client,job,message,true)
    return null
  }
  const now=new Date().toISOString()
  const [callUpdate,jobUpdate]=await Promise.all([
    client.from('supplier_calls').update({status:'initiated',provider_conversation_id:providerBody.conversation_id,cues:{sipCallId:providerBody.sip_call_id}}).eq('id',call.id),
    client.from('supplier_call_queue').update({status:'calling',lease_expires_at:new Date(Date.now()+20*60_000).toISOString(),worker_id:null,updated_at:now}).eq('id',job.id).eq('status','processing'),
  ])
  if(callUpdate.error||jobUpdate.error){
    await client.from('supplier_call_queue').update({status:'uncertain',last_error:'Provider accepted the call but local state could not be finalised',lease_expires_at:null,worker_id:null,completed_at:now,updated_at:now}).eq('id',job.id)
    throw callUpdate.error||jobUpdate.error
  }
  await recordDecision(client,job.organization_id,request.id,supplier.id,'allow',['Queued outreach passed live ABR, owner authorisation, opt-out, hours, identity, and attempt checks'],snapshot)
  return {callId:call.id,conversationId:providerBody.conversation_id,status:'initiated',firstMessage,queueItemId:job.id}
}

export async function completeQueueItem(client:SupabaseClient,queueItemId:string|undefined,status:'completed'|'failed'|'cancelled',error?:string){
  if(!queueItemId)return
  const now=new Date().toISOString()
  await client.from('supplier_call_queue').update({status,last_error:error||null,lease_expires_at:null,worker_id:null,completed_at:now,updated_at:now}).eq('id',queueItemId).in('status',['processing','calling'])
}

export async function cancelRequestQueue(client:SupabaseClient,organizationId:string,requestId:string){
  const now=new Date().toISOString()
  await client.from('supplier_call_queue').update({status:'cancelled',completed_at:now,updated_at:now,last_error:'Request is already complete'}).eq('organization_id',organizationId).eq('request_id',requestId).in('status',['queued','processing'])
}

async function blockJob(client:SupabaseClient,job:QueueJob,message:string){
  const now=new Date().toISOString()
  await client.from('supplier_call_queue').update({status:'blocked',last_error:message,lease_expires_at:null,worker_id:null,completed_at:now,updated_at:now}).eq('id',job.id).eq('status','processing')
}

async function releaseAfterFailure(client:SupabaseClient,job:QueueJob,message:string,retry:boolean){
  const canRetry=retry&&job.attempt_count<job.max_attempts,now=new Date().toISOString()
  await client.from('supplier_call_queue').update({status:canRetry?'queued':'failed',available_at:now,last_error:message,lease_expires_at:null,worker_id:null,completed_at:canRetry?null:now,updated_at:now}).eq('id',job.id).eq('status','processing')
}

function policySnapshot(details:Record<string,unknown>,policy:Record<string,unknown>|null,contact:ReturnType<typeof checkContactPolicy>,timeZone:string){
  return {maximumTotalCents:policy?Number(policy.maximum_total_cents):Math.round(requiredNumber(details.budget,'budget')*100),minimumPaymentDays:policy?Number(policy.minimum_payment_days):numberOr(details.minimumPaymentDays,14),maximumDepositBps:policy?Number(policy.maximum_deposit_bps):Math.round(numberOr(details.maximumDepositPercent,0)*100),maximumCounteroffers:policy?Number(policy.maximum_counteroffers):2,allowSubstitutions:policy?Boolean(policy.allow_substitutions):false,allowAnonymousMarketAnchor:policy?Boolean(policy.allow_anonymous_market_anchor):false,autoPurchase:policy?Boolean(policy.auto_purchase):false,firstCallTargetSeconds:120,contactPolicy:{...contact,timeZone,rollingAttemptWindowHours:24}}
}
function requiredText(value:unknown,label:string){if(typeof value!=='string'||!value.trim())throw new Error(`Request is missing ${label}.`);return value.trim()}
function requiredNumber(value:unknown,label:string){const number=Number(value);if(!Number.isFinite(number)||number<=0)throw new Error(`Request has an invalid ${label}.`);return number}
function numberOr(value:unknown,fallback:number){const number=Number(value);return Number.isFinite(number)&&number>=0?number:fallback}
function fresh(value:string|undefined){const age=Date.now()-Date.parse(value||'');return Number.isFinite(age)&&age>=0&&age<=86_400_000}
async function recordDecision(client:SupabaseClient,organizationId:string,requestId:string,supplierId:string,outcome:'allow'|'block',reasons:string[],snapshot:unknown){await client.from('agent_decisions').insert({organization_id:organizationId,request_id:requestId,supplier_id:supplierId,decision_type:'contact',outcome,reasons,policy_snapshot:snapshot})}
