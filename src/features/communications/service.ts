import { supabase } from '../../lib/supabase/client'

export type ProcurementAction='email_brief'|'request_approval'|'issue_purchase_order'
export async function runProcurementAction(action:ProcurementAction,input:{requestId?:string;supplierId?:string;quoteId?:string}){
  if(!supabase)throw new Error('Live messages and purchase orders need a connected Supabase workspace.')
  const {data,error}=await supabase.functions.invoke('procurement-action',{body:{action,...input}})
  if(error)throw new Error(`Action failed: ${error.message}`)
  if(data?.error)throw new Error(data.error)
  return data as {status:string;providerId?:string;purchaseOrder?:{id:string;poNumber:string;status:string}}
}
