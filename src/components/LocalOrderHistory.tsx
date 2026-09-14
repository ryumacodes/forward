import { Check, Clock3, Package, Phone, RotateCcw, ShieldCheck } from '../icons'
import { money } from '../features/requests/data'
import type { LocalOrder } from '../features/local-demo/store'

export function LocalOrderHistory({orders,onRepeat,onOpenCall}:{orders:LocalOrder[];onRepeat:(order:LocalOrder)=>Promise<void>;onOpenCall:(order:LocalOrder)=>void}){
  return <section className="local-order-history">
    <div className="section-header"><div><h2>Successfully negotiated suppliers</h2><p>Owner-approved order history from this browser-local simulation.</p></div><span className="demo-badge">{orders.filter(order=>order.status==='completed').length} completed</span></div>
    {orders.length===0?<div className="import-empty"><Package size={22}/><p>Approve a qualifying live-demo quote to create the confirmation call and order history.</p></div>:orders.map(order=><article className="local-order-row" key={order.id}>
      <span className={`local-order-icon ${order.status}`} >{order.status==='completed'?<Check size={18}/>:<Clock3 size={18}/>}</span>
      <div><span className="eyebrow">{order.id} · {order.status==='completed'?'ORDER COMPLETE':'CONFIRMATION CALL PENDING'}</span><h3>{order.supplierName}</h3><p>{order.quantity} {order.unit} {order.item} · {money(order.total)} · {order.paymentTerms}</p></div>
      <div className="local-order-meta"><span><ShieldCheck size={14}/> Owner approved</span><small>{new Date(order.completedAt??order.approvedAt).toLocaleString('en-AU')}</small></div>
      <div className="local-order-actions">{order.status==='awaiting_confirmation'&&<button className="primary" onClick={()=>onOpenCall(order)}><Phone size={14}/> Open confirmation call</button>}<button className="secondary" onClick={()=>void onRepeat(order)}><RotateCcw size={14}/> Repeat order</button></div>
    </article>)}
  </section>
}
