export type TranscriptTurn={role:'agent'|'user';message:string;time_in_call_secs?:number}

export async function verifyElevenLabsSignature(rawBody:string,header:string|null,secret:string,nowSeconds=Math.floor(Date.now()/1000)){
  if(!header||!secret)return false
  const parts=Object.fromEntries(header.split(',').map(part=>part.split('=',2)))
  const timestamp=Number(parts.t),signature=parts.v0
  if(!Number.isInteger(timestamp)||!signature||Math.abs(nowSeconds-timestamp)>1800)return false
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${parts.t}.${rawBody}`))
  const expected=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')
  if(expected.length!==signature.length)return false
  let difference=0
  for(let index=0;index<expected.length;index+=1)difference|=expected.charCodeAt(index)^signature.charCodeAt(index)
  return difference===0
}

export function transcriptText(turns:TranscriptTurn[]){
  return turns.filter(turn=>['agent','user'].includes(turn.role)&&typeof turn.message==='string').map(turn=>`${turn.role==='user'?'SUPPLIER':'BACKFILL'}: ${turn.message.trim()}`).join('\n')
}

export function supplierTranscript(turns:TranscriptTurn[]){return turns.filter(turn=>turn.role==='user').map(turn=>turn.message).join('\n')}

export function supplierRequestedNoContact(text:string){return /\b(do not|don't|dont|stop)\s+(?:call(?:ing)?|contact(?:ing)?|message|email)|\bremove\s+(?:us|me)\s+from|\bopt\s*(?:me|us)?\s*out\b/i.test(text)}
