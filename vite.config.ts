import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const fallbackSources=[
  {name:'Poultry N More',url:'https://poultrynmore.com.au/',locality:'Hoppers Crossing VIC',products:['poultry','chicken','meat','halal']},
  {name:'Nice N Fresh Poultry Supplies',url:'https://nicenfresh.com.au/',locality:'Bayswater VIC',products:['poultry','chicken','meat']},
  {name:'Tip Top Meats',url:'https://tiptopmeats.com.au/',locality:'Laverton North VIC',products:['poultry','chicken','beef','lamb','halal']},
  {name:'Fastrac Foodservice',url:'https://fastrac.com.au/',locality:'Somerville VIC',products:['foodservice','frozen','chilled','dry goods']},
  {name:'MAP Food Services',url:'https://mapfoodservices.com.au/',locality:'Thomastown VIC',products:['chicken','beef','lamb','halal','foodservice']},
]

function privateAddress(address:string){return /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(address)}
async function safePublicUrl(value:string){
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||isIP(url.hostname))return null;const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(item=>privateAddress(item.address)))return null;return url}catch{return null}
}
function textOnly(value:string){return value.replace(/<!--[^]*?-->/g,' ').replace(/<(script|style|svg|noscript|template|iframe)\b[^>]*>[^]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|quot);/gi,' ').replace(/&#\d+;/g,' ').replace(/\s+/g,' ').trim()}
function decodeDuckUrl(value:string){try{const absolute=value.startsWith('//')?`https:${value}`:value;const url=new URL(absolute,'https://html.duckduckgo.com');return url.searchParams.get('uddg')||url.toString()}catch{return ''}}
function tokens(value:string){return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(token=>token.length>2&&!['the','and','for','with','near','supplier','suppliers'].includes(token)))]}
function validAbn(value:string){const digits=value.replace(/\D/g,'');return /^\d{11}$/.test(digits)&&digits[0]!=='0'&&[...digits].reduce((sum,digit,index)=>sum+(Number(digit)-(index===0?1:0))*[10,1,3,5,7,9,11,13,15,17,19][index],0)%89===0?digits:null}
async function scrape(value:string){const url=await safePublicUrl(value);if(!url)return null;try{const response=await fetch(url,{redirect:'manual',headers:{Accept:'text/html,text/plain','User-Agent':'SourcePilotLocalDemo/1.0'},signal:AbortSignal.timeout(6500)});if(!response.ok||response.status>=300||!/(?:text\/html|text\/plain)/.test(response.headers.get('content-type')||''))return null;const html=(await response.text()).slice(0,750_000);return {url:url.toString(),html,text:textOnly(html).slice(0,20_000)}}catch{return null}}
async function discover(product:string,location:string){
  const query=`${product} wholesale suppliers near ${location} Australia`,found:{name:string;url:string;locality:string;products:string[]}[]=[]
  try{const response=await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,{headers:{'User-Agent':'Mozilla/5.0 SourcePilotLocalDemo/1.0'},signal:AbortSignal.timeout(6500)});const html=await response.text();for(const anchor of html.matchAll(/<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*>[\s\S]*?<\/a>/gi)){const href=anchor[0].match(/href="([^"]+)"/i)?.[1]||'',label=anchor[0].replace(/^<a\b[^>]*>|<\/a>$/gi,'');const url=decodeDuckUrl(href),name=textOnly(label).slice(0,120);if(url&&name&&!found.some(item=>item.url===url))found.push({name,url,locality:location,products:tokens(product)});if(found.length>=7)break}}catch{/* deterministic seed fallback below */}
  const wanted=tokens(product);for(const source of fallbackSources){if(found.length>=8)break;if(!wanted.some(token=>source.products.some(productToken=>productToken.includes(token)||token.includes(productToken))))continue;if(!found.some(item=>new URL(item.url).hostname===new URL(source.url).hostname))found.push(source)}
  const pages=(await Promise.all(found.slice(0,8).map(async item=>({item,page:await scrape(item.url)})))).filter(result=>result.page&&result.page.text.length>80) as {item:(typeof found)[number];page:{url:string;html:string;text:string}}[]
  return pages.map(({item,page},index)=>{const haystack=page.text.toLowerCase(),matched=wanted.filter(token=>haystack.includes(token)),semanticScore=Math.min(.98,.42+(matched.length/Math.max(1,wanted.length))*.5),abn=(page.text.match(/(?:\d[\s.-]*){11}/g)||[]).map(validAbn).find(Boolean)||null,phone=page.text.match(/(?:\+?61|0)[2-478](?:[\s()-]*\d){8}/)?.[0]?.replace(/\s+/g,' ')||null,email=page.text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]||null;return {id:`local-live-${Date.now()}-${index}`,name:item.name||new URL(page.url).hostname.replace(/^www\./,''),websiteUrl:page.url,locality:item.locality||location,summary:`Live page retrieved locally. Matched ${matched.length} of ${wanted.length} meaningful request terms; review the source before importing.`,products:matched.length?matched:item.products,phone,email,abn,confidence:Number((.65+semanticScore*.25).toFixed(2)),semanticScore:Number(semanticScore.toFixed(3)),profileScore:Math.round(semanticScore*85+10),sources:[{url:page.url,title:`${item.name} public website`}],evidenceCheckedAt:new Date().toISOString(),mode:'live'}}).sort((left,right)=>right.profileScore-left.profileScore||left.name.localeCompare(right.name))
}

function localDemoApi():Plugin{return {name:'sourcepilot-local-demo-api',configureServer(server){server.middlewares.use('/api/local-demo/discover',async(request,response)=>{response.setHeader('Content-Type','application/json');if(request.method!=='POST'){response.statusCode=405;response.end(JSON.stringify({error:'POST required'}));return}try{let raw='';for await(const chunk of request)raw+=chunk;const body=JSON.parse(raw||'{}') as {product?:string;location?:string};if(!body.product?.trim()||!body.location?.trim()){response.statusCode=400;response.end(JSON.stringify({error:'Product and location are required.'}));return}const suppliers=await discover(body.product.slice(0,200),body.location.slice(0,200));response.end(JSON.stringify({suppliers,method:'live public-page scrape with local lexical ranking'}))}catch(error){response.statusCode=502;response.end(JSON.stringify({error:error instanceof Error?error.message:'Local discovery failed.'}))}})}}}

export default defineConfig({ plugins: [react(),localDemoApi()] })
