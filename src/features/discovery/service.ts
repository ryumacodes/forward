import { supabase } from '../../lib/supabase/client'
import type { DiscoveredSupplier } from './evidence'
import type { DiscoveryProfileId } from './engine'
import type { ProcurementRequest } from '../requests/data'
import { verifySupplierAbn } from '../suppliers/registry'

export async function discoverSuppliers(input:{product:string;location:string;profileId:DiscoveryProfileId;organizationId?:string;requiresHalal?:boolean}) {
  if (!supabase) throw new Error('Live discovery needs a connected Supabase workspace and OpenAI API key.')
  if (!input.organizationId) throw new Error('Select an organisation workspace before discovering suppliers.')
  const {data,error}=await supabase.functions.invoke('discover-suppliers',{body:input})
  if(error)throw new Error(`Supplier discovery failed: ${error.message}`)
  if(data?.error)throw new Error(data.error)
  if(!Array.isArray(data?.suppliers))throw new Error('Supplier discovery returned no evidence.')
  return data.suppliers as DiscoveredSupplier[]
}

export async function importDiscoveredSupplier(input:{organizationId:string;evidenceId:string}) {
  if(!supabase)throw new Error('Live supplier import needs a connected Supabase workspace.')
  const {data,error}=await supabase.functions.invoke('discover-suppliers',{body:{action:'import',...input}})
  if(error)throw new Error(`Supplier import failed: ${error.message}`)
  if(data?.error)throw new Error(data.error)
  return data.supplier as {id:string;name:string;abn:string|null}
}

export type SupplierScreeningSummary={discovered:number;imported:number;verified:number;needsAbn:number;failed:number}

export async function discoverImportAndVerifySuppliers(input:{request:ProcurementRequest;organizationId:string;onProgress?:(message:string)=>void}):Promise<SupplierScreeningSummary>{
  const {request,organizationId,onProgress}=input
  onProgress?.('Finding public supplier evidence…')
  const candidates=await discoverSuppliers({product:[request.requiresHalal?'halal':null,request.freshness,request.cut,request.item,`${request.quantity} ${request.unit}`].filter(Boolean).join(' '),location:request.location,profileId:request.buyingProfile??'general',organizationId,requiresHalal:request.requiresHalal})
  let imported=0,verified=0,needsAbn=0,failed=0
  for(const [index,candidate] of candidates.entries()){
    onProgress?.(`Screening supplier ${index+1} of ${candidates.length}…`)
    try{
      const supplier=await importDiscoveredSupplier({organizationId,evidenceId:candidate.id})
      imported++
      if(!supplier.abn){needsAbn++;continue}
      try{await verifySupplierAbn(supplier.id);verified++}catch{failed++}
    }catch{failed++}
  }
  return {discovered:candidates.length,imported,verified,needsAbn,failed}
}
