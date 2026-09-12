import { supabase } from './client'
import type { Recovery } from '../../features/recoveries/data'
import type { ImportedSupplier } from '../../features/suppliers/verification'
export async function loadWorkspace() {
  if(!supabase) throw new Error('Supabase is not configured.')
  const [requests,suppliers] = await Promise.all([
    supabase.from('recovery_requests').select('id,details,status').order('created_at',{ascending:false}),
    supabase.from('supplier_imports').select('id,name,abn,phone,created_at').order('created_at',{ascending:false}),
  ])
  if(requests.error) throw requests.error
  if(suppliers.error) throw suppliers.error
  return {
    recoveries: requests.data.map(row=>({...row.details,id:row.id,status:row.status}) as Recovery),
    suppliers: suppliers.data.map(row=>({id:row.id,name:row.name,abn:row.abn,phone:row.phone,importedAt:row.created_at,status:'Awaiting registry check',authorised:false}) as ImportedSupplier),
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
