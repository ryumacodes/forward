import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { normalizeAustralianPhone } from '../../../src/features/voice/trustPolicy.ts'

type FallbackInput={organizationId:string;requestId:string;supplierId:string;quoteId:string;phone:string;email:string;summary:string;reason:string}

export async function sendMissedOwnerCallFallback(client:SupabaseClient,input:FallbackInput){
  const results=await Promise.allSettled([
    sendSms(client,input),
    sendAgentMail(client,input),
  ])
  results.forEach((result,index)=>{if(result.status==='rejected')console.error(index===0?'Missed-call SMS failed':'Missed-call email failed',result.reason)})
  return {sms:results[0].status,email:results[1].status}
}

async function sendSms(client:SupabaseClient,input:FallbackInput){
  const sid=Deno.env.get('TWILIO_ACCOUNT_SID'),token=Deno.env.get('TWILIO_AUTH_TOKEN'),from=Deno.env.get('TWILIO_SMS_FROM')
  if(!sid||!token||!from)throw new Error('Twilio SMS secrets are incomplete.')
  const message=`We couldn't reach you by phone. ${input.summary}`
  const event=await claimEvent(client,{organization_id:input.organizationId,request_id:input.requestId,supplier_id:input.supplierId,quote_id:input.quoteId,channel:'sms',purpose:'owner_completion',recipient:normalizeAustralianPhone(input.phone),status:'queued',payload:{body:message,reason:input.reason},idempotency_key:`owner-missed-call-sms/${input.quoteId}`})
  if(!event)return
  const form=new URLSearchParams({To:normalizeAustralianPhone(input.phone),From:normalizeAustralianPhone(from),Body:message})
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${btoa(`${sid}:${token}`)}`,'Content-Type':'application/x-www-form-urlencoded'},body:form})
  const body=await response.json().catch(()=>({})) as {sid?:string;message?:string}
  if(!response.ok||!body.sid){const message=body.message||`Twilio returned ${response.status}`;await failEvent(client,event.id,message);throw new Error(message)}
  await markSent(client,event.id,body.sid)
}

async function sendAgentMail(client:SupabaseClient,input:FallbackInput){
  const apiKey=Deno.env.get('AGENTMAIL_API_KEY'),inboxId=Deno.env.get('AGENTMAIL_INBOX_ID')
  if(!apiKey||!inboxId)throw new Error('AgentMail secrets are incomplete.')
  if(!validEmail(input.email))throw new Error('The owner notification email is missing or invalid.')
  const message=`We couldn't reach you by phone.\n\n${input.summary}`
  const event=await claimEvent(client,{organization_id:input.organizationId,request_id:input.requestId,supplier_id:input.supplierId,quote_id:input.quoteId,channel:'email',purpose:'owner_completion',recipient:input.email,status:'queued',payload:{subject:'SourcePilot purchase order update',text:message,reason:input.reason},idempotency_key:`owner-missed-call-email/${input.quoteId}`})
  if(!event)return
  const response=await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({to:input.email,subject:'SourcePilot purchase order update',text:message})})
  const body=await response.json().catch(()=>({})) as {message_id?:string;message?:string;detail?:string}
  if(!response.ok||!body.message_id){const message=body.message||body.detail||`AgentMail returned ${response.status}`;await failEvent(client,event.id,message);throw new Error(message)}
  await markSent(client,event.id,body.message_id)
}

async function claimEvent(client:SupabaseClient,row:Record<string,unknown>){
  const {data,error}=await client.from('communication_events').insert(row).select('id').single()
  if(!error)return data as {id:string}
  if(error.code==='23505')return null
  throw error
}

async function markSent(client:SupabaseClient,id:string,providerId:string){
  const {error}=await client.from('communication_events').update({status:'sent',provider_id:providerId,sent_at:new Date().toISOString()}).eq('id',id)
  if(error)throw error
}

async function failEvent(client:SupabaseClient,id:string,message:string){
  await client.from('communication_events').update({status:'failed',provider_error:message}).eq('id',id)
}

function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
