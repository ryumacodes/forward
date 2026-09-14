import { createDemoSeed, type Offer, type ProcurementRequest } from '../requests/data'
import type { ImportedSupplier, RegistryEvidence } from '../suppliers/verification'
import type { DiscoveredSupplier } from '../discovery/evidence'
import type { CallQueueItem } from '../../lib/supabase/workspace'

export type LocalWorkspace = {
  requests: ProcurementRequest[]
  suppliers: ImportedSupplier[]
  offers: Offer[]
  callQueue: CallQueueItem[]
  discoveries: DiscoveredSupplier[]
}

export type LocalCallTurn = {role:'agent'|'user';message:string;at:string}
export type LocalSupplierQuote = {quantity:number;total:number;fees:number;paymentDays:number;depositPercent:number;delivery:string;exact:boolean;statement:string}
export type LocalCallSession = {
  id:string
  request:ProcurementRequest
  supplier:ImportedSupplier
  status:'ringing'|'in_progress'|'completed'|'cancelled'
  counteroffers:number
  transcript:LocalCallTurn[]
  quote?:LocalSupplierQuote
  outcome?:'fits_rules'|'owner_review'|'outside_bounds'|'stopped'
  updatedAt:string
}

const DB_NAME='sourcepilot-local-demo'
const STORE='workspace'
const SNAPSHOT_KEY='current'
const CALL_PREFIX='sourcepilot-local-call:'
const CHANNEL='sourcepilot-local-demo-calls'

function openDatabase(){
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1)
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)}
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error??new Error('Could not open the local demo database.'))
  })
}

async function readValue<T>(key:string):Promise<T|undefined>{
  const db=await openDatabase()
  return await new Promise<T|undefined>((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readonly')
    const request=transaction.objectStore(STORE).get(key)
    request.onsuccess=()=>resolve(request.result as T|undefined)
    request.onerror=()=>reject(request.error??new Error('Could not read the local demo database.'))
    transaction.oncomplete=()=>db.close()
  })
}

async function writeValue<T>(key:string,value:T){
  const db=await openDatabase()
  await new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readwrite')
    transaction.objectStore(STORE).put(value,key)
    transaction.oncomplete=()=>{db.close();resolve()}
    transaction.onerror=()=>reject(transaction.error??new Error('Could not update the local demo database.'))
  })
}

export function createLocalWorkspace():LocalWorkspace{
  const seed=createDemoSeed()
  return {requests:seed.requests,offers:seed.offers.map(offer=>({...offer,requestId:'REQ-024'})),suppliers:[],callQueue:[],discoveries:[]}
}

export async function loadLocalWorkspace(){return (await readValue<LocalWorkspace>(SNAPSHOT_KEY))??createLocalWorkspace()}
export async function saveLocalWorkspace(workspace:LocalWorkspace){await writeValue(SNAPSHOT_KEY,workspace)}
export async function resetLocalWorkspace(){const value=createLocalWorkspace();await saveLocalWorkspace(value);return value}

export async function saveLocalDiscoveries(discoveries:DiscoveredSupplier[]){const workspace=await loadLocalWorkspace();workspace.discoveries=discoveries;await saveLocalWorkspace(workspace)}
export async function importLocalDiscovery(evidenceId:string){
  const workspace=await loadLocalWorkspace()
  const evidence=workspace.discoveries.find(item=>item.id===evidenceId)
  if(!evidence)throw new Error('The local discovery evidence is no longer available. Run the search again.')
  const existing=workspace.suppliers.find(item=>item.discoveryEvidenceId===evidence.id||Boolean(evidence.abn&&item.abn===evidence.abn))
  if(existing)return existing
  const supplier:ImportedSupplier={id:crypto.randomUUID(),name:evidence.name,abn:evidence.abn??undefined,phone:evidence.phone??undefined,email:evidence.email??undefined,websiteUrl:evidence.websiteUrl,discoveryEvidenceId:evidence.id,importedAt:new Date().toISOString(),status:evidence.abn&&evidence.phone?'Awaiting registry check':'Discovered lead',authorised:false}
  workspace.suppliers.unshift(supplier);await saveLocalWorkspace(workspace);return supplier
}

export function localRegistryEvidence(supplier:ImportedSupplier):RegistryEvidence&{gstRegistered:boolean;businessNames:string[];state:string|null;postcode:string|null;entityType:string|null;statusEffectiveFrom:string|null;evidenceUrl:string}{
  if(!supplier.abn)throw new Error('Add an ABN before running the local registry simulation.')
  return {active:true,legalName:supplier.name,checkedAt:new Date().toISOString(),source:'ABR',nameMatched:true,contactConfirmed:false,gstRegistered:true,businessNames:[supplier.name],state:'VIC',postcode:null,entityType:'Local demo evidence',statusEffectiveFrom:null,evidenceUrl:`https://abr.business.gov.au/ABN/View?abn=${supplier.abn}`}
}

export async function verifyLocalSupplier(supplierId:string){
  const workspace=await loadLocalWorkspace(),supplier=workspace.suppliers.find(item=>item.id===supplierId)
  if(!supplier)throw new Error('Supplier was not found in the local demo database.')
  const verification=localRegistryEvidence(supplier)
  Object.assign(supplier,{verification,status:'Verified — owner review' as const,authorised:false})
  await saveLocalWorkspace(workspace);return verification
}

export async function createLocalCallSession(request:ProcurementRequest,supplier:ImportedSupplier){
  const session:LocalCallSession={id:crypto.randomUUID(),request,supplier,status:'ringing',counteroffers:0,transcript:[],updatedAt:new Date().toISOString()}
  localStorage.setItem(`${CALL_PREFIX}${session.id}`,JSON.stringify(session));publishLocalCall(session);return session
}

export function getLocalCallSession(id:string){const value=localStorage.getItem(`${CALL_PREFIX}${id}`);return value?JSON.parse(value) as LocalCallSession:null}
export function saveLocalCallSession(session:LocalCallSession){session.updatedAt=new Date().toISOString();localStorage.setItem(`${CALL_PREFIX}${session.id}`,JSON.stringify(session));publishLocalCall(session)}
function publishLocalCall(session:LocalCallSession){try{const channel=new BroadcastChannel(CHANNEL);channel.postMessage(session);channel.close()}catch{/* storage events remain the fallback */}}
export function subscribeLocalCalls(listener:(session:LocalCallSession)=>void){
  const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(CHANNEL)
  if(channel)channel.onmessage=event=>listener(event.data as LocalCallSession)
  const storage=(event:StorageEvent)=>{if(event.key?.startsWith(CALL_PREFIX)&&event.newValue)listener(JSON.parse(event.newValue) as LocalCallSession)}
  window.addEventListener('storage',storage)
  return()=>{channel?.close();window.removeEventListener('storage',storage)}
}

export function offerFromLocalCall(session:LocalCallSession):Offer|null{
  if(session.status!=='completed'||!session.quote)return null
  const quote=session.quote
  return {id:`local-${session.id}`,requestId:session.request.id,name:session.supplier.name,initials:session.supplier.name.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase(),item:session.request.item,quantity:quote.quantity,price:Math.max(0,quote.total-quote.fees),delivery:quote.delivery,onTime:Date.parse(quote.delivery)<=Date.parse(session.request.deadline),exact:quote.exact,minutes:'Live demo',paymentDays:quote.paymentDays,depositPercent:quote.depositPercent,fees:quote.fees,originalPaymentDays:quote.paymentDays,onTimeDeliveries:0,completedOrders:0,authorised:true,abnVerified:true,termsConfirmed:true,transcript:session.transcript.map(turn=>({role:turn.role,message:turn.message})),live:true}
}

