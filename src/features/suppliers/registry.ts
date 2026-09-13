import { supabase } from '../../lib/supabase/client'
import type { AbrVerificationResult } from './abr'
import { checkAbn } from './verification'

export async function verifySupplierAbn(supplierId: string): Promise<AbrVerificationResult> {
  if (!supabase) throw new Error('Live ABR verification needs a connected Supabase workspace and ABR authentication GUID.')
  const {data,error}=await supabase.functions.invoke('verify-abn',{body:{action:'verify',supplierId}})
  if(error)throw new Error(`ABR verification failed: ${error.message}`)
  if(!data?.verification)throw new Error(data?.error || 'ABR verification returned no evidence.')
  return data.verification as AbrVerificationResult
}

export async function authoriseVerifiedSupplier(supplierId: string): Promise<AbrVerificationResult> {
  if (!supabase) throw new Error('Supplier authorisation needs a connected workspace.')
  const {data,error}=await supabase.functions.invoke('verify-abn',{body:{action:'authorise',supplierId}})
  if(error)throw new Error(`Supplier authorisation failed: ${error.message}`)
  if(!data?.verification)throw new Error(data?.error || 'Supplier could not be authorised.')
  return data.verification as AbrVerificationResult
}

export async function completeSupplierDetails(supplierId:string,input:{abn:string;phone:string;email?:string}) {
  if(!supabase)throw new Error('Completing a supplier needs a connected workspace.')
  if(!checkAbn(input.abn))throw new Error('This ABN does not pass the 11-digit checksum.')
  if(!/^\+?[\d\s()-]{8,22}$/.test(input.phone)||input.phone.replace(/\D/g,'').length<8)throw new Error('Enter a valid contact phone number.')
  const {data,error}=await supabase.functions.invoke('verify-abn',{body:{action:'complete',supplierId,abn:input.abn.replace(/\s/g,''),phone:input.phone.trim(),email:input.email?.trim()||null}})
  if(error)throw new Error(`Supplier update failed: ${error.message}`)
  if(data?.error)throw new Error(data.error)
  return data.supplier as {abn:string;phone:string;email?:string}
}
