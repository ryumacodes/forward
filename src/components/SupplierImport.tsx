import { useState } from 'react'
import { AlertTriangle, Check, Clock3, ExternalLink, Phone, Plus, ShieldCheck, X } from 'lucide-react'
import { prepareSupplier, type ImportedSupplier } from '../features/suppliers/verification'
import { authoriseVerifiedSupplier, verifySupplierAbn } from '../features/suppliers/registry'
import { startSupplierCall } from '../features/voice/outbound'

type SupplierImportProps = {
  suppliers: ImportedSupplier[]
  onImport: (supplier: ImportedSupplier) => void | Promise<void>
  onUpdate: (supplier: ImportedSupplier) => void
  activeRequestId?: string
  onCallStarted?: (message:string) => void
}

export function SupplierImport({suppliers,onImport,onUpdate,activeRequestId,onCallStarted}:SupplierImportProps) {
  const [open,setOpen] = useState(false)
  const [saving,setSaving] = useState(false)
  const [workingId,setWorkingId] = useState('')
  const [error,setError] = useState('')

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
    try {const result=await startSupplierCall(supplier.id,activeRequestId||'');onCallStarted?.(`Live call initiated. Conversation ${result.conversationId}.`)}
    catch(err){setError(err instanceof Error?err.message:'Unable to start this call.')}
    finally{setWorkingId('')}
  }

  return <section className="supplier-import">
    <div className="section-header"><div><h2>Supplier verification queue</h2><p>Import → live ABR evidence → owner confirmation → authorised outreach.</p></div><button className="primary" onClick={() => setOpen(true)}><Plus size={17}/> Import supplier</button></div>
    {error && <p className="form-error registry-error" role="alert">{error}</p>}
    {suppliers.length === 0 && <div className="import-empty"><ShieldCheck size={22}/><p>Imported suppliers stay outside your calling list until their ABR evidence and contact details are confirmed.</p></div>}
    {suppliers.map(supplier => {
      const verification=supplier.verification
      const ready=Boolean(verification?.active&&verification.nameMatched)
      return <article className="import-record registry-record" key={supplier.id}>
        <div className="registry-record-head"><div><span className="eyebrow">{supplier.status}</span><h3>{supplier.name}</h3><p>ABN {supplier.abn} · {supplier.phone}</p></div><span className={`registry-state ${supplier.authorised?'authorised':ready?'verified':verification?'review':''}`}>{supplier.authorised?<><Check size={14}/> Authorised</>:ready?<><ShieldCheck size={14}/> ABR checked</>:verification?<><AlertTriangle size={14}/> Review</>:<><Clock3 size={14}/> Pending</>}</span></div>
        <div className="checks"><span><Check size={14}/> ABN checksum passed</span>{verification?<><span className={verification.active?'':'failed'}>{verification.active?<Check size={14}/>:<X size={14}/>} ABN {verification.active?'active':'not active'}</span><span className={verification.nameMatched?'':'failed'}>{verification.nameMatched?<Check size={14}/>:<X size={14}/>} Name {verification.nameMatched?'matched':'needs review'}</span></>:<span className="failed"><Clock3 size={14}/> Registry evidence pending</span>}</div>
        {verification && <div className="registry-evidence"><div><span>ABR entity name</span><strong>{verification.legalName||'Not returned'}</strong></div><div><span>GST registration</span><strong>{verification.gstRegistered?'Registered':'Not shown as registered'}</strong></div><div><span>Main business location</span><strong>{[verification.state,verification.postcode].filter(Boolean).join(' ')||'Not returned'}</strong></div><div><span>Checked</span><strong>{new Date(verification.checkedAt).toLocaleString('en-AU')}</strong></div></div>}
        <div className="registry-actions">
          <a className="secondary" href={`https://abr.business.gov.au/ABN/View?abn=${supplier.abn}`} target="_blank" rel="noreferrer">View public ABR record <ExternalLink size={14}/></a>
          {!supplier.authorised && <button className="secondary" disabled={workingId===supplier.id} onClick={()=>verify(supplier)}>{workingId===supplier.id?'Checking ABR…':verification?'Refresh ABR evidence':'Verify with ABR'}</button>}
          {!supplier.authorised&&ready&&<button className="primary" disabled={workingId===supplier.id} onClick={()=>authorise(supplier)}>{workingId===supplier.id?'Authorising…':'Confirm contact & authorise'}</button>}
          {supplier.authorised&&<button className="primary" disabled={workingId===supplier.id||!activeRequestId} onClick={()=>call(supplier)}><Phone size={14}/>{workingId===supplier.id?'Starting call…':activeRequestId?'Start live quote call':'Select a recovery first'}</button>}
        </div>
        <p className="registry-caveat"><ShieldCheck size={14}/>{supplier.authorised?'Owner-authorised for outreach. Contact policy and opt-out checks still run before every call.':'A checksum or public-page link never authorises outreach. Live evidence and owner confirmation are both required.'}</p>
      </article>
    })}
    {open && <dialog className="voice-dialog" aria-labelledby="import-title" ref={node => {if(node && !node.open)node.showModal()}} onCancel={() => setOpen(false)}><form onSubmit={async e => {e.preventDefault();if(saving)return;setSaving(true);const data=new FormData(e.currentTarget);try {await onImport(prepareSupplier(String(data.get('name')),String(data.get('abn')),String(data.get('phone')),suppliers));setOpen(false);setError('')} catch(err) {setError(err instanceof Error ? err.message : 'Unable to import supplier.')}finally{setSaving(false)}}}><div className="modal-head"><h2 id="import-title">Import supplier</h2><button type="button" className="icon-button" aria-label="Close import" onClick={() => setOpen(false)}><X size={20}/></button></div><p className="muted">Add the supplier exactly as you know it. Importing never grants permission to call or buy.</p><label>Business name<input name="name" required maxLength={160}/></label><label>ABN<input name="abn" inputMode="numeric" placeholder="11 digits" required maxLength={20}/></label><label>Contact phone<input name="phone" type="tel" required maxLength={22}/></label>{error && <p role="alert" className="form-error">{error}</p>}<button className="primary full" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Check & queue for verification'}</button><p className="voice-message">The ABN checksum runs on import. Official verification remains a separate server-side step.</p></form></dialog>}
  </section>
}
