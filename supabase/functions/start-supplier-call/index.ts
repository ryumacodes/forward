import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { dispatchNextSupplierCall } from '../_shared/call-queue.ts'

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
    const body=await request.json() as {supplierId?:string;supplierIds?:string[];requestId?:string;action?:'enqueue'|'cancel'|'retry';queueItemId?:string}
    const serviceClient=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})

    if(body.action==='cancel'||body.action==='retry'){
      if(!body.queueItemId)return json({error:'Select a queue item.'},400)
      const {data:item}=await userClient.from('supplier_call_queue').select('id,organization_id,request_id,status,attempt_count,max_attempts').eq('id',body.queueItemId).single()
      if(!item)return json({error:'Queue item was not found in this organisation.'},404)
      const now=new Date().toISOString()
      if(body.action==='cancel'){
        if(item.status!=='queued')return json({error:'Only queued calls can be cancelled. A call that is already starting must finish or be stopped with the provider.'},409)
        await serviceClient.from('supplier_call_queue').update({status:'cancelled',completed_at:now,lease_expires_at:null,worker_id:null,updated_at:now,last_error:'Cancelled by an organisation member'}).eq('id',item.id).eq('status','queued')
        return json({status:'cancelled',queueItemId:item.id})
      }
      if(!['blocked','failed','uncertain'].includes(item.status))return json({error:'Only blocked or failed queue items can be retried.'},409)
      await serviceClient.from('supplier_call_queue').update({status:'queued',attempt_count:Math.min(Number(item.attempt_count),Number(item.max_attempts)-1),available_at:now,claimed_at:null,lease_expires_at:null,worker_id:null,completed_at:null,last_error:null,updated_at:now}).eq('id',item.id)
      await serviceClient.from('procurement_requests').update({status:'Calling suppliers'}).eq('id',item.request_id).eq('organization_id',item.organization_id).neq('status','Approved')
      const activeCall=await dispatchNextSupplierCall(serviceClient,item.organization_id,item.request_id)
      return json({status:activeCall?'calling':'queued',queueItemId:item.id,activeCall})
    }

    const requestId=body.requestId?.trim(),supplierIds=[...new Set([...(body.supplierIds||[]),...(body.supplierId?[body.supplierId]:[])].filter(Boolean))].slice(0,20)
    if(!requestId||!supplierIds.length)return json({error:'Select a procurement request and at least one supplier.'},400)
    const [{data:procurementRequest},{data:suppliers}]=await Promise.all([
      userClient.from('procurement_requests').select('id,organization_id,status').eq('id',requestId).single(),
      userClient.from('suppliers').select('id,organization_id').in('id',supplierIds),
    ])
    if(!procurementRequest)return json({error:'Procurement request was not found in this organisation.'},404)
    if(procurementRequest.status==='Approved')return json({error:'This request is already complete.'},409)
    const allowed=new Set((suppliers||[]).filter(item=>item.organization_id===procurementRequest.organization_id).map(item=>item.id))
    if(allowed.size!==supplierIds.length)return json({error:'One or more suppliers were not found in this organisation.'},404)
    const rows=supplierIds.map((supplierId,index)=>({organization_id:procurementRequest.organization_id,request_id:requestId,supplier_id:supplierId,priority:(index+1)*100,created_by:user.id}))
    const {error:queueError}=await serviceClient.from('supplier_call_queue').upsert(rows,{onConflict:'organization_id,request_id,supplier_id',ignoreDuplicates:true})
    if(queueError)throw queueError
    await serviceClient.from('procurement_requests').update({status:'Calling suppliers'}).eq('id',requestId).eq('organization_id',procurementRequest.organization_id).eq('status','Ready to source')
    const activeCall=await dispatchNextSupplierCall(serviceClient,procurementRequest.organization_id,requestId)
    const {data:queue}=await userClient.from('supplier_call_queue').select('id,supplier_id,status,priority,attempt_count,max_attempts,available_at,call_id,last_error,created_at,updated_at').eq('request_id',requestId).order('priority').order('created_at')
    return json({status:activeCall?'calling':'queued',queued:supplierIds.length,queue:queue||[],activeCall,...(activeCall||{})})
  }catch(error){return json({error:error instanceof Error?error.message:'Unable to manage the supplier call queue.'},500)}
})

function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}})}
