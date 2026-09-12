import { useEffect, useRef, useState } from 'react'
import { X, ShieldCheck, ArrowRight } from 'lucide-react'
import { useVoiceAgent } from '../features/voice/useVoiceAgent'
import { VoiceOrb } from './VoiceOrb'
import type { Recovery } from '../features/recoveries/data'
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((event: { results: { transcript: string }[][] }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null }
export function NewRecovery({ onClose, onCreate }: { onClose: () => void; onCreate: (request: Recovery) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const recognition = useRef<Recognition | null>(null)
  const [brief, setBrief] = useState('')
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const [details, setDetails] = useState(false)
  const agent = useVoiceAgent(text => setBrief(previous => `${previous} ${text}`.trim()))
  const active = agent.configured ? !['idle', 'error'].includes(agent.signal.state) : listening
  const voiceLabel = agent.configured ? ({idle: 'Start conversation', connecting: 'Connecting…', listening: 'Listening · End conversation', thinking: 'Thinking · End conversation', speaking: 'Speaking · End conversation', error: 'Try again'}[agent.signal.state]) : (listening ? 'Stop listening' : 'Tap to talk')
  useEffect(() => { dialog.current?.showModal(); return () => recognition.current?.stop() }, [])
  function listen() {
    if (agent.configured) { void agent.toggle(); return }
    if (listening) { recognition.current?.stop(); return }
    const browser = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const API = browser.SpeechRecognition || browser.webkitSpeechRecognition
    if (!API) { setMessage('Voice input is unavailable in this browser. Type your request below.'); return }
    const instance = new API(); recognition.current = instance
    instance.lang = 'en-AU'; instance.continuous = false; instance.interimResults = false
    instance.onresult = event => { setBrief(previous => `${previous} ${event.results[0][0].transcript}`.trim()); setMessage('Request captured. Add the details below to prepare this demo request.') }
    instance.onerror = () => { setListening(false); setMessage('Microphone unavailable. Check browser permissions or type your request.') }
    instance.onend = () => setListening(false)
    try { instance.start(); setListening(true); setMessage('Listening…') } catch { setMessage('Unable to start the microphone. You can type instead.') }
  }
  return <dialog ref={dialog} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}><form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); onCreate({ id: `REC-${Date.now().toString().slice(-6)}`, item: String(data.get('item')).trim(), quantity: Number(data.get('quantity')), unit: String(data.get('unit')), budget: Number(data.get('budget')), deadline: String(data.get('deadline')), location: String(data.get('location')).trim(), status: 'Ready to source', category: 'Voice request', brief, purchaseMode: String(data.get('purchaseMode')), confirmationChannel: String(data.get('confirmationChannel')), minimumPaymentDays: Number(data.get('minimumPaymentDays')), maximumDepositPercent: Number(data.get('maximumDepositPercent')) }) }}>
    <div className="modal-head"><div><span className="eyebrow">YOUR VOICE PROCUREMENT AGENT</span><h2>What do you need?</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={20}/></button></div>
    <p className="muted">Tell us the item, deadline and budget. We’ll take it from there.</p>
    <button type="button" className={`voice-capture ${active ? 'listening' : ''}`} onClick={listen} aria-pressed={active} aria-label={voiceLabel}><VoiceOrb listening={listening} signal={agent.configured ? agent.signal : undefined}/><strong>{voiceLabel}</strong><span>“30 kilos of chicken tomorrow before 8, max $350.”</span></button>
    <label className="brief-label">Your request<textarea value={brief} onChange={e => setBrief(e.target.value)} placeholder="Or type what you need…" rows={3}/></label>
    {agent.configured && <p className="voice-message" role="status">{agent.signal.state === 'error' ? 'Could not connect. Check microphone permission and agent configuration, then try again.' : `ElevenLabs conversation · ${agent.signal.state}`}</p>}
    {message && <p className="voice-message" role="status">{message}</p>}
    <div className="form-note"><ShieldCheck size={20}/><span>Only your authorised, ABN-verified suppliers.<br/><small>No eligible live suppliers connected in this demo.</small></span></div>
    <label>When a quote meets every requirement<select name="purchaseMode"><option value="confirm">Check with me before buying</option><option value="preauthorised">Authorise purchase within this request’s budget</option></select></label>
    <label>If approval or clarification is needed<select name="confirmationChannel"><option value="call">Call me first, then text if I don’t answer</option><option value="sms">Text me for confirmation</option></select></label>
    <details className="payment-preferences"><summary>Payment terms to negotiate</summary><p className="voice-message">Ask for more time to pay. Changes outside these limits need your confirmation.</p><div className="form-grid"><label>Minimum days from invoice<select name="minimumPaymentDays" defaultValue="14"><option value="0">Due on delivery is okay</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></label><label>Maximum deposit<select name="maximumDepositPercent" defaultValue="0"><option value="0">No deposit</option><option value="10">10%</option><option value="25">25%</option><option value="50">50%</option><option value="100">100% upfront</option></select></label></div></details>
    {!details && <button className="secondary full" type="button" onClick={() => setDetails(true)}>Add request details <ArrowRight size={16}/></button>}
    {details && <><p className="voice-message">Voice-to-structured request parsing is not connected yet. Enter the details for this demo.</p><label>Item<input name="item" placeholder="Chicken breast" required maxLength={100}/></label><div className="form-grid"><label>Quantity<input name="quantity" type="number" min="0.01" step="0.01" placeholder="30" required/></label><label>Unit<select name="unit"><option>kg</option><option>units</option><option>L</option><option>boxes</option></select></label></div><div className="form-grid"><label>Maximum budget (AUD)<input name="budget" type="number" min="1" step="0.01" placeholder="350" required/></label><label>Required by<input name="deadline" type="datetime-local" required/></label></div><label>Delivery address<input name="location" placeholder="Street address, suburb" required maxLength={200}/></label><button className="primary full" type="submit">Create demo request <ArrowRight size={16}/></button></>}
  </form></dialog>
}
