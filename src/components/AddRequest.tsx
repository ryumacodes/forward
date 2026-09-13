import { useMemo, useState } from 'react'
import { Check, ClipboardList, MapPin, ShieldCheck, X } from 'lucide-react'
import type { Recovery } from '../features/recoveries/data'

type AddRequestProps = {
  recoveries: Recovery[]
  onAdd: (request: Recovery) => Recovery | Promise<Recovery>
  onClose: () => void
}

type Draft = {
  item: string
  category: string
  quantity: string
  unit: string
  budget: string
  deadline: string
  location: string
  minimumPaymentDays: string
  maximumDepositPercent: string
  purchaseMode: 'confirm' | 'preauthorised'
  confirmationChannel: 'sms' | 'call'
  requiresHalal: 'no' | 'yes'
  freshness: 'fresh' | 'frozen' | 'either'
  brief: string
}

const stepNames = ['Requirements', 'Delivery', 'Controls']

function defaultDeadline() {
  const value = new Date()
  value.setDate(value.getDate() + 1)
  value.setHours(9, 0, 0, 0)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}T09:00`
}

function nextRequestId(recoveries: Recovery[]) {
  const highest = recoveries.reduce((value, recovery) => Math.max(value, Number(recovery.id.match(/\d+/)?.[0]) || 0), 0)
  return `REC-${String(highest + 1).padStart(3, '0')}`
}

export function AddRequest({ recoveries, onAdd, onClose }: AddRequestProps) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft>({ item: '', category: '', quantity: '', unit: 'units', budget: '', deadline: defaultDeadline(), location: '24 Flinders Lane, Melbourne', minimumPaymentDays: '0', maximumDepositPercent: '0', purchaseMode: 'confirm', confirmationChannel: 'sms', requiresHalal: 'no', freshness: 'either', brief: '' })
  const update = (field: keyof Draft, value: string) => setDraft(current => ({ ...current, [field]: value }))
  const formattedBudget = useMemo(() => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(Number(draft.budget) || 0), [draft.budget])

  function validateCurrentStep() {
    setError('')
    if (step === 0 && (!draft.item.trim() || !draft.category.trim() || !(Number(draft.quantity) > 0))) {
      setError('Enter the requested item, category, and a positive quantity.')
      return false
    }
    if (step === 1 && (!draft.location.trim() || !(Number(draft.budget) > 0) || !draft.deadline)) {
      setError('Enter the delivery location, a positive maximum budget, and the required date and time.')
      return false
    }
    if (step === 1 && new Date(draft.deadline).getTime() <= Date.now()) {
      setError('The required date and time must be in the future.')
      return false
    }
    if (step === 2 && (Number(draft.minimumPaymentDays) < 0 || Number(draft.maximumDepositPercent) < 0 || Number(draft.maximumDepositPercent) > 100)) {
      setError('Payment days cannot be negative, and the deposit limit must be between 0% and 100%.')
      return false
    }
    return true
  }

  function continueFlow() {
    if (!validateCurrentStep()) return
    setStep(current => Math.min(2, current + 1))
  }

  async function submit() {
    if (!validateCurrentStep() || saving) return
    setSaving(true)
    try {
      await onAdd({
        id: nextRequestId(recoveries), item: draft.item.trim(), category: draft.category.trim(), quantity: Number(draft.quantity), unit: draft.unit, budget: Number(draft.budget), deadline: draft.deadline, location: draft.location.trim(), status: 'Ready to source',
        minimumPaymentDays: Number(draft.minimumPaymentDays), maximumDepositPercent: Number(draft.maximumDepositPercent), purchaseMode: draft.purchaseMode, confirmationChannel: draft.confirmationChannel,
        requiresHalal: draft.requiresHalal === 'yes', freshness: draft.freshness, brief: draft.brief.trim() || undefined,
      })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be added.')
    } finally {
      setSaving(false)
    }
  }

  return <dialog className="request-wizard" aria-labelledby="request-wizard-title" ref={node => { if (node && !node.open) node.showModal() }} onCancel={onClose}>
    <div className="modal-head"><div><span className="eyebrow">STRUCTURED REQUEST</span><h2 id="request-wizard-title">Add request</h2></div><button type="button" className="icon-button" aria-label="Close request" onClick={onClose}><X size={20}/></button></div>
    <div className="wizard-steps" aria-label="Request progress">{stepNames.map((name, index) => <div className={index < step ? 'complete' : index === step ? 'current' : ''} key={name}><span>{index < step ? <Check size={13}/> : index + 1}</span><strong>{name}</strong></div>)}</div>
    <form onSubmit={event => { event.preventDefault(); step < 2 ? continueFlow() : submit() }}>
      {step === 0 && <section className="wizard-panel"><div className="wizard-intro"><ClipboardList size={20}/><div><h3>What do you need?</h3><p>Create a structured request manually. The voice agent remains available as a separate, conversational path.</p></div></div><div className="form-grid"><label><span className="field-label">Item or product</span><input name="item" autoFocus value={draft.item} onChange={event => update('item', event.target.value)} placeholder="e.g. Chicken breast" maxLength={160}/></label><label><span className="field-label">Category</span><input name="category" value={draft.category} onChange={event => update('category', event.target.value)} placeholder="e.g. Poultry · Fresh produce" maxLength={120}/></label><label><span className="field-label">Quantity</span><input name="quantity" type="number" min="0.01" step="0.01" value={draft.quantity} onChange={event => update('quantity', event.target.value)}/></label><label><span className="field-label">Unit</span><select name="unit" value={draft.unit} onChange={event => update('unit', event.target.value)}><option>units</option><option>kg</option><option>L</option><option>boxes</option><option>cartons</option><option>packs</option></select></label></div></section>}
      {step === 1 && <section className="wizard-panel"><div className="wizard-intro"><MapPin size={20}/><div><h3>Set delivery and budget</h3><p>These become hard constraints when quotes are compared.</p></div></div><label><span className="field-label">Delivery location</span><input name="location" autoFocus value={draft.location} onChange={event => update('location', event.target.value)} maxLength={220}/></label><div className="form-grid"><label><span className="field-label">Maximum budget (AUD)</span><input name="budget" type="number" min="0.01" step="0.01" value={draft.budget} onChange={event => update('budget', event.target.value)}/></label><label><span className="field-label">Required date and time</span><input name="deadline" type="datetime-local" value={draft.deadline} onChange={event => update('deadline', event.target.value)}/></label></div><label><span className="field-label">Additional requirements <small>Optional</small></span><textarea name="brief" rows={3} value={draft.brief} onChange={event => update('brief', event.target.value)} placeholder="Brand, cut, pack size, certification, substitutions…" maxLength={600}/></label></section>}
      {step === 2 && <section className="wizard-panel"><div className="wizard-intro"><ShieldCheck size={20}/><div><h3>Set purchasing controls</h3><p>The agent can collect and compare quotes, but these rules control escalation and commitment.</p></div></div><div className="form-grid"><label><span className="field-label">Minimum payment terms</span><select name="minimumPaymentDays" value={draft.minimumPaymentDays} onChange={event => update('minimumPaymentDays', event.target.value)}><option value="0">Due on delivery accepted</option><option value="7">Net 7 or better</option><option value="14">Net 14 or better</option><option value="30">Net 30 or better</option></select></label><label><span className="field-label">Maximum deposit</span><select name="maximumDepositPercent" value={draft.maximumDepositPercent} onChange={event => update('maximumDepositPercent', event.target.value)}><option value="0">No deposit</option><option value="10">Up to 10%</option><option value="25">Up to 25%</option><option value="50">Up to 50%</option></select></label><label><span className="field-label">Purchase approval</span><select name="purchaseMode" value={draft.purchaseMode} onChange={event => update('purchaseMode', event.target.value)}><option value="confirm">Owner confirms every order</option><option value="preauthorised">Pre-authorised within all limits</option></select></label><label><span className="field-label">Confirmation channel</span><select name="confirmationChannel" value={draft.confirmationChannel} onChange={event => update('confirmationChannel', event.target.value)}><option value="sms">Text message</option><option value="call">Call first, then text</option></select></label><label><span className="field-label">Halal certification</span><select name="requiresHalal" value={draft.requiresHalal} onChange={event => update('requiresHalal', event.target.value)}><option value="no">Not required</option><option value="yes">Required</option></select></label><label><span className="field-label">Freshness</span><select name="freshness" value={draft.freshness} onChange={event => update('freshness', event.target.value)}><option value="either">Fresh or frozen</option><option value="fresh">Fresh only</option><option value="frozen">Frozen only</option></select></label></div><div className="request-review"><div><span>Request</span><strong>{draft.quantity} {draft.unit} · {draft.item}</strong><small>{draft.category}</small></div><div><span>Delivery</span><strong>{new Date(draft.deadline).toLocaleString('en-AU')}</strong><small>{draft.location}</small></div><div><span>Budget</span><strong>{formattedBudget} maximum</strong><small>Fees must fit inside this total</small></div><div><span>Approval</span><strong>{draft.purchaseMode === 'confirm' ? 'Owner confirms' : 'Pre-authorised within limits'}</strong><small>{draft.confirmationChannel === 'sms' ? 'Confirmation by text' : 'Call first, then text'}</small></div></div></section>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="wizard-actions">{step > 0 && <button type="button" className="secondary" onClick={() => { setError(''); setStep(current => current - 1) }}>Back</button>}<button className="primary" type="submit" disabled={saving}>{step < 2 ? 'Continue' : saving ? 'Adding request…' : 'Add request'}</button></div>
    </form>
  </dialog>
}
