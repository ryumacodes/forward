import { supabase } from '../../lib/supabase/client'
import type { AbrVerificationResult } from './abr'

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
