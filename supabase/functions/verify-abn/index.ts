import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { parseAbrJsonp, toAbrVerification } from '../../../src/features/suppliers/abr.ts'
import { checkAbn } from '../../../src/features/suppliers/verification.ts'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const authorization=request.headers.get('Authorization')
    if(!authorization)return json({error:'Authentication is required.'},401)
    const supabaseUrl=Deno.env.get('SUPABASE_URL'),anonKey=Deno.env.get('SUPABASE_ANON_KEY'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if(!supabaseUrl||!anonKey||!serviceKey)throw new Error('Supabase function secrets are incomplete.')
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user)return json({error:'Authentication is invalid.'},401)
    const {action,supplierId,abn,phone,email}=await request.json() as {action:'complete'|'verify'|'authorise';supplierId:string;abn?:string;phone?:string;email?:string|null}
    if(!['complete','verify','authorise'].includes(action)||!supplierId)return json({error:'Send a valid supplier and action.'},400)
    const {data:supplier,error:supplierError}=await userClient.from('suppliers').select('id,organization_id,name,abn,authorised').eq('id',supplierId).single()
    if(supplierError||!supplier)return json({error:'Supplier was not found in this organisation.'},404)
    const organizationId=supplier.organization_id
    const serviceClient=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
    if(action==='complete'){
      if(!abn||!checkAbn(abn)||!phone||phone.replace(/\D/g,'').length<8)return json({error:'A valid ABN and phone are required.'},400)
      const {data:updated,error:updateError}=await serviceClient.from('suppliers').update({abn,phone,email:email||null,authorised:false,authorised_at:null}).eq('id',supplier.id).eq('organization_id',organizationId).select('abn,phone,email').single()
      if(updateError)return json({error:updateError.code==='23505'?'That ABN already belongs to another supplier.':updateError.message},409)
      return json({supplier:updated})
    }
    if(!supplier.abn)return json({error:'Complete the supplier ABN and phone before verification.'},409)
    if(action==='authorise'){
      const {data:membership}=await userClient.from('organization_members').select('role').eq('organization_id',organizationId).eq('user_id',user.id).single()
      if(!membership||!['owner','admin'].includes(membership.role))return json({error:'Only an owner or administrator can authorise a supplier.'},403)
      const {data:evidence,error:evidenceError}=await serviceClient.from('supplier_verifications').select('active,legal_name,gst_registered,name_matched,contact_confirmed,checked_at').eq('supplier_id',supplier.id).eq('organization_id',organizationId).single()
      if(evidenceError||!evidence)return json({error:'Verify this supplier with ABR first.'},409)
      const age=Date.now()-Date.parse(evidence.checked_at)
      if(!evidence.active||!evidence.name_matched||!Number.isFinite(age)||age<0||age>86_400_000)return json({error:'ABR evidence is not eligible for authorisation. Re-verify or review the name mismatch.'},409)
      const {error:confirmError}=await serviceClient.from('supplier_verifications').update({contact_confirmed:true}).eq('supplier_id',supplier.id).eq('organization_id',organizationId)
      if(confirmError)throw confirmError
      const {error:authoriseError}=await serviceClient.from('suppliers').update({authorised:true,authorised_at:new Date().toISOString()}).eq('id',supplier.id).eq('organization_id',organizationId)
      if(authoriseError)throw authoriseError
      return json({authorised:true,verification:formatStoredVerification(supplier.abn,evidence,true)})
    }
    const guid=Deno.env.get('ABR_AUTH_GUID')
    if(!guid)throw new Error('ABR_AUTH_GUID is not configured.')
    const endpoint=new URL('https://abr.business.gov.au/json/AbnDetails.aspx')
    endpoint.searchParams.set('abn',supplier.abn);endpoint.searchParams.set('callback','sourcepilot');endpoint.searchParams.set('guid',guid)
    const response=await fetch(endpoint,{headers:{Accept:'application/javascript'}})
    if(!response.ok)return json({error:'ABN Lookup is temporarily unavailable.',status:response.status},502)
    const verification=toAbrVerification(parseAbrJsonp(await response.text()),supplier.name)
    const {error:saveError}=await serviceClient.from('supplier_verifications').upsert({supplier_id:supplier.id,organization_id:organizationId,active:verification.active,legal_name:verification.legalName,gst_registered:verification.gstRegistered,name_matched:verification.nameMatched,contact_confirmed:false,source:'ABR',checked_at:verification.checkedAt})
    if(saveError)throw saveError
    if(supplier.authorised){await serviceClient.from('suppliers').update({authorised:false,authorised_at:null}).eq('id',supplier.id).eq('organization_id',organizationId)}
    return json({authorised:false,verification})
  }catch(error){return json({error:error instanceof Error?error.message:'Unable to verify ABN.'},500)}
})

function formatStoredVerification(abn:string,evidence:{active:boolean;legal_name:string;gst_registered:boolean|null;name_matched:boolean;contact_confirmed:boolean;checked_at:string},contactConfirmed:boolean){return {abn,active:evidence.active,legalName:evidence.legal_name,businessNames:[],gstRegistered:Boolean(evidence.gst_registered),state:null,postcode:null,entityType:null,statusEffectiveFrom:null,nameMatched:evidence.name_matched,contactConfirmed,checkedAt:evidence.checked_at,source:'ABR',evidenceUrl:`https://abr.business.gov.au/ABN/View?abn=${abn}`}}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}})}
