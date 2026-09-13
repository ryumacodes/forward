import { supabase } from '../../lib/supabase/client'

export type OutboundCallResult={callId?:string;conversationId?:string;status:'calling'|'queued';queued:number;firstMessage?:string;queueItemId?:string}

export async function startSupplierCall(supplierId:string,requestId:string):Promise<OutboundCallResult>{
  return enqueueSupplierCalls([supplierId],requestId)
}

export async function enqueueSupplierCalls(supplierIds:string[],requestId:string):Promise<OutboundCallResult>{
  if(!supabase)throw new Error('Live calls need a connected Supabase workspace and ElevenLabs telephony credentials.')
  if(!requestId)throw new Error('Select a request before starting a supplier call.')
  if(!supplierIds.length)throw new Error('Select at least one authorised supplier for the queue.')
  const {data,error}=await supabase.functions.invoke('start-supplier-call',{body:{action:'enqueue',supplierIds,requestId}})
  if(error)throw new Error(`Outbound call failed: ${error.message}`)
  if(data?.error)throw new Error(data.error)
  return data as OutboundCallResult
}

export async function updateSupplierCallQueue(queueItemId:string,action:'cancel'|'retry'){
  if(!supabase)throw new Error('Live calls need a connected Supabase workspace.')
  const {data,error}=await supabase.functions.invoke('start-supplier-call',{body:{action,queueItemId}})
  if(error)throw new Error(`Queue update failed: ${error.message}`)
  if(data?.error)throw new Error(data.error)
  return data as {status:string;queueItemId:string}
}
