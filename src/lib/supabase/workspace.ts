import { supabase } from './client'
import type { ProcurementRequest } from '../../features/requests/data'
import type { Offer } from '../../features/requests/data'
import type { ImportedSupplier } from '../../features/suppliers/verification'

export type Organization = { id: string; name: string; kind: 'personal' | 'business' }
export type CallQueueItem = { id:string;requestId:string;supplierId:string;supplierName:string;status:'queued'|'processing'|'calling'|'completed'|'blocked'|'failed'|'uncertain'|'cancelled';priority:number;attemptCount:number;maxAttempts:number;availableAt:string;callId?:string;lastError?:string;createdAt:string;updatedAt:string }

export async function loadWorkspace(organizationId?:string) {
  if(!supabase) throw new Error('Supabase is not configured.')
  const organizations=await supabase.from('organizations').select('id,name,kind,created_at').order('created_at',{ascending:true})
  if(organizations.error)throw organizations.error
  const organization=(organizations.data.find(item=>item.id===organizationId)??organizations.data.find(item=>item.kind==='business')??organizations.data[0]) as Organization|undefined
  if(!organization)throw new Error('Your account does not have an organisation workspace.')
  const [requests,suppliers,quotes,calls,queue] = await Promise.all([
    supabase.from('procurement_requests').select('id,details,status').eq('organization_id',organization.id).order('created_at',{ascending:false}),
    supabase.from('suppliers').select('id,name,abn,phone,email,website_url,discovery_evidence_id,created_at,authorised,supplier_verifications(active,legal_name,gst_registered,name_matched,contact_confirmed,checked_at)').eq('organization_id',organization.id).order('created_at',{ascending:false}),
    supabase.from('supplier_quotes').select('id,request_id,supplier_id,call_id,total_cents,quantity,payment_days,deposit_bps,terms_confirmed,details,needs_review').eq('organization_id',organization.id).order('created_at',{ascending:false}),
    supabase.from('supplier_calls').select('id,transcript_json,created_at,completed_at').eq('organization_id',organization.id).order('created_at',{ascending:false}),
    supabase.from('supplier_call_queue').select('id,request_id,supplier_id,status,priority,attempt_count,max_attempts,available_at,call_id,last_error,created_at,updated_at').eq('organization_id',organization.id).order('created_at',{ascending:false}),
  ])
  if(requests.error) throw requests.error
  if(suppliers.error) throw suppliers.error
  if(quotes.error) throw quotes.error
  if(calls.error) throw calls.error
  if(queue.error) throw queue.error
  const supplierMap=new Map(suppliers.data.map(row=>[row.id,row]))
  const requestMap=new Map(requests.data.map(row=>[row.id,row]))
  const callMap=new Map(calls.data.map(row=>[row.id,row]))
  return {
    organization,
    organizations:organizations.data as Organization[],
    requests: requests.data.map(row=>({...row.details,id:row.id,status:row.status}) as ProcurementRequest),
    suppliers: suppliers.data.map(row=>{
      const joined=Array.isArray(row.supplier_verifications)?row.supplier_verifications[0]:row.supplier_verifications
      const verification=joined?{active:joined.active,legalName:joined.legal_name,gstRegistered:Boolean(joined.gst_registered),businessNames:[],state:null,postcode:null,entityType:null,statusEffectiveFrom:null,nameMatched:joined.name_matched,contactConfirmed:joined.contact_confirmed,checkedAt:joined.checked_at,source:'ABR' as const,evidenceUrl:`https://abr.business.gov.au/ABN/View?abn=${row.abn}`} : undefined
      const status:ImportedSupplier['status']=row.authorised?'Authorised':verification?(verification.active&&verification.nameMatched?'Verified — owner review':'Registry review required'):row.abn&&row.phone?'Awaiting registry check':'Discovered lead'
      return {id:row.id,name:row.name,abn:row.abn||undefined,phone:row.phone||undefined,email:row.email||undefined,websiteUrl:row.website_url||undefined,discoveryEvidenceId:row.discovery_evidence_id||undefined,importedAt:row.created_at,status,authorised:row.authorised,verification} as ImportedSupplier
    }),
    callQueue:queue.data.map(row=>({id:row.id,requestId:row.request_id,supplierId:row.supplier_id,supplierName:String(supplierMap.get(row.supplier_id)?.name||'Unknown supplier'),status:row.status,priority:row.priority,attemptCount:row.attempt_count,maxAttempts:row.max_attempts,availableAt:row.available_at,callId:row.call_id||undefined,lastError:row.last_error||undefined,createdAt:row.created_at,updatedAt:row.updated_at}) as CallQueueItem),
    offers: quotes.data.map(row=>{
      const supplier=supplierMap.get(row.supplier_id) as unknown as {name:string;authorised:boolean;supplier_verifications:{active:boolean;checked_at:string}[]|{active:boolean;checked_at:string}|null}|undefined,request=requestMap.get(row.request_id),call=callMap.get(row.call_id)
      const details=(row.details||{}) as Record<string,unknown>,turns=Array.isArray(call?.transcript_json)?call.transcript_json as {role:'agent'|'user';message:string;time_in_call_secs?:number}[]:[]
      const seconds=turns.reduce((max,turn)=>Math.max(max,Number(turn.time_in_call_secs)||0),0),delivery=String(details.deliveryTime||'Delivery timing needs review')
      const checkedAt=Array.isArray(supplier?.supplier_verifications)?supplier.supplier_verifications[0]?.checked_at:supplier?.supplier_verifications?.checked_at
      const active=Array.isArray(supplier?.supplier_verifications)?supplier.supplier_verifications[0]?.active:supplier?.supplier_verifications?.active
      const deadline=Date.parse(String((request?.details as Record<string,unknown>|undefined)?.deadline||'')),deliveryTime=Date.parse(delivery)
      const fees=Number(details.feesCents||0)/100,total=Number(row.total_cents)/100
      return {id:row.id,requestId:row.request_id,name:supplier?.name||'Unknown supplier',initials:(supplier?.name||'US').split(/\s+/).slice(0,2).map((part:string)=>part[0]).join('').toUpperCase(),item:String((request?.details as Record<string,unknown>|undefined)?.item||'Supplier quote'),quantity:Number(row.quantity),price:Math.max(0,total-fees),delivery,onTime:Number.isFinite(deadline)&&Number.isFinite(deliveryTime)&&deliveryTime<=deadline,exact:!Boolean(details.isSubstitution),minutes:seconds?`${Math.floor(seconds/60)}m ${String(seconds%60).padStart(2,'0')}s`:'Completed',paymentDays:row.payment_days,depositPercent:row.deposit_bps/100,fees,originalPaymentDays:row.payment_days,onTimeDeliveries:0,completedOrders:0,authorised:Boolean(supplier?.authorised),abnVerified:Boolean(active&&checkedAt&&Date.now()-Date.parse(checkedAt)<=86_400_000),termsConfirmed:Boolean(row.terms_confirmed&&!row.needs_review),transcript:turns.map(turn=>({role:turn.role,message:turn.message})),live:true} as Offer
    }),
  }
}

export async function saveProcurementRequest(request:ProcurementRequest,organizationId:string) {
  if(!supabase) return request
  const {id:_id,status:_status,...details}=request
  const {data,error}=await supabase.rpc('create_procurement_request_with_policy',{p_organization_id:organizationId,p_details:details}).single()
  if(error)throw error
  const row=data as {id:string;status:ProcurementRequest['status']}
  return {...request,id:row.id,status:row.status} as ProcurementRequest
}

export async function saveSupplier(supplier:ImportedSupplier,organizationId:string) {
  if(!supabase)return
  const {error}=await supabase.from('suppliers').insert({id:supplier.id,organization_id:organizationId,name:supplier.name,abn:supplier.abn,phone:supplier.phone,email:supplier.email||null})
  if(error)throw new Error(error.code==='23505'?'This ABN is already in your supplier list.':error.message)
}
