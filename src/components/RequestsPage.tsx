import { useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, ChevronRight, Clock3, MapPin, Phone, Plus, Search, ShieldCheck } from '../icons'
import { money, validateOffer, type Offer, type ProcurementRequest } from '../features/requests/data'

type ProcurementRequestFilter = 'All' | ProcurementRequest['status']

type RequestsPageProps = {
  requests: ProcurementRequest[]
  offers: Offer[]
  selectedId: string
  live: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onTranscript: (offer: Offer) => void
}

const stages: ProcurementRequest['status'][] = ['Ready to source', 'Calling suppliers', 'Needs approval', 'Approved']

const statusCopy: Record<ProcurementRequest['status'], { step: number; action: string; activity: string }> = {
  'Ready to source': { step: 1, action: 'Ready for sourcing', activity: 'Supplier outreach has not started' },
  'Calling suppliers': { step: 2, action: 'Sarah is collecting quotes', activity: '2 of 4 suppliers reached' },
  'Needs approval': { step: 3, action: 'Your decision is required', activity: '3 comparable quotes are ready' },
  Approved: { step: 4, action: 'Supplier approved', activity: 'Selection saved and ready to confirm' },
}

function deadlineLabel(value: string) {
  return new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export function RequestsPage({ requests, offers, selectedId, live, onSelect, onCreate, onTranscript }: RequestsPageProps) {
  const [filter, setFilter] = useState<ProcurementRequestFilter>('All')
  const [query, setQuery] = useState('')
  const [showQuotes, setShowQuotes] = useState(false)
  const filtered = useMemo(() => requests.filter(request => {
    const matchesFilter = filter === 'All' || request.status === filter
    const matchesQuery = `${request.id} ${request.item} ${request.category}`.toLowerCase().includes(query.toLowerCase())
    return matchesFilter && matchesQuery
  }), [requests, filter, query])
  const selected = requests.find(request => request.id === selectedId) ?? filtered[0] ?? requests[0]
  const selectedOffers=offers.filter(offer=>offer.requestId?offer.requestId===selected?.id:selected?.id==='REQ-024')
  const recommended=selectedOffers[0]
  const open = requests.filter(request => request.status !== 'Approved').length
  const awaiting = requests.filter(request => request.status === 'Needs approval').length
  const protectedBudget = requests.filter(request => request.status !== 'Approved').reduce((total, request) => total + request.budget, 0)

  function selectRequest(id: string) {
    onSelect(id)
    setShowQuotes(false)
  }

  if (!selected) return <section className="requests-empty"><h2>No requests yet</h2><p>Create a request and SourcePilot will track it here from sourcing through approval.</p><button className="primary" onClick={onCreate}><Plus size={16}/> Create request</button></section>

  const state = statusCopy[selected.status]
  return <section className="requests-page">
    <div className="request-summary" aria-label="Request summary">
      <div><span>Open requests</span><strong>{String(open).padStart(2, '0')}</strong><small>Across active sourcing jobs</small></div>
      <div className={awaiting ? 'attention' : ''}><span>Needs your approval</span><strong>{String(awaiting).padStart(2, '0')}</strong><small>{awaiting ? 'A quote decision is waiting' : 'Nothing waiting on you'}</small></div>
      <div><span>Active supplier calls</span><strong>{requests.filter(request => request.status === 'Calling suppliers').length}</strong><small>{live?'Live sourcing jobs in progress':'Demo outreach in progress'}</small></div>
      <div><span>Open budget protected</span><strong>{money(protectedBudget)}</strong><small>Maximum authorised spend</small></div>
    </div>

    <div className="request-pipeline" aria-label="Request pipeline">
      {stages.map((stage, index) => <button key={stage} className={filter === stage ? 'active' : ''} onClick={() => setFilter(filter === stage ? 'All' : stage)}>
        <span className="pipeline-index">{index + 1}</span><span><strong>{stage}</strong><small>{requests.filter(request => request.status === stage).length} requests</small></span>
      </button>)}
    </div>

    <div className="request-toolbar">
      <div><h2>Request queue</h2><p>Track sourcing progress and resolve the jobs that need you.</p></div>
      <div className="request-toolbar-actions">
        <label className="search"><Search size={16}/><input aria-label="Search request queue" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search requests…"/></label>
        <button className="primary" onClick={onCreate}><Plus size={16}/> New request</button>
      </div>
    </div>

    <div className="request-command-center">
      <div className="request-queue">
        <div className="queue-header"><span>{filter === 'All' ? 'All requests' : filter}</span><button onClick={() => setFilter('All')}>{filtered.length} shown{filter !== 'All' && ' · Clear filter'}</button></div>
        {filtered.map(request => {
          const meta = statusCopy[request.status]
          return <button className={`request-queue-row ${selected.id === request.id ? 'selected' : ''}`} key={request.id} onClick={() => selectRequest(request.id)}>
            <span className={`request-state state-${meta.step}`}><span/></span>
            <span className="queue-main"><span className="queue-id">{request.id} · {request.category}</span><strong>{request.item}</strong><small>{request.quantity} {request.unit} · {money(request.budget)} maximum</small></span>
            <span className="queue-progress"><span><i style={{ width: `${meta.step * 25}%` }}/></span><small>{meta.activity}</small></span>
            <span className="queue-deadline"><Clock3 size={14}/><span><small>Required by</small><strong>{deadlineLabel(request.deadline)}</strong></span></span>
            <ChevronRight size={17}/>
          </button>
        })}
        {filtered.length === 0 && <div className="queue-empty"><Search size={20}/><strong>No matching requests</strong><p>Try a different status or search term.</p></div>}
      </div>

      <aside className="request-inspector">
        <div className="inspector-heading"><div><span className="eyebrow">{selected.id} · {selected.category}</span><h2>{selected.item}</h2><p>{selected.quantity} {selected.unit} required by {deadlineLabel(selected.deadline)}</p></div><span className={`badge ${selected.status === 'Approved' ? 'green' : selected.status === 'Needs approval' ? 'amber' : 'neutral-badge'}`}><span className="status-dot"/>{selected.status}</span></div>

        <div className="request-stage-track">
          {stages.map((stage, index) => <div className={index + 1 < state.step ? 'done' : index + 1 === state.step ? 'current' : ''} key={stage}><span>{index + 1 < state.step ? <Check size={12}/> : index + 1}</span><small>{stage === 'Ready to source' ? 'Brief' : stage === 'Calling suppliers' ? 'Source' : stage === 'Needs approval' ? 'Decide' : 'Complete'}</small></div>)}
        </div>

        <section className="next-action-card">
          <span className="eyebrow">CURRENT STEP</span><h3>{state.action}</h3><p>{selected.status === 'Needs approval' ? 'Sarah found a quote that may satisfy the request. Review its evidence before explicitly approving any purchase order.' : selected.status === 'Calling suppliers' ? 'Sarah is working through the authorised supplier list and recording comparable terms.' : selected.status === 'Approved' ? (live?'The approved purchase state is retained in your workspace with its audit trail.':'The preferred supplier has been selected. No live order has been sent in this demo.') : 'The brief is complete and waiting to enter the supplier queue.'}</p>
        </section>

        <div className="request-facts">
          <div><span>Maximum budget</span><strong>{money(selected.budget)}</strong></div>
          <div><span>Payment target</span><strong>{selected.minimumPaymentDays ?? 0}+ days</strong></div>
          <div><span>Deposit limit</span><strong>{selected.maximumDepositPercent ?? 0}%</strong></div>
          <div><span>Approval mode</span><strong>{selected.purchaseMode === 'preauthorized' ? 'Pre-authorised' : 'Owner confirms'}</strong></div>
        </div>

        <div className="delivery-fact"><MapPin size={16}/><span><small>Deliver to</small><strong>{selected.location}</strong></span></div>

        {recommended && <section className="request-recommendation">
          <div className="recommendation-top"><span><CheckCircle2 size={15}/> Best available quote</span><small>{recommended.live?'Live transcript evidence':'Demo recommendation'}</small></div>
          <div className="recommendation-supplier"><span className="supplier-logo">{recommended.initials}</span><div><strong>{recommended.name}</strong><small>{recommended.exact?'Exact product':'Substitution'} · {recommended.quantity} {selected.unit} · {recommended.onTime?'on time':'timing review'}</small></div><b>{money(recommended.price+recommended.fees)}<small>delivered total</small></b></div>
          <div className="recommendation-saving"><ShieldCheck size={15}/><span><strong>{recommended.price+recommended.fees<=selected.budget?`${money(selected.budget-recommended.price-recommended.fees)} under budget`:'Over budget'}</strong><small>{recommended.paymentDays?`Net ${recommended.paymentDays}`:'Due on delivery'} · {recommended.depositPercent}% deposit · {money(recommended.fees)} fees</small></span></div>
          <button className="primary full" onClick={() => setShowQuotes(value => !value)}>{showQuotes ? 'Hide quote comparison' : `Review all ${selectedOffers.length} quotes`} <ArrowRight size={15}/></button>
        </section>}

        {showQuotes && recommended && <div className="compact-quotes">
          {selectedOffers.map(offer => {
            const checks = validateOffer(offer, selected)
            const failures = Object.entries(checks).filter(([, passes]) => !passes).map(([label]) => label)
            return <button key={offer.id} onClick={() => onTranscript(offer)}><span className={failures.length ? 'quote-excluded' : 'quote-best'}>{failures.length ? '—' : 'Best'}</span><span><strong>{offer.name}</strong><small>{failures.length ? failures.join(' · ') : `${offer.quantity}kg · ${offer.delivery}`}</small></span><b>{money(offer.price + offer.fees)}</b></button>
          })}
        </div>}

        {selected.status === 'Calling suppliers' && <div className="live-activity-card"><div><Phone size={16}/><span><strong>Supplier outreach</strong><small>{live?`${selectedOffers.length} completed quote${selectedOffers.length===1?'':'s'} · open the supplier queue for current attempts`:'2 completed · 1 unanswered · 1 queued'}</small></span></div><span className="activity-pulse"/> </div>}
      </aside>
    </div>
  </section>
}
