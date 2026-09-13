import { useState } from 'react'
import { AlertCircle, Check, Clock3, Phone, RotateCcw, X } from '../icons'
import { updateSupplierCallQueue } from '../features/voice/outbound'
import type { CallQueueItem } from '../lib/supabase/workspace'

const labels:Record<CallQueueItem['status'],string>={queued:'Waiting',processing:'Starting',calling:'Calling now',completed:'Completed',blocked:'Blocked',failed:'Failed',uncertain:'Check provider',cancelled:'Cancelled'}

export function CallQueuePanel({items,onChanged}:{items:CallQueueItem[];onChanged:()=>void|Promise<void>}){
  const [working,setWorking]=useState(''),[error,setError]=useState('')
  const active=items.filter(item=>['queued','processing','calling'].includes(item.status)),history=items.filter(item=>!['queued','processing','calling'].includes(item.status))
  async function update(item:CallQueueItem,action:'cancel'|'retry'){
    setWorking(item.id);setError('')
    try{await updateSupplierCallQueue(item.id,action);await onChanged()}
    catch(reason){setError(reason instanceof Error?reason.message:'Unable to update the queue.')}
    finally{setWorking('')}
  }
  const rows=[...active,...history]
  return <section className="call-queue-panel"><div className="section-header"><div><h2>Supplier calling queue</h2><p>One active supplier call per request. The next eligible supplier starts when the current call finishes.</p></div><span className="demo-badge">{active.length} active · {history.length} finished</span></div>
    {error&&<p className="form-error" role="alert"><AlertCircle size={14}/>{error}</p>}
    <div className="call-queue-list">{rows.map(item=><article className={`call-queue-item queue-${item.status}`} key={item.id}><span className="call-icon">{item.status==='completed'?<Check size={17}/>:item.status==='cancelled'?<X size={17}/>:item.status==='calling'?<Phone size={17}/>:<Clock3 size={17}/>}</span><div><strong>{item.supplierName}</strong><p>{item.requestId} · Attempt {item.attemptCount}/{item.maxAttempts}{item.lastError?` · ${item.lastError}`:''}</p></div><span className="queue-status">{labels[item.status]}</span>{item.status==='queued'&&<button className="secondary" disabled={working===item.id} onClick={()=>void update(item,'cancel')}>Cancel</button>}{['blocked','failed','uncertain'].includes(item.status)&&<button className="secondary" disabled={working===item.id} onClick={()=>void update(item,'retry')}><RotateCcw size={13}/> Retry</button>}</article>)}{rows.length===0&&<p className="import-empty">No supplier calls are queued yet. Select authorised suppliers and add them to a request queue.</p>}</div>
  </section>
}
