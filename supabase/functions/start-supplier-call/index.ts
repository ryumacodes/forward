import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { checkContactPolicy, normalizeAustralianPhone, outboundTrustPrompt, trustedProductIntroduction } from '../../../src/features/voice/trustPolicy.ts'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const authorization=request.headers.get('Authorization')
    if(!authorization)return json({error:'Authentication is required.'},401)
    const supabaseUrl=Deno.env.get('SUPABASE_URL'),anonKey=Deno.env.get('SUPABASE_ANON_KEY'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if(!supabaseUrl||!anonKey||!serviceKey)throw new Error('Supabase function secrets are incomplete.')
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user)return json({error:'Authentication is invalid.'},401)
    const {supplierId,requestId}=await request.json() as {supplierId:string;requestId:string}
    if(!supplierId||!requestId)return json({error:'Select a supplier and recovery.'},400)
    const serviceClient=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
    const [{data:supplier},{data:recovery},{data:verification},{data:negotiationPolicy}]=await Promise.all([
      serviceClient.from('supplier_imports').select('id,owner_id,name,abn,phone,authorised,contact_source,time_zone,do_not_contact').eq('id',supplierId).eq('owner_id',user.id).single(),
      serviceClient.from('recovery_requests').select('id,owner_id,details,status').eq('id',requestId).eq('owner_id',user.id).single(),
      serviceClient.from('supplier_verifications').select('active,name_matched,contact_confirmed,checked_at').eq('supplier_id',supplierId).eq('owner_id',user.id).single(),
      serviceClient.from('negotiation_policies').select('maximum_total_cents,minimum_payment_days,maximum_deposit_bps,maximum_counteroffers,allow_substitutions,allow_anonymous_market_anchor,auto_purchase').eq('request_id',requestId).eq('owner_id',user.id).single(),
    ])
    if(!supplier||!recovery)return json({error:'Supplier or recovery was not found in this owner workspace.'},404)
    const details=recovery.details as Record<string,unknown>
    const businessName=(Deno.env.get('CALLING_BUSINESS_NAME')||'').trim(),callbackNumber=(Deno.env.get('ELEVENLABS_CALLBACK_NUMBER')||'').trim()
    const verified=Boolean(verification?.active&&verification?.name_matched&&verification?.contact_confirmed&&fresh(verification.checked_at))
    const since=new Date(Date.now()-86_400_000).toISOString()
    const {count}=await serviceClient.from('supplier_calls').select('id',{count:'exact',head:true}).eq('owner_id',user.id).eq('supplier_id',supplier.id).gte('created_at',since).neq('status','failed')
    const localHour=Number(new Intl.DateTimeFormat('en-AU',{timeZone:supplier.time_zone,hour:'2-digit',hourCycle:'h23'}).format(new Date()))
    const contact=checkContactPolicy({abnVerified:verified,authorised:supplier.authorised,optedOut:supplier.do_not_contact,localHour,attemptsToday:count||0,callbackNumber,businessName})
    const snapshot=policySnapshot(details,negotiationPolicy,contact,supplier.time_zone)
    if(!contact.allowed){await recordDecision(serviceClient,user.id,request.id,supplier.id,'block',contact.blockers,snapshot);return json({error:`Call blocked: ${contact.blockers.join('; ')}.`,blockers:contact.blockers},409)}
    const apiKey=Deno.env.get('ELEVENLABS_API_KEY'),agentId=Deno.env.get('ELEVENLABS_AGENT_ID'),phoneNumberId=Deno.env.get('ELEVENLABS_PHONE_NUMBER_ID')
    if(!apiKey||!agentId||!phoneNumberId)throw new Error('ElevenLabs outbound telephony secrets are incomplete.')
    const toNumber=normalizeAustralianPhone(supplier.phone)
    normalizeAustralianPhone(callbackNumber)
    const item=requiredText(details.item,'product'),product=[details.requiresHalal===true?'halal':details.requiresHalal===false?'no halal requirement':'',details.freshness,details.cut,item].filter(Boolean).join(' '),unit=requiredText(details.unit,'unit'),deliveryLocation=requiredText(details.location,'delivery location'),deadline=requiredText(details.deadline,'deadline')
    const quantity=requiredNumber(details.quantity,'quantity')
    const firstMessage=trustedProductIntroduction({businessName,callbackNumber,product,quantity,unit,contactSource:supplier.contact_source})
    const prompt=outboundTrustPrompt({businessName,callbackNumber,product,quantity,unit,deliveryLocation,deadline,maximumTotalCents:snapshot.maximumTotalCents,minimumPaymentDays:snapshot.minimumPaymentDays,maximumDepositBps:snapshot.maximumDepositBps,maximumCounteroffers:snapshot.maximumCounteroffers,allowSubstitutions:snapshot.allowSubstitutions})
    const {data:call,error:callError}=await serviceClient.from('supplier_calls').insert({owner_id:user.id,request_id:request.id,supplier_id:supplier.id,status:'queued',first_message:firstMessage,callback_number:callbackNumber,policy_snapshot:snapshot}).select('id').single()
    if(callError)throw callError
    const provider=await fetch('https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call',{method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({agent_id:agentId,agent_phone_number_id:phoneNumberId,to_number:toNumber,conversation_initiation_client_data:{dynamic_variables:{supplier_name:supplier.name,business_name:businessName,product,quantity,unit,delivery_location:deliveryLocation,deadline,callback_number:callbackNumber,maximum_total_aud:(snapshot.maximumTotalCents/100).toFixed(2),minimum_payment_days:snapshot.minimumPaymentDays,maximum_deposit_percent:snapshot.maximumDepositBps/100,maximum_counteroffers:snapshot.maximumCounteroffers},conversation_config_override:{agent:{first_message:firstMessage,prompt:{prompt}}}}}})})
    const providerBody=await provider.json().catch(()=>({})) as {success?:boolean;message?:string;conversation_id?:string;sip_call_id?:string;detail?:unknown}
    if(!provider.ok||!providerBody.success||!providerBody.conversation_id){const message=providerBody.message||`ElevenLabs returned ${provider.status}`;await serviceClient.from('supplier_calls').update({status:'failed',provider_error:message}).eq('id',call.id);return json({error:message},502)}
    await serviceClient.from('supplier_calls').update({status:'initiated',provider_conversation_id:providerBody.conversation_id,cues:{sipCallId:providerBody.sip_call_id}}).eq('id',call.id)
    await recordDecision(serviceClient,user.id,request.id,supplier.id,'allow',['Live ABR evidence, owner authorisation, opt-out, hours, identity, and attempt checks passed'],snapshot)
    return json({callId:call.id,conversationId:providerBody.conversation_id,status:'initiated',firstMessage})
  }catch(error){return json({error:error instanceof Error?error.message:'Unable to start supplier call.'},500)}
})

function policySnapshot(details:Record<string,unknown>,policy:Record<string,unknown>|null,contact:ReturnType<typeof checkContactPolicy>,timeZone:string){
  return {maximumTotalCents:policy?Number(policy.maximum_total_cents):Math.round(requiredNumber(details.budget,'budget')*100),minimumPaymentDays:policy?Number(policy.minimum_payment_days):numberOr(details.minimumPaymentDays,14),maximumDepositBps:policy?Number(policy.maximum_deposit_bps):Math.round(numberOr(details.maximumDepositPercent,0)*100),maximumCounteroffers:policy?Number(policy.maximum_counteroffers):2,allowSubstitutions:policy?Boolean(policy.allow_substitutions):false,allowAnonymousMarketAnchor:policy?Boolean(policy.allow_anonymous_market_anchor):false,autoPurchase:false,firstCallTargetSeconds:120,contactPolicy:{...contact,timeZone,rollingAttemptWindowHours:24}}
}
function requiredText(value:unknown,label:string){if(typeof value!=='string'||!value.trim())throw new Error(`Recovery is missing ${label}.`);return value.trim()}
function requiredNumber(value:unknown,label:string){const number=Number(value);if(!Number.isFinite(number)||number<=0)throw new Error(`Recovery has an invalid ${label}.`);return number}
function numberOr(value:unknown,fallback:number){const number=Number(value);return Number.isFinite(number)&&number>=0?number:fallback}
function fresh(value:string|undefined){const age=Date.now()-Date.parse(value||'');return Number.isFinite(age)&&age>=0&&age<=86_400_000}
async function recordDecision(client:ReturnType<typeof createClient>,ownerId:string,requestId:string,supplierId:string,outcome:'allow'|'block',reasons:string[],snapshot:unknown){await client.from('agent_decisions').insert({owner_id:ownerId,request_id:requestId,supplier_id:supplierId,decision_type:'contact',outcome,reasons,policy_snapshot:snapshot})}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}})}
