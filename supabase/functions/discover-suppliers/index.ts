import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { cosineSimilarity, extractVisibleText, isPotentiallyPublicUrl, uniquePublicSources, type DiscoverySource } from '../../../src/features/discovery/evidence.ts'
import { discoveryProfiles, scoreDiscoveredEvidence, type DiscoveryProfileId } from '../../../src/features/discovery/engine.ts'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const candidateSchema={type:'object',additionalProperties:false,required:['candidates'],properties:{candidates:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['name','websiteUrl','locality','summary','products','phone','email','confidence','evidence'],properties:{name:{type:'string'},websiteUrl:{type:'string'},locality:{type:'string'},summary:{type:'string'},products:{type:'array',items:{type:'string'},maxItems:12},phone:{type:['string','null']},email:{type:['string','null']},confidence:{type:'number',minimum:0,maximum:1},evidence:{type:'array',minItems:1,maxItems:6,items:{type:'object',additionalProperties:false,required:['url','title'],properties:{url:{type:'string'},title:{type:'string'}}}}}}}}}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const authorization=request.headers.get('Authorization')
    if(!authorization)return json({error:'Authentication is required.'},401)
    const supabaseUrl=Deno.env.get('SUPABASE_URL'),anonKey=Deno.env.get('SUPABASE_ANON_KEY'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),apiKey=Deno.env.get('OPENAI_API_KEY')
    if(!supabaseUrl||!anonKey||!serviceKey)throw new Error('Supabase function secrets are incomplete.')
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user)return json({error:'Authentication is invalid.'},401)
    const body=await request.json() as {action?:'search'|'import';product?:string;location?:string;profileId?:string;organizationId:string;evidenceId?:string;requiresHalal?:boolean}
    const {product,location,profileId,organizationId}=body
    if(!organizationId)return json({error:'Select an organisation workspace.'},400)
    const {data:membership}=await userClient.from('organization_members').select('organization_id').eq('organization_id',organizationId).eq('user_id',user.id).maybeSingle()
    if(!membership)return json({error:'Organisation membership is required.'},403)
    const serviceClient=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
    if(body.action==='import'){
      if(!body.evidenceId)return json({error:'Select supplier evidence to import.'},400)
      const {data:evidence}=await serviceClient.from('supplier_evidence').select('id,supplier_name,website_url,source_url,extracted_facts').eq('id',body.evidenceId).eq('organization_id',organizationId).single()
      if(!evidence)return json({error:'Supplier evidence was not found in this organisation.'},404)
      const facts=(evidence.extracted_facts||{}) as Record<string,unknown>
      const row={organization_id:organizationId,name:evidence.supplier_name,abn:null,phone:typeof facts.phone==='string'?facts.phone:null,email:typeof facts.email==='string'?facts.email:null,website_url:evidence.website_url,discovery_evidence_id:evidence.id,contact_source:evidence.source_url,authorised:false}
      const {data:supplier,error}=await serviceClient.from('suppliers').upsert(row,{onConflict:'organization_id,website_url'}).select('id,name').single()
      if(error)throw error
      return json({supplier})
    }
    if(!apiKey)throw new Error('OPENAI_API_KEY is not configured.')
    if(!product?.trim()||product.length>200||!location?.trim()||location.length>200||!organizationId||!['hospitality','construction','general'].includes(profileId))return json({error:'Send a valid organisation, product, location, and buying profile.'},400)
    const query=`${product.trim()} suppliers near ${location.trim()} Australia`
    const searchModel=Deno.env.get('OPENAI_DISCOVERY_MODEL')||'gpt-5.6-terra'
    const search=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:searchModel,store:false,tools:[{type:'web_search',user_location:{type:'approximate',country:'AU'}}],include:['web_search_call.action.sources'],input:[{role:'system',content:[{type:'input_text',text:'Find real Australian supplier businesses using public primary supplier pages. Return candidates only when a cited page supports the business name and relevant product or service. Do not claim ABN status, stock, price, certifications, or delivery availability unless directly shown; those are verified later. Prefer local SMEs and official supplier websites over directories.'}]},{role:'user',content:[{type:'input_text',text:`Find suppliers for ${product.trim()} near ${location.trim()}. Buying profile: ${profileId}. Return evidence URLs for every candidate.`}]}],text:{format:{type:'json_schema',name:'supplier_candidates',strict:true,schema:candidateSchema}}})})
    if(!search.ok)return json({error:'Web discovery provider failed.',status:search.status},502)
    const responseBody=await search.json()
    const output=responseBody.output?.flatMap((item:{content?:unknown[]})=>item.content??[]).find((item:{type?:string})=>item.type==='output_text')?.text
    if(!output)return json({error:'Web discovery returned no structured candidates.'},502)
    const parsed=JSON.parse(output) as {candidates:Array<{name:string;websiteUrl:string;locality:string;summary:string;products:string[];phone:string|null;email:string|null;confidence:number;evidence:DiscoverySource[]}>}
    const candidates=parsed.candidates.filter(item=>isPotentiallyPublicUrl(item.websiteUrl)).slice(0,8)
    const scraped=await Promise.all(candidates.map(async candidate=>{
      const sources=uniquePublicSources([{url:candidate.websiteUrl,title:`${candidate.name} website`},...candidate.evidence])
      let excerpt=''
      for(const source of sources.slice(0,3)){
        const text=await scrapePublicPage(source.url)
        if(text.length>excerpt.length)excerpt=text
      }
      const evidenceText=[candidate.name,candidate.locality,candidate.summary,candidate.products.join(', '),excerpt].filter(Boolean).join('\n').slice(0,20_000)
      return {...candidate,sources,excerpt:evidenceText}
    }))
    const usable=scraped.filter(item=>item.sources.length&&item.excerpt.length>40)
    if(!usable.length)return json({error:'No safe public supplier evidence could be retrieved.'},422)
    const embeddingModel=Deno.env.get('OPENAI_EMBEDDING_MODEL')||'text-embedding-3-small'
    const embeddingResponse=await fetch('https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:embeddingModel,input:[query,...usable.map(item=>item.excerpt)],encoding_format:'float'})})
    if(!embeddingResponse.ok)return json({error:'Semantic matching provider failed.',status:embeddingResponse.status},502)
    const embeddingBody=await embeddingResponse.json()
    const vectors=(embeddingBody.data as Array<{index:number;embedding:number[]}>).sort((a,b)=>a.index-b.index).map(item=>item.embedding)
    if(vectors.length!==usable.length+1||vectors.some(vector=>vector.length!==1536))return json({error:'Embedding provider returned an unexpected result.'},502)
    const queryVector=vectors[0],checkedAt=new Date().toISOString()
    const profile=discoveryProfiles.find(item=>item.id===profileId)??discoveryProfiles[2]
    const suppliers=await Promise.all(usable.map(async(item,index)=>{
      const source=item.sources[0]
      const sourceHash=await sha256(`${source.url}\n${item.excerpt}`)
      const embedding=vectors[index+1]
      const semanticScore=Math.max(0,Math.min(1,cosineSimilarity(queryVector,embedding)))
      const facts={locality:item.locality,summary:item.summary,products:item.products,phone:item.phone,email:item.email,confidence:item.confidence,sources:item.sources,semanticScore}
      const {data,error}=await serviceClient.from('supplier_evidence').upsert({organization_id:organizationId,search_query:query,supplier_name:item.name,website_url:item.websiteUrl,source_url:source.url,source_title:source.title,content_excerpt:item.excerpt,extracted_facts:facts,embedding_model:embeddingModel,embedding,source_hash:sourceHash,checked_at:checkedAt},{onConflict:'organization_id,source_hash'}).select('id').single()
      if(error)throw error
      const profileScore=scoreDiscoveredEvidence({semanticScore,confidence:item.confidence,locality:item.locality,location,products:item.products,requiresHalal:body.requiresHalal},profile)
      return {id:data.id,name:item.name,websiteUrl:item.websiteUrl,locality:item.locality,summary:item.summary,products:item.products,phone:item.phone,email:item.email,confidence:item.confidence,semanticScore,profileScore,sources:item.sources,evidenceCheckedAt:checkedAt,mode:'live' as const}
    }))
    suppliers.sort((a,b)=>b.profileScore-a.profileScore||b.semanticScore-a.semanticScore||b.confidence-a.confidence||a.name.localeCompare(b.name))
    return json({searchModel,embeddingModel,query,suppliers})
  }catch(error){return json({error:error instanceof Error?error.message:'Unable to discover suppliers.'},500)}
})

async function scrapePublicPage(value:string){
  if(!isPotentiallyPublicUrl(value))return ''
  const url=new URL(value)
  const addresses=await resolveAddresses(url.hostname)
  if(!addresses.length||addresses.some(isPrivateAddress))return ''
  const response=await fetch(url,{redirect:'manual',headers:{Accept:'text/html,text/plain;q=0.9','User-Agent':'SourcePilotSupplierEvidence/1.0'}})
  if(!response.ok||response.status>=300||Number(response.headers.get('content-length')||0)>1_000_000)return ''
  const contentType=response.headers.get('content-type')||''
  if(!contentType.includes('text/html')&&!contentType.includes('text/plain'))return ''
  return extractVisibleText((await response.text()).slice(0,1_000_000))
}

async function resolveAddresses(hostname:string){
  const values:string[]=[]
  for(const type of ['A','AAAA'] as const){try{values.push(...await Deno.resolveDns(hostname,type))}catch{/* A site may publish only one address family. */}}
  return values
}

function isPrivateAddress(value:string){
  const ip=value.toLowerCase()
  if(ip.includes(':'))return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe8')||ip.startsWith('fe9')||ip.startsWith('fea')||ip.startsWith('feb')
  const parts=ip.split('.').map(Number)
  return parts[0]===10||parts[0]===127||parts[0]===0||(parts[0]===169&&parts[1]===254)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168)||(parts[0]===100&&parts[1]>=64&&parts[1]<=127)
}

async function sha256(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}})}
