import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, Mic, Phone, ShieldCheck } from '../icons'
import { evaluateNegotiation } from '../features/negotiation/policy'
import { completeLocalOrder, getLocalCallSession, saveLocalCallSession, subscribeLocalCalls, type LocalCallSession, type LocalSupplierQuote } from '../features/local-demo/store'

type Recognition={lang:string;interimResults:boolean;start:()=>void;onresult:((event:{results:ArrayLike<{0:{transcript:string}}>})=>void)|null;onerror:(()=>void)|null;onend:(()=>void)|null}

function say(message:string){if(!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(message);utterance.lang='en-AU';utterance.rate=.98;window.speechSynthesis.speak(utterance)}
function agentTurn(session:LocalCallSession,message:string){session.transcript.push({role:'agent',message,at:new Date().toISOString()});say(message)}
function parseStatement(text:string,current:LocalSupplierQuote){
  const next={...current,statement:text}
  const price=text.match(/(?:\$|aud\s*)(\d+(?:\.\d{1,2})?)/i),quantity=text.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos?|units?|litres?|liters?|boxes?)/i),payment=text.match(/(?:net|payment(?:\s+terms)?(?:\s+of)?)\s*(\d+)\s*days?/i),deposit=text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:deposit|upfront)/i),fees=text.match(/(?:fee|delivery)\s*(?:is|of|costs?)?\s*\$?(\d+(?:\.\d{1,2})?)/i)
  if(price)next.total=Number(price[1]);if(quantity)next.quantity=Number(quantity[1]);if(payment)next.paymentDays=Number(payment[1]);if(deposit)next.depositPercent=Number(deposit[1]);if(fees)next.fees=Number(fees[1]);if(/substitut|alternative/i.test(text))next.exact=false;if(/exact|requested product/i.test(text))next.exact=true
  return next
}

export function LocalSupplierSimulator(){
  const sessionId=new URLSearchParams(location.search).get('session')||''
  const [session,setSession]=useState<LocalCallSession|null>(()=>getLocalCallSession(sessionId))
  const [listening,setListening]=useState(false)
  const defaultQuote=useMemo<LocalSupplierQuote>(()=>({quantity:session?.request.quantity??1,total:Math.round((session?.request.budget??100)*1.12),fees:0,paymentDays:0,depositPercent:20,delivery:session?.request.deadline??'',exact:true,statement:''}),[session?.id])
  const [quote,setQuote]=useState(defaultQuote)
  useEffect(()=>subscribeLocalCalls(next=>{if(next.id===sessionId)setSession({...next})}),[sessionId])
  if(!session)return <main className="local-supplier-shell"><section className="local-supplier-card"><AlertCircle size={28}/><h1>No pending demo call</h1><p>Start a simulated supplier call from the SourcePilot Suppliers page, then keep that dashboard tab open.</p></section></main>
  const update=(next:LocalCallSession)=>{saveLocalCallSession(next);setSession({...next})}
  const confirmation=session.kind==='order_confirmation'
  const answer=()=>{const next={...session,status:'in_progress' as const,transcript:[...session.transcript]};agentTurn(next,confirmation?`Hi, I’m Sarah, the SourcePilot AI procurement assistant calling for Flinders Kitchen. The owner has approved purchase order ${next.orderId} for ${next.request.quantity} ${next.request.unit} of ${next.request.item}. Please confirm the order at the agreed quote, with payment on delivery. No card payment is being taken on this call.`:`Hi, I’m Sarah, the SourcePilot AI procurement assistant calling for Flinders Kitchen about ${next.request.quantity} ${next.request.unit} of ${next.request.item}. Your business was found from its public supplier website. Is now a convenient time for a short quote enquiry? No order will be placed on this call.`);update(next)}
  const confirmOrder=async(accepted:boolean)=>{const next={...session,transcript:[...session.transcript]};next.transcript.push({role:'user',message:accepted?'Confirmed. We accept the purchase order and payment on delivery.':'We cannot accept this order on those terms.',at:new Date().toISOString()});if(accepted){agentTurn(next,`Thank you. I have recorded supplier confirmation for ${next.orderId}. The order is now marked complete in the owner's dashboard. Payment remains due on delivery.`);next.status='completed';next.outcome='fits_rules';if(next.orderId)await completeLocalOrder(next.orderId)}else{agentTurn(next,'Understood. I have not confirmed the order and will return this exception to the owner.');next.status='cancelled';next.outcome='outside_bounds'}update(next)}
  const submit=()=>{
    const next={...session,transcript:[...session.transcript]};next.transcript.push({role:'user',message:quote.statement.trim()||`We can supply ${quote.quantity} ${next.request.unit} for $${quote.total}, delivered ${quote.delivery}, with net ${quote.paymentDays} days and a ${quote.depositPercent}% deposit.`,at:new Date().toISOString()});next.quote={...quote}
    const decision=evaluateNegotiation({maximumTotalCents:BigInt(Math.round(next.request.budget*100)),minimumPaymentDays:next.request.minimumPaymentDays??0,maximumDepositBps:(next.request.maximumDepositPercent??0)*100,maximumCounteroffers:2,allowSubstitutions:false,allowAnonymousMarketAnchor:true,autoPurchase:next.request.purchaseMode==='preauthorized'},{totalCents:BigInt(Math.round(quote.total*100)),paymentDays:quote.paymentDays,depositBps:quote.depositPercent*100,counteroffersMade:next.counteroffers,isSubstitution:!quote.exact,termsConfirmed:true,supplierAskedToStop:/\b(stop|do not call|not interested)\b/i.test(quote.statement)})
    if(decision.action==='stop'){next.status='completed';next.outcome='stopped';agentTurn(next,'Understood. I will end the call and record your opt-out immediately. Thank you.')}
    else if(decision.action==='counter'){
      next.counteroffers+=1;const anchor=decision.canMentionMarketPrice?' We have a lower market option, without identifying the other supplier.':''
      agentTurn(next,`Thanks. I cannot agree to those terms yet: ${decision.reasons.join('; ')}.${anchor} Could you offer a final total at or below $${next.request.budget.toFixed(2)}, at least ${next.request.minimumPaymentDays??0} days from invoice, and no more than ${next.request.maximumDepositPercent??0}% deposit?`)
      next.status='in_progress';next.outcome=undefined
    } else {
      next.status='completed';next.outcome=decision.action==='accept'?'fits_rules':'owner_review'
      agentTurn(next,decision.action==='accept'?'Thank you. Those terms meet the owner’s pre-authorised limits. I will record the quote and send it through the approved workflow. No payment is being made on this call.':'Thank you. I’ll read that back: the final total, quantity, delivery, payment terms and deposit have been recorded. I’ll send the quote to the owner for approval. No order has been placed.')
    }
    update(next)
  }
  const listen=()=>{
    const API=(window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition}).SpeechRecognition||(window as unknown as {webkitSpeechRecognition?:new()=>Recognition}).webkitSpeechRecognition
    if(!API)return
    const recognition=new API();recognition.lang='en-AU';recognition.interimResults=false;recognition.onresult=event=>{const text=event.results[0]?.[0]?.transcript??'';setQuote(current=>parseStatement(text,current))};recognition.onerror=()=>setListening(false);recognition.onend=()=>setListening(false);recognition.start();setListening(true)
  }
  return <main className="local-supplier-shell"><section className="local-supplier-card">
    <div className="local-demo-banner"><ShieldCheck size={17}/><span><strong>Local call simulator</strong>No phone network, provider API, SMS, card charge, or real supplier is used.</span></div>
    <div className="local-call-heading"><div><span className="eyebrow">{confirmation?'ORDER CONFIRMATION CALL':'INCOMING QUOTE CALL'}</span><h1>{session.supplier.name}</h1><p>{session.request.quantity} {session.request.unit} {session.request.item} · {confirmation?'owner-approved · payment on delivery':`up to $${session.request.budget}`}</p></div><span className={`local-call-state ${session.status}`}>{session.status.replace('_',' ')}</span></div>
    {session.status==='ringing'&&<button className="primary local-answer" onClick={answer}><Phone size={18}/> Answer simulated call</button>}
    {session.transcript.length>0&&<div className="local-transcript" aria-live="polite">{session.transcript.map((turn,index)=><div className={`local-turn ${turn.role}`} key={`${turn.at}-${index}`}><span>{turn.role==='agent'?'SARAH · SOURCEPILOT AI':'SUPPLIER'}</span><p>{turn.message}</p></div>)}</div>}
    {session.status==='in_progress'&&confirmation&&<div className="local-quote-form"><h2>Confirm the approved order</h2><p className="muted">The owner already approved this purchase order. This second call confirms acceptance and payment on delivery; it does not charge a payment method.</p><div className="local-order-actions"><button className="primary" onClick={()=>void confirmOrder(true)}><Check size={16}/> Confirm order</button><button className="secondary" onClick={()=>void confirmOrder(false)}>Cannot accept</button></div></div>}
    {session.status==='in_progress'&&!confirmation&&<div className="local-quote-form"><h2>Respond with your quote</h2><label>What the supplier says<textarea value={quote.statement} onChange={event=>setQuote(current=>parseStatement(event.target.value,current))} placeholder="We can supply 30 kg for $380, net 7 days, 20% deposit…" rows={3}/></label><button className="secondary" type="button" onClick={listen}><Mic size={15}/>{listening?'Listening…':'Speak supplier response'}</button><div className="local-quote-grid"><label>Quantity<input type="number" min="0" value={quote.quantity} onChange={event=>setQuote({...quote,quantity:Number(event.target.value)})}/></label><label>Final total (AUD)<input type="number" min="0" value={quote.total} onChange={event=>setQuote({...quote,total:Number(event.target.value)})}/></label><label>Additional fees<input type="number" min="0" value={quote.fees} onChange={event=>setQuote({...quote,fees:Number(event.target.value)})}/></label><label>Payment days<input type="number" min="0" value={quote.paymentDays} onChange={event=>setQuote({...quote,paymentDays:Number(event.target.value)})}/></label><label>Deposit %<input type="number" min="0" max="100" value={quote.depositPercent} onChange={event=>setQuote({...quote,depositPercent:Number(event.target.value)})}/></label><label>Delivery<input type="datetime-local" value={quote.delivery} onChange={event=>setQuote({...quote,delivery:event.target.value})}/></label></div><label className="local-check"><input type="checkbox" checked={quote.exact} onChange={event=>setQuote({...quote,exact:event.target.checked})}/> Exact requested product, not a substitution</label><button className="primary full" onClick={submit}>Send quote to Sarah</button></div>}
    {session.status==='completed'&&<div className="local-complete"><Check size={26}/><h2>{confirmation?'Order confirmed':'Call completed'}</h2><p>{confirmation?'The approved order is complete in the owner dashboard. Payment remains due on delivery.':'The owner dashboard has been updated instantly with this transcript and quote.'}</p></div>}
  </section></main>
}
