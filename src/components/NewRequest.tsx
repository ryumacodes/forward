import { useEffect, useRef, useState } from 'react'
import { X, ShieldCheck, ArrowRight, Check, AlertCircle } from '../icons'
import { useVoiceAgent } from '../features/voice/useVoiceAgent'
import { VoiceOrb } from './VoiceOrb'
import type { ProcurementRequest } from '../features/requests/data'
import { normalizeProcurementIntake, type IntakeNormalization } from '../features/intake/normalize'
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((event: { results: { transcript: string }[][] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null }
declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition
    webkitSpeechRecognition?: new () => Recognition
  }
}
export function NewRequest({ onClose, onCreate }: { onClose: () => void; onCreate: (request: ProcurementRequest) => void | Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const recognition = useRef<Recognition | null>(null)
  const [brief, setBrief] = useState('')
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const [saving,setSaving] = useState(false)
  const [normalizing,setNormalizing] = useState(false)
  const [saveError,setSaveError] = useState('')
  const [details, setDetails] = useState(false)
  const [normalization,setNormalization] = useState<IntakeNormalization | null>(null)
  const [draft,setDraft] = useState({item:'',quantity:'',unit:'kg',budget:'',deadline:'',location:'',minimumPaymentDays:'14',maximumDepositPercent:'0',halal:'',cut:'',freshness:''})
  const agent = useVoiceAgent(text => setBrief(previous => `${previous} ${text}`.trim()))
  const active = agent.configured ? !['idle', 'error'].includes(agent.signal.state) : listening
  const voiceLabel = agent.configured ? ({idle: 'Start conversation', connecting: 'Connecting…', listening: 'Listening · End conversation', thinking: 'Thinking · End conversation', speaking: 'Speaking · End conversation', error: 'Try again'}[agent.signal.state]) : (listening ? 'Stop listening' : 'Tap to talk')
  useEffect(() => { dialog.current?.showModal(); return () => recognition.current?.stop() }, [])
  useEffect(() => {
    if (details) dialog.current?.querySelector<HTMLInputElement>('input[name="item"]')?.focus()
  }, [details])
  function listen() {
    if (agent.configured) { void agent.toggle(); return }
    if (listening) { recognition.current?.stop(); return }
    const API = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!API) { setMessage('Voice input is unavailable in this browser. Type your request below.'); return }
    const instance = new API(); recognition.current = instance
    instance.lang = 'en-AU'; instance.continuous = false; instance.interimResults = false
    instance.onresult = event => { setBrief(previous => `${previous} ${event.results[0][0].transcript}`.trim()); setMessage('Request captured. Add the details below to prepare this demo request.') }
    instance.onerror = () => { setListening(false); setMessage('Microphone unavailable. Check browser permissions or type your request.') }
    instance.onend = () => setListening(false)
    try { instance.start(); setListening(true); setMessage('Listening…') } catch { setMessage('Unable to start the microphone. You can type instead.') }
  }
  async function reviewRequest() {
    if(normalizing)return
    setNormalizing(true);setSaveError('');setMessage('')
    try {
      const normalized = await normalizeProcurementIntake('voice_note',brief)
      const result = normalized.result
      setNormalization(normalized)
      setDraft(previous => ({
        ...previous,
        item:result.item ?? '',
        quantity:result.quantity == null ? '' : String(result.quantity),
        unit:result.unit ?? previous.unit,
        budget:result.budgetCents == null ? '' : String(result.budgetCents / 100),
        deadline:result.deadline ?? '',
        location:result.deliveryLocation ?? '',
        minimumPaymentDays:result.paymentDays == null ? previous.minimumPaymentDays : String(result.paymentDays),
        maximumDepositPercent:result.depositBps == null ? previous.maximumDepositPercent : String(result.depositBps / 100),
        halal:result.halal == null ? '' : result.halal ? 'yes' : 'no',
        cut:result.cut ?? '',
        freshness:result.freshness ?? '',
      }))
      setDetails(true)
      setMessage(result.missingFields.length ? `I structured the request. Check the ${result.missingFields.join(', ')} fields before creating it.` : 'Request structured. Review the evidence and confirm the details below.')
    } catch(error) { setSaveError(error instanceof Error ? error.message : 'Could not structure this request.') }
    finally { setNormalizing(false) }
  }
  return <dialog className={`voice-dialog ${details ? 'review-mode' : 'conversation-mode'}`} aria-labelledby="voice-dialog-title" ref={dialog} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}><form className="voice-dialog-form" onSubmit={async e => { e.preventDefault(); if(saving)return; setSaving(true);setSaveError(''); const data = new FormData(e.currentTarget); try { await onCreate({ id: `REQ-${Date.now().toString().slice(-6)}`, item: String(data.get('item')).trim(), quantity: Number(data.get('quantity')), unit: String(data.get('unit')), budget: Number(data.get('budget')), deadline: String(data.get('deadline')), location: String(data.get('location')).trim(), status: 'Ready to source', category: 'Voice request', brief, purchaseMode: String(data.get('purchaseMode')) as ProcurementRequest['purchaseMode'], buyingProfile: String(data.get('buyingProfile')) as ProcurementRequest['buyingProfile'], confirmationChannel: String(data.get('confirmationChannel')), minimumPaymentDays: Number(data.get('minimumPaymentDays')), maximumDepositPercent: Number(data.get('maximumDepositPercent')), requiresHalal:data.get('halal')==='yes', cut:String(data.get('cut')||'')||undefined, freshness:(String(data.get('freshness')||'')||undefined) as ProcurementRequest['freshness'] }) } catch(error) {setSaveError(error instanceof Error ? error.message : 'Could not save request. Try again.')} finally {setSaving(false)} }}>
    <div className="modal-head"><div><span className="eyebrow">SOURCEPILOT VOICE</span><h2 id="voice-dialog-title">{details ? 'Review your request' : 'Sarah'}</h2></div><button type="button" className="icon-button" aria-label="Close voice conversation" onClick={onClose}><X size={22}/></button></div>
    <p className="muted">{details ? 'Check the structured details before Sarah starts sourcing.' : active ? voiceLabel.split(' ·')[0] : 'Tell Sarah what you need, naturally.'}</p>
    <button type="button" className={`voice-capture ${active ? 'listening' : ''}`} onClick={listen} aria-pressed={active} aria-label={voiceLabel}><VoiceOrb listening={listening} signal={agent.configured ? agent.signal : undefined} size={224}/><strong>{voiceLabel}</strong><span>“30 kilos of chicken tomorrow before 8, max $350.”</span></button>
    <label className="brief-label"><span>Your request</span><textarea value={brief} onChange={e => {setBrief(e.target.value);setNormalization(null)}} placeholder="Message Sarah…" rows={3}/></label>
    {agent.configured && <p className="voice-message" role="status">{agent.signal.state === 'error' ? 'Could not connect. Check microphone permission and agent configuration, then try again.' : `ElevenLabs conversation · ${agent.signal.state}`}</p>}
    {message && <p className="voice-message" role="status">{message}</p>}
    <details className="request-preferences"><summary>Approval & payment preferences</summary><div className="form-note"><ShieldCheck size={20}/><span>Only your authorised, ABN-verified suppliers.<br/><small>No eligible live suppliers connected in this demo.</small></span></div>
    <label>Buying profile<select name="buyingProfile" defaultValue="hospitality"><option value="hospitality">Hospitality & perishables</option><option value="construction">Construction & urgent materials</option><option value="general">General wholesale</option></select></label>
    <label>When a quote meets every requirement<select name="purchaseMode"><option value="confirm">Check with me before issuing a purchase order</option><option value="preauthorized">Issue the PO automatically within these exact limits</option></select></label>
    <label>If approval or clarification is needed<select name="confirmationChannel"><option value="call">Call me first, then text if I don’t answer</option><option value="sms">Text me for confirmation</option></select></label>
    <details className="payment-preferences"><summary>Payment terms to negotiate</summary><p className="voice-message">Ask for more time to pay. Changes outside these limits need your confirmation.</p><div className="form-grid"><label>Minimum days from invoice<select name="minimumPaymentDays" value={draft.minimumPaymentDays} onChange={event => setDraft({...draft,minimumPaymentDays:event.target.value})}><option value="0">Due on delivery is okay</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></label><label>Maximum deposit<select name="maximumDepositPercent" value={draft.maximumDepositPercent} onChange={event => setDraft({...draft,maximumDepositPercent:event.target.value})}><option value="0">No deposit</option><option value="10">10%</option><option value="25">25%</option><option value="50">50%</option><option value="100">100% upfront</option></select></label></div></details>
    </details>
    {saveError && <p className="form-error" role="alert">{saveError}</p>}
    {!details && <button className="secondary full" type="button" disabled={normalizing || !brief.trim()} onClick={reviewRequest}>{normalizing ? 'Structuring request…' : 'Review structured request'} <ArrowRight size={16}/></button>}
    {details && <>
      {normalization && <section className="intake-review" aria-label="Structured request review"><div className="intake-review-head"><span className={normalization.result.missingFields.length ? 'review-needed' : 'review-ready'}>{normalization.result.missingFields.length ? <AlertCircle size={15}/> : <Check size={15}/>} {normalization.result.missingFields.length ? 'Check missing details' : 'Ready for review'}</span><strong>{Math.round(normalization.result.confidence * 100)}% confidence</strong></div><p>{normalization.mode === 'live' ? `Structured with ${normalization.model}` : 'Structured locally for this demo. Connect Supabase to use the live extraction model.'}</p>{normalization.result.evidence.length > 0 && <details><summary>Evidence from your request</summary>{normalization.result.evidence.map((evidence,index) => <span key={`${evidence.field}-${index}`}><b>{evidence.field}</b> “{evidence.text}”</span>)}</details>}</section>}
      <label>Item<input name="item" value={draft.item} onChange={event => setDraft({...draft,item:event.target.value})} placeholder="Chicken breast" required maxLength={100}/></label>
      <div className="form-grid"><label>Quantity<input name="quantity" value={draft.quantity} onChange={event => setDraft({...draft,quantity:event.target.value})} type="number" min="0.01" step="0.01" placeholder="30" required/></label><label>Unit<select name="unit" value={draft.unit} onChange={event => setDraft({...draft,unit:event.target.value})}><option>kg</option><option>units</option><option>L</option><option>boxes</option></select></label></div>
      <div className="form-grid"><label>Maximum budget (AUD)<input name="budget" value={draft.budget} onChange={event => setDraft({...draft,budget:event.target.value})} type="number" min="1" step="0.01" placeholder="350" required/></label><label>Required by<input name="deadline" value={draft.deadline} onChange={event => setDraft({...draft,deadline:event.target.value})} type="datetime-local" required/></label></div>
      <label>Delivery address<input name="location" value={draft.location} onChange={event => setDraft({...draft,location:event.target.value})} placeholder="Street address, suburb" required maxLength={200}/></label>
      {normalization && (normalization.result.halal != null || normalization.result.cut != null || normalization.result.freshness != null || ['halal','cut','freshness'].some(field=>normalization.result.missingFields.includes(field))) && <fieldset className="product-requirements"><legend>Product requirements</legend><div className="form-grid"><label>Halal requirement<select name="halal" value={draft.halal} onChange={event=>setDraft({...draft,halal:event.target.value})} required><option value="">Choose one</option><option value="yes">Halal required</option><option value="no">No halal requirement</option></select></label><label>Cut or format<input name="cut" value={draft.cut} onChange={event=>setDraft({...draft,cut:event.target.value})} placeholder="e.g. breast fillets" required maxLength={80}/></label></div><label>Freshness<select name="freshness" value={draft.freshness} onChange={event=>setDraft({...draft,freshness:event.target.value})} required><option value="">Choose one</option><option value="fresh">Fresh</option><option value="frozen">Frozen</option><option value="either">Either</option></select></label></fieldset>}
      <button className="text-button renormalize" type="button" onClick={reviewRequest} disabled={normalizing}>{normalizing ? 'Checking again…' : 'Re-run extraction from my request'}</button>
      <button className="primary full request-submit" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Confirm & create request'} <ArrowRight size={16}/></button>
    </>}
  </form></dialog>
}
