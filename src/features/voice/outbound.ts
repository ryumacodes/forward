import { supabase } from '../../lib/supabase/client'

export type OutboundCallResult={callId:string;conversationId:string;status:'initiated';firstMessage:string}

export async function startSupplierCall(supplierId:string,requestId:string):Promise<OutboundCallResult>{
  if(!supabase)throw new Error('Live calls need a connected Supabase workspace and ElevenLabs telephony credentials.')
  if(!requestId)throw new Error('Select a recovery before starting a supplier call.')
  const {data,error}=await supabase.functions.invoke('start-supplier-call',{body:{supplierId,requestId}})
  if(error)throw new Error(`Outbound call failed: ${error.message}`)
  if(data?.error)throw new Error(data.error)
  if(!data?.conversationId)throw new Error('The call provider did not return a conversation ID.')
  return data as OutboundCallResult
}
