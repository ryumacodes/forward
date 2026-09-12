import { supabase } from './client'
import type { Recovery } from '../../features/recoveries/data'
import type { ImportedSupplier } from '../../features/suppliers/verification'
export async function loadWorkspace() {
  if(!supabase) throw new Error('Supabase is not configured.')
  const [requests,suppliers] = await Promise.all([
    supabase.from('recovery_requests').select('id,details,status').order('created_at',{ascending:false}),
    supabase.from('supplier_imports').select('id,name,abn,phone,created_at,authorised,supplier_verifications(active,legal_name,gst_registered,name_matched,contact_confirmed,checked_at)').order('created_at',{ascending:false}),
  ])
  if(requests.error) throw requests.error
  if(suppliers.error) throw suppliers.error
  return {
    recoveries: requests.data.map(row=>({...row.details,id:row.id,status:row.status}) as Recovery),
    suppliers: suppliers.data.map(row=>{
      const joined=Array.isArray(row.supplier_verifications)?row.supplier_verifications[0]:row.supplier_verifications
      const verification=joined?{active:joined.active,legalName:joined.legal_name,gstRegistered:Boolean(joined.gst_registered),businessNames:[],state:null,postcode:null,entityType:null,statusEffectiveFrom:null,nameMatched:joined.name_matched,contactConfirmed:joined.contact_confirmed,checkedAt:joined.checked_at,source:'ABR' as const,evidenceUrl:`https://abr.business.gov.au/ABN/View?abn=${row.abn}`} : undefined
      const status:ImportedSupplier['status']=row.authorised?'Authorised':verification?(verification.active&&verification.nameMatched?'Verified — owner review':'Registry review required'):'Awaiting registry check'
      return {id:row.id,name:row.name,abn:row.abn,phone:row.phone,importedAt:row.created_at,status,authorised:row.authorised,verification} as ImportedSupplier
    }),
  }
}
export async function saveRecovery(request:Recovery,ownerId:string) {
  if(!supabase) return request
  const {id:_id,status:_status,...details}=request
  const {data,error}=await supabase.from('recovery_requests').insert({owner_id:ownerId,details}).select('id,status').single()
  if(error)throw error
  return {...request,id:data.id,status:data.status} as Recovery
}
export async function saveSupplier(supplier:ImportedSupplier,ownerId:string) {
  if(!supabase)return
  const {error}=await supabase.from('supplier_imports').insert({id:supplier.id,owner_id:ownerId,name:supplier.name,abn:supplier.abn,phone:supplier.phone})
  if(error)throw new Error(error.code==='23505'?'This ABN is already in your import queue.':error.message)
}
