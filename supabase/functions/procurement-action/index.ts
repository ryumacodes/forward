import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { normalizeAustralianPhone } from '../../../src/features/voice/trustPolicy.ts'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const authorization=request.headers.get('Authorization')
    if(!authorization)return json({error:'Authentication is required.'},401)
    const supabaseUrl=Deno.env.get('SUPABASE_URL'),anonKey=Deno.env.get('SUPABASE_ANON_KEY'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if(!supabaseUrl||!anonKey||!serviceKey)throw new Error('Supabase function secrets are incomplete.')
    const client=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
    const body=await request.json() as {action:'email_brief'|'request_approval'|'issue_purchase_order'|'auto_purchase';organizationId?:string;requestId?:string;supplierId?:string;quoteId?:string}
    if(!['email_brief','request_approval','issue_purchase_order','auto_purchase'].includes(body.action))return json({error:'Unknown procurement action.'},400)
    if(!body.organizationId)return json({error:'Select an organisation workspace.'},400)
    if(body.action==='auto_purchase'){
      if(authorization!==`Bearer ${serviceKey}`)return json({error:'Service authorization is required.'},403)
      const context=await quoteContext(client,body.organizationId,body.quoteId)
      if(!context.policy.auto_purchase||!context.policy.preauthorized_by)return json({status:'approval_required'},202)
      return await issuePurchaseOrder(client,body.organizationId,context.policy.preauthorized_by,context,'preauthorized')
    }
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user)return json({error:'Authentication is invalid.'},401)
    const {data:membership}=await userClient.from('organization_members').select('organization_id').eq('organization_id',body.organizationId).eq('user_id',user.id).maybeSingle()
    if(!membership)return json({error:'Organisation membership is required.'},403)
    if(body.action==='email_brief')return await emailBrief(client,body.organizationId,body.requestId,body.supplierId)
    const context=await quoteContext(client,body.organizationId,body.quoteId)
    if(body.action==='request_approval')return await requestApproval(client,body.organizationId,context)
    return await issuePurchaseOrder(client,body.organizationId,user.id,context,'explicit')
  }catch(error){return json({error:error instanceof Error?error.message:'Procurement action failed.'},500)}
})

async function emailBrief(client:ReturnType<typeof createClient>,organizationId:string,requestId?:string,supplierId?:string){
  if(!requestId||!supplierId)return json({error:'Select a request and supplier.'},400)
  const [{data:request},{data:supplier},{data:verification}]=await Promise.all([
    client.from('procurement_requests').select('id,details').eq('id',requestId).eq('organization_id',organizationId).single(),
    client.from('suppliers').select('id,name,email,authorised,do_not_contact').eq('id',supplierId).eq('organization_id',organizationId).single(),
    client.from('supplier_verifications').select('active,name_matched,contact_confirmed,checked_at').eq('supplier_id',supplierId).eq('organization_id',organizationId).single(),
  ])
  if(!request||!supplier)return json({error:'Request or supplier was not found.'},404)
  if(!supplier.authorised||supplier.do_not_contact||!verification?.active||!verification.name_matched||!verification.contact_confirmed||!fresh(verification.checked_at))return json({error:'Email blocked: supplier authorisation, opt-out, or fresh ABR evidence failed.'},409)
  if(!supplier.email)return json({error:'Add a verified supplier email address first.'},409)
  const details=request.details as Record<string,unknown>,business=Deno.env.get('CALLING_BUSINESS_NAME')||'Your customer',callback=Deno.env.get('ELEVENLABS_CALLBACK_NUMBER')||''
  const specification=[details.requiresHalal===true?'halal':details.requiresHalal===false?'no halal requirement':'',details.freshness,details.cut,details.item].filter(Boolean).join(' ')
  const text=`Hello ${supplier.name},\n\n${business} is seeking a quote for ${details.quantity} ${details.unit} of ${specification}, delivered to ${details.location} by ${details.deadline}. Maximum approved budget: AUD ${Number(details.budget).toFixed(2)}. Requested payment terms: ${Number(details.minimumPaymentDays||0)} days; maximum deposit: ${Number(details.maximumDepositPercent||0)}%.\n\nThis is a quote enquiry only. No order has been placed. Please reply with stock, exact product or substitution, final total including delivery and fees, delivery time, payment terms and deposit. Verify the request on ${callback}.\n\nSarah — SourcePilot AI procurement assistant for ${business}`
  return await sendEmail(client,{organizationId,requestId,supplierId,purpose:'supplier_brief',to:supplier.email,subject:`Quote request: ${details.quantity} ${details.unit} ${details.item}`,text,key:`supplier-brief/${requestId}/${supplierId}`})
}

async function requestApproval(client:ReturnType<typeof createClient>,organizationId:string,context:Awaited<ReturnType<typeof quoteContext>>){
  const blockers=purchaseBlockers(context)
  if(blockers.length)return json({error:`Approval request blocked: ${blockers.join('; ')}.`,blockers},409)
  const phone=normalizeAustralianPhone(Deno.env.get('OWNER_APPROVAL_PHONE')||'')
  const base=(Deno.env.get('APP_BASE_URL')||'').replace(/\/$/,'')
  if(!base.startsWith('https://'))return json({error:'APP_BASE_URL must be the production HTTPS URL before approval SMS can be sent.'},409)
  const details=context.request.details as Record<string,unknown>
  const message=`SourcePilot approval needed: ${context.supplier.name} quoted AUD ${(Number(context.quote.total_cents)/100).toFixed(2)} for ${context.quote.quantity} ${details.unit} ${details.item}. No order placed. Review: ${base}/?request=${context.request.id}`
  return await sendSms(client,{organizationId,requestId:context.request.id,supplierId:context.supplier.id,quoteId:context.quote.id,to:phone,body:message,key:`owner-approval/${context.quote.id}`})
}

async function issuePurchaseOrder(client:ReturnType<typeof createClient>,organizationId:string,approvedBy:string,context:Awaited<ReturnType<typeof quoteContext>>,authorizationMode:'explicit'|'preauthorized'){
  const blockers=purchaseBlockers(context)
  if(blockers.length){await client.from('agent_decisions').insert({organization_id:organizationId,request_id:context.request.id,supplier_id:context.supplier.id,decision_type:'purchase',outcome:'block',reasons:blockers,policy_snapshot:context.policy||{}});return json({error:`Purchase order blocked: ${blockers.join('; ')}.`,blockers},409)}
  const proposedId=crypto.randomUUID(),proposedNumber=`SP-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${proposedId.slice(0,8).toUpperCase()}`
  const terms={quote:context.quote.details,quantity:context.quote.quantity,totalCents:Number(context.quote.total_cents),paymentDays:context.quote.payment_days,depositBps:context.quote.deposit_bps,noAutomaticPayment:true}
  const {data:claim,error:claimError}=await client.rpc('claim_purchase_order',{p_organization_id:organizationId,p_quote_id:context.quote.id,p_order_id:proposedId,p_po_number:proposedNumber,p_terms:terms,p_approved_by:approvedBy,p_authorization_mode:authorizationMode}).single()
  if(claimError)throw claimError
  const order=claim as {id:string;po_number:string;status:string;provider_email_id?:string}
  if(order.status==='sent')return json({status:order.status,purchaseOrder:{id:order.id,poNumber:order.po_number,status:order.status},providerId:order.provider_email_id})
  const id=order.id,poNumber=order.po_number
  const details=context.request.details as Record<string,unknown>,business=Deno.env.get('CALLING_BUSINESS_NAME')||'Customer'
  const specification=[details.requiresHalal===true?'halal':details.requiresHalal===false?'no halal requirement':'',details.freshness,details.cut,details.item].filter(Boolean).join(' ')
  const approvalText=authorizationMode==='preauthorized'?'issued under the owner’s stored request-specific pre-authorization':'explicitly approved by the owner'
  const text=`PURCHASE ORDER ${poNumber}\n\nBuyer: ${business}\nSupplier: ${context.supplier.name}\nItem: ${specification}\nQuantity: ${context.quote.quantity} ${details.unit}\nDelivery: ${details.location} by ${details.deadline}\nTotal: AUD ${(Number(context.quote.total_cents)/100).toFixed(2)} including recorded fees\nPayment: ${context.quote.payment_days} days from invoice\nDeposit: ${context.quote.deposit_bps/100}%\n\nThis purchase order was ${approvalText}. Please reply to confirm acceptance and delivery. This document does not initiate an automatic payment.`
  const sent=await sendEmail(client,{organizationId,requestId:context.request.id,supplierId:context.supplier.id,quoteId:context.quote.id,purpose:'purchase_order',to:context.supplier.email,subject:`Purchase order ${poNumber}`,text,key:`purchase-order/${context.quote.id}`})
  const payload=await sent.clone().json()
  if(sent.ok&&payload.status==='sent'){
    await client.from('purchase_orders').update({status:'sent',provider_email_id:payload.providerId}).eq('id',id)
    await client.from('procurement_requests').update({status:'Approved'}).eq('id',context.request.id).eq('organization_id',organizationId)
    await client.from('supplier_call_queue').update({status:'cancelled',last_error:'Request fulfilled by purchase order',lease_expires_at:null,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('request_id',context.request.id).in('status',['queued','processing','blocked','failed','uncertain'])
    await client.from('agent_decisions').insert({organization_id:organizationId,request_id:context.request.id,supplier_id:context.supplier.id,decision_type:'purchase',outcome:'allow',reasons:[authorizationMode==='preauthorized'?'Stored request pre-authorization and every deterministic purchase rule passed':'Explicit owner action and every deterministic purchase rule passed'],policy_snapshot:context.policy||{}})
    return json({status:'sent',providerId:payload.providerId,purchaseOrder:{id,poNumber,status:'sent'}})
  }
  return sent
}

async function quoteContext(client:ReturnType<typeof createClient>,organizationId:string,quoteId?:string){
  if(!quoteId)throw new Error('Select a supplier quote.')
  const {data:quote}=await client.from('supplier_quotes').select('*').eq('id',quoteId).eq('organization_id',organizationId).single()
  if(!quote)throw new Error('Quote was not found in this organisation.')
  const [{data:request},{data:supplier},{data:verification},{data:policy}]=await Promise.all([
    client.from('procurement_requests').select('id,details,status').eq('id',quote.request_id).eq('organization_id',organizationId).single(),
    client.from('suppliers').select('id,name,email,authorised,do_not_contact').eq('id',quote.supplier_id).eq('organization_id',organizationId).single(),
    client.from('supplier_verifications').select('active,name_matched,contact_confirmed,checked_at').eq('supplier_id',quote.supplier_id).eq('organization_id',organizationId).single(),
    client.from('negotiation_policies').select('*').eq('request_id',quote.request_id).eq('organization_id',organizationId).single(),
  ])
  if(!request||!supplier||!verification||!policy)throw new Error('Quote approval context is incomplete.')
  return {quote,request,supplier,verification,policy}
}

function purchaseBlockers({quote,request,supplier,verification,policy}:Awaited<ReturnType<typeof quoteContext>>){
  const blockers:string[]=[],details=request.details as Record<string,unknown>,quoteDetails=quote.details as Record<string,unknown>
  if(!supplier.authorised)blockers.push('Supplier is not owner-authorised')
  if(supplier.do_not_contact)blockers.push('Supplier opted out')
  if(!supplier.email)blockers.push('Supplier email is missing')
  if(!verification.active||!verification.name_matched||!verification.contact_confirmed||!fresh(verification.checked_at))blockers.push('Fresh ABR evidence is missing')
  if(!quote.terms_confirmed||quote.needs_review)blockers.push('Quote terms need human review')
  if(Number(quote.total_cents)>Number(policy.maximum_total_cents))blockers.push('Total exceeds the owner limit')
  if(Number(quote.quantity)<Number(details.quantity))blockers.push('Quantity is insufficient')
  if(quote.payment_days<policy.minimum_payment_days)blockers.push('Payment terms are too short')
  if(quote.deposit_bps>policy.maximum_deposit_bps)blockers.push('Deposit exceeds the owner limit')
  if(quoteDetails.available!==true)blockers.push('Availability is not confirmed')
  if(quoteDetails.specificationConfirmed!==true)blockers.push('Product specification is not confirmed')
  if(details.requiresHalal===true&&!Array.isArray(quoteDetails.certifications))blockers.push('Halal certification evidence is missing')
  if(details.requiresHalal===true&&Array.isArray(quoteDetails.certifications)&&!quoteDetails.certifications.some(value=>/halal/i.test(String(value))))blockers.push('Halal certification evidence is missing')
  if(quoteDetails.isSubstitution&&!policy.allow_substitutions)blockers.push('Substitution is not allowed')
  const delivery=Date.parse(String(quoteDetails.deliveryTime||'')),deadline=Date.parse(String(details.deadline||''))
  if(!Number.isFinite(delivery)||!Number.isFinite(deadline)||delivery>deadline)blockers.push('Delivery misses or lacks the deadline')
  return blockers
}

async function createEvent(client:ReturnType<typeof createClient>,row:Record<string,unknown>){
  const {data,error}=await client.from('communication_events').insert(row).select('id,status,provider_id').single()
  if(!error)return {event:data,created:true}
  if(error.code!=='23505')throw error
  const {data:existing}=await client.from('communication_events').select('id,status,provider_id').eq('organization_id',row.organization_id).eq('idempotency_key',row.idempotency_key).single()
  return {event:existing,created:false}
}

async function sendEmail(client:ReturnType<typeof createClient>,input:{organizationId:string;requestId:string;supplierId:string;quoteId?:string;purpose:'supplier_brief'|'purchase_order';to:string;subject:string;text:string;key:string}){
  const apiKey=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('RESEND_FROM_EMAIL')
  if(!apiKey||!from)throw new Error('Resend email secrets are incomplete.')
  const created=await createEvent(client,{organization_id:input.organizationId,request_id:input.requestId,supplier_id:input.supplierId,quote_id:input.quoteId||null,channel:'email',purpose:input.purpose,recipient:input.to,status:'queued',payload:{subject:input.subject,text:input.text},idempotency_key:input.key})
  if(!created.created&&created.event.status!=='failed')return json({status:created.event.status,providerId:created.event.provider_id})
  if(!created.created)await client.from('communication_events').update({status:'queued',provider_error:null}).eq('id',created.event.id)
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':input.key},body:JSON.stringify({from,to:[input.to],subject:input.subject,text:input.text})})
  const body=await response.json().catch(()=>({})) as {id?:string;message?:string}
  if(!response.ok||!body.id){await client.from('communication_events').update({status:'failed',provider_error:body.message||`Resend returned ${response.status}`}).eq('id',created.event.id);return json({error:body.message||'Email provider failed.'},502)}
  await client.from('communication_events').update({status:'sent',provider_id:body.id,sent_at:new Date().toISOString()}).eq('id',created.event.id)
  return json({status:'sent',providerId:body.id})
}

async function sendSms(client:ReturnType<typeof createClient>,input:{organizationId:string;requestId:string;supplierId:string;quoteId:string;to:string;body:string;key:string}){
  const sid=Deno.env.get('TWILIO_ACCOUNT_SID'),token=Deno.env.get('TWILIO_AUTH_TOKEN'),from=Deno.env.get('TWILIO_SMS_FROM')
  if(!sid||!token||!from)throw new Error('Twilio SMS secrets are incomplete.')
  const created=await createEvent(client,{organization_id:input.organizationId,request_id:input.requestId,supplier_id:input.supplierId,quote_id:input.quoteId,channel:'sms',purpose:'owner_approval',recipient:input.to,status:'queued',payload:{body:input.body},idempotency_key:input.key})
  if(!created.created)return json({status:created.event.status,providerId:created.event.provider_id})
  const form=new URLSearchParams({To:input.to,From:normalizeAustralianPhone(from),Body:input.body})
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${btoa(`${sid}:${token}`)}`,'Content-Type':'application/x-www-form-urlencoded'},body:form})
  const body=await response.json().catch(()=>({})) as {sid?:string;status?:string;message?:string}
  if(!response.ok||!body.sid){await client.from('communication_events').update({status:'failed',provider_error:body.message||`Twilio returned ${response.status}`}).eq('id',created.event.id);return json({error:body.message||'SMS provider failed.'},502)}
  await client.from('communication_events').update({status:'sent',provider_id:body.sid,sent_at:new Date().toISOString()}).eq('id',created.event.id)
  return json({status:body.status||'sent',providerId:body.sid})
}

function fresh(value:string){const age=Date.now()-Date.parse(value);return Number.isFinite(age)&&age>=0&&age<=86_400_000}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}})}
