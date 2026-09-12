import { supabase } from '../../lib/supabase/client'
import type { DiscoveredSupplier } from './evidence'
import type { DiscoveryProfileId } from './engine'

export async function discoverSuppliers(input:{product:string;location:string;profileId:DiscoveryProfileId}) {
  if (!supabase) throw new Error('Live discovery needs a connected Supabase workspace and OpenAI API key.')
  const {data,error}=await supabase.functions.invoke('discover-suppliers',{body:input})
  if(error)throw new Error(`Supplier discovery failed: ${error.message}`)
  if(data?.error)throw new Error(data.error)
  if(!Array.isArray(data?.suppliers))throw new Error('Supplier discovery returned no evidence.')
  return data.suppliers as DiscoveredSupplier[]
}
