import { useState } from 'react'
import { AlertTriangle, Check, Clock3, ExternalLink, Phone, Plus, ShieldCheck, X } from '../icons'
import { prepareSupplier, type ImportedSupplier } from '../features/suppliers/verification'
import { authoriseVerifiedSupplier, completeSupplierDetails, verifySupplierAbn } from '../features/suppliers/registry'
import { enqueueSupplierCalls, startSupplierCall } from '../features/voice/outbound'
import { runProcurementAction } from '../features/communications/service'

type SupplierImportProps = {
  suppliers: ImportedSupplier[]
  onImport: (supplier: ImportedSupplier) => void | Promise<void>
  onUpdate: (supplier: ImportedSupplier) => void
  activeRequestId?: string
  organizationId?: string
  onCallStarted?: (message:string) => void
  onQueueChanged?: () => void | Promise<void>
}

export function SupplierImport({suppliers,onImport,onUpdate,activeRequestId,organizationId,onCallStarted,onQueueChanged}:SupplierImportProps) {
  const [open,setOpen] = useState(false)
  const [saving,setSaving] = useState(false)
  const [workingId,setWorkingId] = useState('')
  const [error,setError] = useState('')
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const [completing,setCompleting] = useState<ImportedSupplier|null>(null)

  async function verify(supplier:ImportedSupplier) {
    setWorkingId(supplier.id);setError('')
    try {
      const result=await verifySupplierAbn(supplier.id)
      onUpdate({...supplier,authorised:false,status:result.active&&result.nameMatched?'Verified — owner review':'Registry review required',verification:{...result,contactConfirmed:false}})
    } catch(err) {setError(err instanceof Error?err.message:'Unable to verify this ABN.')}
    finally {setWorkingId('')}
  }

  async function authorise(supplier:ImportedSupplier) {
    setWorkingId(supplier.id);setError('')
    try {
      const result=await authoriseVerifiedSupplier(supplier.id)
      onUpdate({...supplier,authorised:true,status:'Authorised',verification:{...result,contactConfirmed:true}})
    } catch(err) {setError(err instanceof Error?err.message:'Unable to authorise this supplier.')}
    finally {setWorkingId('')}
  }

  async function call(supplier:ImportedSupplier) {
    setWorkingId(supplier.id);setError('')
    try {const result=await startSupplierCall(supplier.id,activeRequestId||'');onCallStarted?.(result.conversationId?`Supplier queued and live call initiated. Conversation ${result.conversationId}.`:'Supplier added to the calling queue.');await onQueueChanged?.()}
    catch(err){setError(err instanceof Error?err.message:'Unable to start this call.')}
    finally{setWorkingId('')}
  }
  async function queueSelected(){
    if(!selected.size)return
    setWorkingId('queue');setError('')
    try{const result=await enqueueSupplierCalls([...selected],activeRequestId||'');setSelected(new Set());onCallStarted?.(`${result.queued} supplier${result.queued===1?'':'s'} added to the calling queue.${result.conversationId?' The first call is starting.':''}`);await onQueueChanged?.()}
    catch(err){setError(err instanceof Error?err.message:'Unable to create the calling queue.')}
    finally{setWorkingId('')}
  }
  async function emailBrief(supplier:ImportedSupplier){
    setWorkingId(supplier.id);setError('')
    try{const result=await runProcurementAction('email_brief',{organizationId,supplierId:supplier.id,requestId:activeRequestId});onCallStarted?.(`Supplier brief email ${result.status}.`)}catch(err){setError(err instanceof Error?err.message:'Unable to email the supplier brief.')}
    finally{setWorkingId('')}
  }

  return <section className="supplier-import">
    <div className="section-header"><div><h2>Supplier verification queue</h2><p>Import → live ABR evidence → owner confirmation → authorised outreach.</p></div><div className="queue-header-actions">{selected.size>0&&<button className="primary" disabled={!activeRequestId||workingId==='queue'} onClick={()=>void queueSelected()}><Phone size={15}/>{workingId==='queue'?'Building queue…':`Queue ${selected.size} selected`}</button>}<button className="primary" onClick={() => setOpen(true)}><Plus size={17}/> Import supplier</button></div></div>
    {error && <p className="form-error registry-error" role="alert">{error}</p>}
    {suppliers.length === 0 && <div className="import-empty"><ShieldCheck size={22}/><p>Imported suppliers stay outside your calling list until their ABR evidence and contact details are confirmed.</p></div>}
    {suppliers.map(supplier => {
      const verification=supplier.verification
      const ready=Boolean(verification?.active&&verification.nameMatched)
      return <article className="import-record registry-record" key={supplier.id}>
        <div className="registry-record-head"><div><span className="eyebrow">{supplier.status}</span><h3>{supplier.name}</h3><p>{supplier.abn?`ABN ${supplier.abn}`:'ABN needed'} · {supplier.phone||supplier.email||supplier.websiteUrl||'Contact needed'}</p></div><span className={`registry-state ${supplier.authorised?'authorised':ready?'verified':verification?'review':''}`}>{supplier.authorised?<><Check size={14}/> Authorised</>:ready?<><ShieldCheck size={14}/> ABR checked</>:verification?<><AlertTriangle size={14}/> Review</>:<><Clock3 size={14}/> Pending</>}</span></div>
        <div className="checks">{supplier.abn?<span><Check size={14}/> ABN checksum passed</span>:<span className="failed"><Clock3 size={14}/> ABN details required</span>}{verification?<><span className={verification.active?'':'failed'}>{verification.active?<Check size={14}/>:<X size={14}/>} ABN {verification.active?'active':'not active'}</span><span className={verification.nameMatched?'':'failed'}>{verification.nameMatched?<Check size={14}/>:<X size={14}/>} Name {verification.nameMatched?'matched':'needs review'}</span></>:<span className="failed"><Clock3 size={14}/> Registry evidence pending</span>}</div>
        {verification && <div className="registry-evidence"><div><span>ABR entity name</span><strong>{verification.legalName||'Not returned'}</strong></div><div><span>GST registration</span><strong>{verification.gstRegistered?'Registered':'Not shown as registered'}</strong></div><div><span>Main business location</span><strong>{[verification.state,verification.postcode].filter(Boolean).join(' ')||'Not returned'}</strong></div><div><span>Checked</span><strong>{new Date(verification.checkedAt).toLocaleString('en-AU')}</strong></div></div>}
        <div className="registry-actions">
          {supplier.authorised&&<label className="queue-select"><input type="checkbox" checked={selected.has(supplier.id)} onChange={event=>setSelected(previous=>{const next=new Set(previous);if(event.target.checked)next.add(supplier.id);else next.delete(supplier.id);return next})}/> Add to calling queue</label>}
          {supplier.abn&&<a className="secondary" href={`https://abr.business.gov.au/ABN/View?abn=${supplier.abn}`} target="_blank" rel="noreferrer">View public ABR record <ExternalLink size={14}/></a>}
          {(!supplier.abn||!supplier.phone)&&<button className="secondary" onClick={()=>setCompleting(supplier)}>Complete ABN & contact</button>}
          {!supplier.authorised&&supplier.abn&&supplier.phone&&<button className="secondary" disabled={workingId===supplier.id} onClick={()=>verify(supplier)}>{workingId===supplier.id?'Checking ABR…':verification?'Refresh ABR evidence':'Verify with ABR'}</button>}
          {!supplier.authorised&&ready&&<button className="primary" disabled={workingId===supplier.id} onClick={()=>authorise(supplier)}>{workingId===supplier.id?'Authorising…':'Confirm contact & authorise'}</button>}
          {supplier.authorised&&<button className="primary" disabled={workingId===supplier.id||!activeRequestId} onClick={()=>call(supplier)}><Phone size={14}/>{workingId===supplier.id?'Queueing…':activeRequestId?'Queue next call':'Select a request first'}</button>}
          {supplier.authorised&&supplier.email&&<button className="secondary" disabled={workingId===supplier.id||!activeRequestId} onClick={()=>emailBrief(supplier)}>{workingId===supplier.id?'Sending…':'Email written brief'}</button>}
        </div>
        <p className="registry-caveat"><ShieldCheck size={14}/>{supplier.authorised?'Owner-authorised for outreach. Contact policy and opt-out checks still run before every call.':'A checksum or public-page link never authorises outreach. Live evidence and owner confirmation are both required.'}</p>
      </article>
    })}
    {open && <dialog className="voice-dialog" aria-labelledby="import-title" ref={node => {if(node && !node.open)node.showModal()}} onCancel={() => setOpen(false)}><form onSubmit={async e => {e.preventDefault();if(saving)return;setSaving(true);const data=new FormData(e.currentTarget);try {await onImport(prepareSupplier(String(data.get('name')),String(data.get('abn')),String(data.get('phone')),suppliers,String(data.get('email')||'')));setOpen(false);setError('')} catch(err) {setError(err instanceof Error ? err.message : 'Unable to import supplier.')}finally{setSaving(false)}}}><div className="modal-head"><h2 id="import-title">Import supplier</h2><button type="button" className="icon-button" aria-label="Close import" onClick={() => setOpen(false)}><X size={20}/></button></div><p className="muted">Add the supplier exactly as you know it. Importing never grants permission to call or buy.</p><label>Business name<input name="name" required maxLength={160}/></label><label>ABN<input name="abn" inputMode="numeric" placeholder="11 digits" required maxLength={20}/></label><label>Contact phone<input name="phone" type="tel" required maxLength={22}/></label><label>Supplier email (for written briefs and purchase orders)<input name="email" type="email" maxLength={254}/></label>{error && <p role="alert" className="form-error">{error}</p>}<button className="primary full" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Check & queue for verification'}</button><p className="voice-message">The ABN checksum runs on import. Official verification remains a separate server-side step.</p></form></dialog>}
    {completing&&<dialog className="voice-dialog" aria-labelledby="complete-title" ref={node=>{if(node&&!node.open)node.showModal()}} onCancel={()=>setCompleting(null)}><form onSubmit={async event=>{event.preventDefault();if(saving)return;setSaving(true);setError('');const data=new FormData(event.currentTarget);try{const updated=await completeSupplierDetails(completing.id,{abn:String(data.get('abn')),phone:String(data.get('phone')),email:String(data.get('email')||'')});onUpdate({...completing,...updated,status:'Awaiting registry check'});setCompleting(null)}catch(err){setError(err instanceof Error?err.message:'Unable to complete supplier details.')}finally{setSaving(false)}}}><div className="modal-head"><h2 id="complete-title">Complete supplier details</h2><button type="button" className="icon-button" aria-label="Close" onClick={()=>setCompleting(null)}><X size={20}/></button></div><p className="muted">{completing.name} remains blocked from calls until these details are verified and you authorise it.</p><label>ABN<input name="abn" inputMode="numeric" required maxLength={20}/></label><label>Contact phone<input name="phone" type="tel" defaultValue={completing.phone} required maxLength={22}/></label><label>Supplier email<input name="email" type="email" defaultValue={completing.email} maxLength={254}/></label>{error&&<p role="alert" className="form-error">{error}</p>}<button className="primary full" disabled={saving}>{saving?'Saving…':'Save for ABR verification'}</button></form></dialog>}
  </section>
}
