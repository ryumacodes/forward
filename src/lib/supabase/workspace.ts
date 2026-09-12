import { supabase } from './client'
import type { Recovery } from '../../features/recoveries/data'
import type { Offer } from '../../features/recoveries/data'
import type { ImportedSupplier } from '../../features/suppliers/verification'
export async function loadWorkspace() {
  if(!supabase) throw new Error('Supabase is not configured.')
  const [requests,suppliers,quotes,calls] = await Promise.all([
    supabase.from('recovery_requests').select('id,details,status').order('created_at',{ascending:false}),
    supabase.from('supplier_imports').select('id,name,abn,phone,created_at,authorised,supplier_verifications(active,legal_name,gst_registered,name_matched,contact_confirmed,checked_at)').order('created_at',{ascending:false}),
    supabase.from('supplier_quotes').select('id,request_id,supplier_id,call_id,total_cents,quantity,payment_days,deposit_bps,terms_confirmed,details,needs_review').order('created_at',{ascending:false}),
    supabase.from('supplier_calls').select('id,transcript_json,created_at,completed_at').order('created_at',{ascending:false}),
  ])
  if(requests.error) throw requests.error
  if(suppliers.error) throw suppliers.error
  if(quotes.error) throw quotes.error
  if(calls.error) throw calls.error
  const supplierMap=new Map(suppliers.data.map(row=>[row.id,row]))
  const requestMap=new Map(requests.data.map(row=>[row.id,row]))
  const callMap=new Map(calls.data.map(row=>[row.id,row]))
  return {
    recoveries: requests.data.map(row=>({...row.details,id:row.id,status:row.status}) as Recovery),
    suppliers: suppliers.data.map(row=>{
      const joined=Array.isArray(row.supplier_verifications)?row.supplier_verifications[0]:row.supplier_verifications
      const verification=joined?{active:joined.active,legalName:joined.legal_name,gstRegistered:Boolean(joined.gst_registered),businessNames:[],state:null,postcode:null,entityType:null,statusEffectiveFrom:null,nameMatched:joined.name_matched,contactConfirmed:joined.contact_confirmed,checkedAt:joined.checked_at,source:'ABR' as const,evidenceUrl:`https://abr.business.gov.au/ABN/View?abn=${row.abn}`} : undefined
      const status:ImportedSupplier['status']=row.authorised?'Authorised':verification?(verification.active&&verification.nameMatched?'Verified — owner review':'Registry review required'):'Awaiting registry check'
      return {id:row.id,name:row.name,abn:row.abn,phone:row.phone,importedAt:row.created_at,status,authorised:row.authorised,verification} as ImportedSupplier
    }),
    offers: quotes.data.map(row=>{
      const supplier=supplierMap.get(row.supplier_id) as unknown as {name:string;authorised:boolean;supplier_verifications:{active:boolean;checked_at:string}[]|{active:boolean;checked_at:string}|null}|undefined,request=requestMap.get(row.request_id),call=callMap.get(row.call_id)
      const details=(row.details||{}) as Record<string,unknown>,turns=Array.isArray(call?.transcript_json)?call.transcript_json as {role:'agent'|'user';message:string;time_in_call_secs?:number}[]:[]
      const seconds=turns.reduce((max,turn)=>Math.max(max,Number(turn.time_in_call_secs)||0),0),delivery=String(details.deliveryTime||'Delivery timing needs review')
      const checkedAt=Array.isArray(supplier?.supplier_verifications)?supplier.supplier_verifications[0]?.checked_at:supplier?.supplier_verifications?.checked_at
      const active=Array.isArray(supplier?.supplier_verifications)?supplier.supplier_verifications[0]?.active:supplier?.supplier_verifications?.active
      const deadline=Date.parse(String((request?.details as Record<string,unknown>|undefined)?.deadline||'')),deliveryTime=Date.parse(delivery)
      const fees=Number(details.feesCents||0)/100,total=Number(row.total_cents)/100
      return {id:row.id,requestId:row.request_id,name:supplier?.name||'Unknown supplier',initials:(supplier?.name||'US').split(/\s+/).slice(0,2).map((part:string)=>part[0]).join('').toUpperCase(),quantity:Number(row.quantity),price:Math.max(0,total-fees),delivery,onTime:Number.isFinite(deadline)&&Number.isFinite(deliveryTime)&&deliveryTime<=deadline,exact:!Boolean(details.isSubstitution),minutes:seconds?`${Math.floor(seconds/60)}m ${String(seconds%60).padStart(2,'0')}s`:'Completed',paymentDays:row.payment_days,depositPercent:row.deposit_bps/100,fees,originalPaymentDays:row.payment_days,onTimeDeliveries:0,completedOrders:0,authorised:Boolean(supplier?.authorised),abnVerified:Boolean(active&&checkedAt&&Date.now()-Date.parse(checkedAt)<=86_400_000),termsConfirmed:Boolean(row.terms_confirmed&&!row.needs_review),transcript:turns.map(turn=>({role:turn.role,message:turn.message})),live:true} as Offer
    }),
  }
}
export async function saveRecovery(request:Recovery,_ownerId:string) {
  if(!supabase) return request
  const {id:_id,status:_status,...details}=request
  const {data,error}=await supabase.rpc('create_recovery_with_policy',{p_details:details}).single()
  if(error)throw error
  const row=data as {id:string;status:Recovery['status']}
  return {...request,id:row.id,status:row.status} as Recovery
}
export async function saveSupplier(supplier:ImportedSupplier,ownerId:string) {
  if(!supabase)return
  const {error}=await supabase.from('supplier_imports').insert({id:supplier.id,owner_id:ownerId,name:supplier.name,abn:supplier.abn,phone:supplier.phone})
  if(error)throw new Error(error.code==='23505'?'This ABN is already in your import queue.':error.message)
}
