import { useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, ChevronRight, Clock3, MapPin, Phone, Plus, Search, ShieldCheck } from 'lucide-react'
import { money, validateOffer, type Offer, type Recovery } from '../features/recoveries/data'

type RecoveryFilter = 'All' | Recovery['status']

type RecoveriesPageProps = {
  recoveries: Recovery[]
  offers: Offer[]
  selectedId: string
  onSelect: (id: string) => void
  onCreate: () => void
  onTranscript: (offer: Offer) => void
}

const stages: Recovery['status'][] = ['Ready to source', 'Calling suppliers', 'Needs approval', 'Approved']

const statusCopy: Record<Recovery['status'], { step: number; action: string; activity: string }> = {
  'Ready to source': { step: 1, action: 'Ready for sourcing', activity: 'Supplier outreach has not started' },
  'Calling suppliers': { step: 2, action: 'Agent is collecting quotes', activity: '2 of 4 suppliers reached' },
  'Needs approval': { step: 3, action: 'Your decision is required', activity: '3 comparable quotes are ready' },
  Approved: { step: 4, action: 'Supplier approved', activity: 'Selection saved and ready to confirm' },
}

function deadlineLabel(value: string) {
  return new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export function RecoveriesPage({ recoveries, offers, selectedId, onSelect, onCreate, onTranscript }: RecoveriesPageProps) {
  const [filter, setFilter] = useState<RecoveryFilter>('All')
  const [query, setQuery] = useState('')
  const [showQuotes, setShowQuotes] = useState(false)
  const filtered = useMemo(() => recoveries.filter(recovery => {
    const matchesFilter = filter === 'All' || recovery.status === filter
    const matchesQuery = `${recovery.id} ${recovery.item} ${recovery.category}`.toLowerCase().includes(query.toLowerCase())
    return matchesFilter && matchesQuery
  }), [recoveries, filter, query])
  const selected = recoveries.find(recovery => recovery.id === selectedId) ?? filtered[0] ?? recoveries[0]
  const open = recoveries.filter(recovery => recovery.status !== 'Approved').length
  const awaiting = recoveries.filter(recovery => recovery.status === 'Needs approval').length
  const protectedBudget = recoveries.filter(recovery => recovery.status !== 'Approved').reduce((total, recovery) => total + recovery.budget, 0)

  function selectRecovery(id: string) {
    onSelect(id)
    setShowQuotes(false)
  }

  if (!selected) return <section className="recoveries-empty"><h2>No recoveries yet</h2><p>Create a request and Backfill will track it here from sourcing through approval.</p><button className="primary" onClick={onCreate}><Plus size={16}/> Create recovery</button></section>

  const state = statusCopy[selected.status]
  return <section className="recoveries-page">
    <div className="recovery-summary" aria-label="Recovery summary">
      <div><span>Open recoveries</span><strong>{String(open).padStart(2, '0')}</strong><small>Across active sourcing jobs</small></div>
      <div className={awaiting ? 'attention' : ''}><span>Needs your approval</span><strong>{String(awaiting).padStart(2, '0')}</strong><small>{awaiting ? 'A quote decision is waiting' : 'Nothing waiting on you'}</small></div>
      <div><span>Active supplier calls</span><strong>{recoveries.filter(recovery => recovery.status === 'Calling suppliers').length}</strong><small>Demo outreach in progress</small></div>
      <div><span>Open budget protected</span><strong>{money(protectedBudget)}</strong><small>Maximum authorised spend</small></div>
    </div>

    <div className="recovery-pipeline" aria-label="Recovery pipeline">
      {stages.map((stage, index) => <button key={stage} className={filter === stage ? 'active' : ''} onClick={() => setFilter(filter === stage ? 'All' : stage)}>
        <span className="pipeline-index">{index + 1}</span><span><strong>{stage}</strong><small>{recoveries.filter(recovery => recovery.status === stage).length} recoveries</small></span>
      </button>)}
    </div>

    <div className="recovery-toolbar">
      <div><h2>Recovery queue</h2><p>Track sourcing progress and resolve the jobs that need you.</p></div>
      <div className="recovery-toolbar-actions">
        <label className="search"><Search size={16}/><input aria-label="Search recovery queue" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search recoveries…"/></label>
        <button className="primary" onClick={onCreate}><Plus size={16}/> New recovery</button>
      </div>
    </div>

    <div className="recovery-command-center">
      <div className="recovery-queue">
        <div className="queue-header"><span>{filter === 'All' ? 'All recoveries' : filter}</span><button onClick={() => setFilter('All')}>{filtered.length} shown{filter !== 'All' && ' · Clear filter'}</button></div>
        {filtered.map(recovery => {
          const meta = statusCopy[recovery.status]
          return <button className={`recovery-queue-row ${selected.id === recovery.id ? 'selected' : ''}`} key={recovery.id} onClick={() => selectRecovery(recovery.id)}>
            <span className={`recovery-state state-${meta.step}`}><span/></span>
            <span className="queue-main"><span className="queue-id">{recovery.id} · {recovery.category}</span><strong>{recovery.item}</strong><small>{recovery.quantity} {recovery.unit} · {money(recovery.budget)} maximum</small></span>
            <span className="queue-progress"><span><i style={{ width: `${meta.step * 25}%` }}/></span><small>{meta.activity}</small></span>
            <span className="queue-deadline"><Clock3 size={14}/><span><small>Required by</small><strong>{deadlineLabel(recovery.deadline)}</strong></span></span>
            <ChevronRight size={17}/>
          </button>
        })}
        {filtered.length === 0 && <div className="queue-empty"><Search size={20}/><strong>No matching recoveries</strong><p>Try a different status or search term.</p></div>}
      </div>

      <aside className="recovery-inspector">
        <div className="inspector-heading"><div><span className="eyebrow">{selected.id} · {selected.category}</span><h2>{selected.item}</h2><p>{selected.quantity} {selected.unit} required by {deadlineLabel(selected.deadline)}</p></div><span className={`badge ${selected.status === 'Approved' ? 'green' : selected.status === 'Needs approval' ? 'amber' : 'neutral-badge'}`}><span className="status-dot"/>{selected.status}</span></div>

        <div className="recovery-stage-track">
          {stages.map((stage, index) => <div className={index + 1 < state.step ? 'done' : index + 1 === state.step ? 'current' : ''} key={stage}><span>{index + 1 < state.step ? <Check size={12}/> : index + 1}</span><small>{stage === 'Ready to source' ? 'Brief' : stage === 'Calling suppliers' ? 'Source' : stage === 'Needs approval' ? 'Decide' : 'Complete'}</small></div>)}
        </div>

        <section className="next-action-card">
          <span className="eyebrow">CURRENT STEP</span><h3>{state.action}</h3><p>{selected.status === 'Needs approval' ? 'Backfill found one quote that satisfies the request. Review the recommendation before any supplier is confirmed.' : selected.status === 'Calling suppliers' ? 'The agent is working through the authorised supplier list and recording comparable terms.' : selected.status === 'Approved' ? 'The preferred supplier has been selected. No live order has been sent in this demo.' : 'The brief is complete and waiting to enter the supplier queue.'}</p>
        </section>

        <div className="recovery-facts">
          <div><span>Maximum budget</span><strong>{money(selected.budget)}</strong></div>
          <div><span>Payment target</span><strong>{selected.minimumPaymentDays ?? 0}+ days</strong></div>
          <div><span>Deposit limit</span><strong>{selected.maximumDepositPercent ?? 0}%</strong></div>
          <div><span>Approval mode</span><strong>{selected.purchaseMode === 'preauthorised' ? 'Pre-authorised' : 'Owner confirms'}</strong></div>
        </div>

        <div className="delivery-fact"><MapPin size={16}/><span><small>Deliver to</small><strong>{selected.location}</strong></span></div>

        {selected.id === 'REC-024' && <section className="recovery-recommendation">
          <div className="recommendation-top"><span><CheckCircle2 size={15}/> Best qualifying quote</span><small>Demo recommendation</small></div>
          <div className="recommendation-supplier"><span className="supplier-logo">VF</span><div><strong>Victorian Foods</strong><small>Exact product · full quantity · on time</small></div><b>$315<small>delivered</small></b></div>
          <div className="recommendation-saving"><ShieldCheck size={15}/><span><strong>$35 under budget</strong><small>Net 14 · no deposit · no added fees</small></span></div>
          <button className="primary full" onClick={() => setShowQuotes(value => !value)}>{showQuotes ? 'Hide quote comparison' : 'Review all 3 quotes'} <ArrowRight size={15}/></button>
        </section>}

        {showQuotes && selected.id === 'REC-024' && <div className="compact-quotes">
          {offers.map(offer => {
            const checks = validateOffer(offer, selected)
            const failures = Object.entries(checks).filter(([, passes]) => !passes).map(([label]) => label)
            return <button key={offer.id} onClick={() => onTranscript(offer)}><span className={failures.length ? 'quote-excluded' : 'quote-best'}>{failures.length ? '—' : 'Best'}</span><span><strong>{offer.name}</strong><small>{failures.length ? failures.join(' · ') : `${offer.quantity}kg · ${offer.delivery}`}</small></span><b>{money(offer.price + offer.fees)}</b></button>
          })}
        </div>}

        {selected.status === 'Calling suppliers' && <div className="live-activity-card"><div><Phone size={16}/><span><strong>Supplier outreach</strong><small>2 completed · 1 unanswered · 1 queued</small></span></div><span className="activity-pulse"/> </div>}
      </aside>
    </div>
  </section>
}
