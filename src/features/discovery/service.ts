import { supabase } from '../../lib/supabase/client'
import type { DiscoveredSupplier } from './evidence'
import type { DiscoveryProfileId } from './engine'

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
  return data.supplier as {id:string;name:string}
}
