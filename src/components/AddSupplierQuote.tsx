import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, FileCheck2, ShieldCheck, UserRoundPlus, X } from 'lucide-react'
import type { Offer, Recovery } from '../features/recoveries/data'
import { checkAbn } from '../features/suppliers/verification'

type AddSupplierQuoteProps = {
  recoveries: Recovery[]
  initialRecoveryId: string
  onAdd: (offer: Offer) => void | Promise<void>
  onClose: () => void
}

type Draft = {
  recoveryId: string
  supplierName: string
  abn: string
  contactName: string
  phone: string
  email: string
  source: string
  quantity: string
  subtotal: string
  fees: string
  delivery: string
  paymentDays: string
  depositPercent: string
  productFit: 'exact' | 'substitution'
  note: string
}

const stepNames = ['Supplier', 'Quote', 'Review']

function deliveryLabel(value: string) {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function AddSupplierQuote({ recoveries, initialRecoveryId, onAdd, onClose }: AddSupplierQuoteProps) {
  const initialRecovery = recoveries.find(recovery => recovery.id === initialRecoveryId) ?? recoveries[0]
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft>({
    recoveryId: initialRecovery?.id ?? '', supplierName: '', abn: '', contactName: '', phone: '', email: '', source: 'Owner referral',
    quantity: initialRecovery ? String(initialRecovery.quantity) : '', subtotal: '', fees: '0', delivery: '', paymentDays: String(initialRecovery?.minimumPaymentDays ?? 0),
    depositPercent: '0', productFit: 'exact', note: '',
  })
  const recovery = useMemo(() => recoveries.find(item => item.id === draft.recoveryId) ?? initialRecovery, [draft.recoveryId, initialRecovery, recoveries])
  const update = (field: keyof Draft, value: string) => setDraft(current => ({ ...current, [field]: value }))

  function validateCurrentStep() {
    setError('')
    if (step === 0) {
      if (!draft.recoveryId || !draft.supplierName.trim()) return setError('Choose a recovery and enter the supplier’s business name.'), false
      if (!checkAbn(draft.abn)) return setError('Enter a valid 11-digit ABN that passes the checksum.'), false
      if (!/^\+?[\d\s()-]{8,22}$/.test(draft.phone) || draft.phone.replace(/\D/g, '').length < 8) return setError('Enter a valid supplier phone number.'), false
      if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) return setError('Enter a valid supplier email address or leave it blank.'), false
    }
    if (step === 1) {
      if (!(Number(draft.quantity) > 0) || !(Number(draft.subtotal) > 0) || !draft.delivery) return setError('Enter a positive quantity, quoted subtotal, and delivery time.'), false
      if (Number(draft.fees) < 0 || Number(draft.paymentDays) < 0 || Number(draft.depositPercent) < 0 || Number(draft.depositPercent) > 100) return setError('Fees and payment days cannot be negative, and the deposit must be between 0% and 100%.'), false
    }
    return true
  }

  function continueFlow() {
    if (!validateCurrentStep()) return
    setStep(current => Math.min(2, current + 1))
  }

  async function submit() {
    if (!recovery || saving) return
    setSaving(true)
    setError('')
    try {
      const name = draft.supplierName.trim()
      const delivery = new Date(draft.delivery)
      await onAdd({
        id: crypto.randomUUID(), requestId: recovery.id, name, initials: name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(), item: recovery.item,
        quantity: Number(draft.quantity), price: Number(draft.subtotal), fees: Number(draft.fees), delivery: deliveryLabel(draft.delivery), onTime: delivery.getTime() <= new Date(recovery.deadline).getTime(), exact: draft.productFit === 'exact',
        minutes: 'Manually captured', paymentDays: Number(draft.paymentDays), originalPaymentDays: Number(draft.paymentDays), depositPercent: Number(draft.depositPercent), onTimeDeliveries: 0, completedOrders: 0,
        authorised: false, abnVerified: false, termsConfirmed: true, live: false, manuallyAdded: true,
        supplierContact: { abn: draft.abn.replace(/\s/g, ''), contactName: draft.contactName.trim() || undefined, phone: draft.phone.trim(), email: draft.email.trim() || undefined, source: draft.source, note: draft.note.trim() || undefined },
      })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The supplier quote could not be added.')
    } finally {
      setSaving(false)
    }
  }

  return <dialog className="quote-wizard" aria-labelledby="quote-wizard-title" ref={node => { if (node && !node.open) node.showModal() }} onCancel={onClose}>
    <div className="modal-head"><div><span className="eyebrow">SUPPLIER QUOTE INTAKE</span><h2 id="quote-wizard-title">Add supplier lead & quote</h2></div><button type="button" className="icon-button" aria-label="Close supplier quote" onClick={onClose}><X size={20}/></button></div>
    <div className="wizard-steps" aria-label="Quote intake progress">{stepNames.map((name, index) => <div className={index < step ? 'complete' : index === step ? 'current' : ''} key={name}><span>{index < step ? <Check size={13}/> : index + 1}</span><strong>{name}</strong></div>)}</div>
    <form onSubmit={event => { event.preventDefault(); step < 2 ? continueFlow() : submit() }}>
      {step === 0 && <section className="wizard-panel"><div className="wizard-intro"><UserRoundPlus size={20}/><div><h3>Connect the lead to a recovery</h3><p>Capture a real business identity and contact route before recording commercial terms.</p></div></div><label>Recovery<select name="recovery" value={draft.recoveryId} onChange={event => { const next = recoveries.find(item => item.id === event.target.value); update('recoveryId', event.target.value); if (next) setDraft(current => ({ ...current, recoveryId: next.id, quantity: String(next.quantity) })) }}>{recoveries.map(item => <option key={item.id} value={item.id}>{item.id} · {item.item}</option>)}</select></label><div className="form-grid"><label>Supplier business name<input name="supplierName" autoFocus value={draft.supplierName} onChange={event => update('supplierName', event.target.value)} maxLength={160}/></label><label>ABN<input name="abn" inputMode="numeric" placeholder="11 digits" value={draft.abn} onChange={event => update('abn', event.target.value)} maxLength={20}/></label><label>Contact person <small>Optional</small><input name="contactName" value={draft.contactName} onChange={event => update('contactName', event.target.value)} maxLength={100}/></label><label>Contact phone<input name="phone" type="tel" value={draft.phone} onChange={event => update('phone', event.target.value)} maxLength={22}/></label><label>Supplier email <small>Optional</small><input name="email" type="email" value={draft.email} onChange={event => update('email', event.target.value)} maxLength={254}/></label><label>How was this supplier found?<select name="source" value={draft.source} onChange={event => update('source', event.target.value)}><option>Owner referral</option><option>Supplier email</option><option>Inbound phone call</option><option>Web discovery</option><option>Existing relationship</option></select></label></div></section>}
      {step === 1 && <section className="wizard-panel"><div className="wizard-intro"><FileCheck2 size={20}/><div><h3>Record comparable quote terms</h3><p>Enter the supplier’s stated terms. Backfill will compare them with the recovery’s limits.</p></div></div><div className="selected-recovery"><span>{recovery?.id}</span><strong>{recovery?.item}</strong><small>{recovery?.quantity} {recovery?.unit} · {recovery ? `${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(recovery.budget)} maximum` : ''}</small></div><div className="form-grid"><label>Quantity offered<input name="quantity" autoFocus type="number" min="0.01" step="0.01" value={draft.quantity} onChange={event => update('quantity', event.target.value)}/></label><label>Product match<select name="productFit" value={draft.productFit} onChange={event => update('productFit', event.target.value)}><option value="exact">Exact requested product</option><option value="substitution">Supplier substitution</option></select></label><label>Quoted subtotal (AUD)<input name="subtotal" type="number" min="0.01" step="0.01" value={draft.subtotal} onChange={event => update('subtotal', event.target.value)}/></label><label>Additional fees (AUD)<input name="fees" type="number" min="0" step="0.01" value={draft.fees} onChange={event => update('fees', event.target.value)}/></label><label>Delivery date and time<input name="delivery" type="datetime-local" value={draft.delivery} onChange={event => update('delivery', event.target.value)}/></label><label>Payment terms (days)<input name="paymentDays" type="number" min="0" step="1" value={draft.paymentDays} onChange={event => update('paymentDays', event.target.value)}/></label><label>Deposit required (%)<input name="depositPercent" type="number" min="0" max="100" step="0.1" value={draft.depositPercent} onChange={event => update('depositPercent', event.target.value)}/></label><label>Evidence note <small>Optional</small><input name="note" placeholder="e.g. Quote received by email" value={draft.note} onChange={event => update('note', event.target.value)} maxLength={240}/></label></div></section>}
      {step === 2 && recovery && <section className="wizard-panel"><div className="wizard-intro"><ShieldCheck size={20}/><div><h3>Review before adding</h3><p>This records evidence; it does not authorise a call, message, purchase, or supplier.</p></div></div><div className="quote-review"><div><span>Recovery</span><strong>{recovery.id} · {recovery.item}</strong></div><div><span>Supplier</span><strong>{draft.supplierName}</strong><small>ABN {draft.abn.replace(/\s/g, '')}</small></div><div><span>Offer</span><strong>{draft.quantity} {recovery.unit} · {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(draft.subtotal) + Number(draft.fees))} total</strong><small>{draft.productFit === 'exact' ? 'Exact product' : 'Substitution'} · {deliveryLabel(draft.delivery)}</small></div><div><span>Terms</span><strong>Net {draft.paymentDays || 0} · {draft.depositPercent || 0}% deposit</strong><small>{new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(draft.fees))} additional fees</small></div></div><div className="wizard-safety"><ShieldCheck size={17}/><p>The lead enters the supplier verification queue as unauthorised. Its quote remains clearly marked as manually captured until ABR and contact evidence are complete.</p></div></section>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="wizard-actions">{step > 0 && <button type="button" className="secondary" onClick={() => { setError(''); setStep(current => current - 1) }}><ArrowLeft size={15}/> Back</button>}<button className="primary" type="submit" disabled={saving}>{step < 2 ? <>Continue <ArrowRight size={15}/></> : saving ? 'Adding supplier…' : <>Add supplier quote <Check size={15}/></>}</button></div>
    </form>
  </dialog>
}
