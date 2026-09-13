import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Filter, MapPin, Phone, Plus, Search, ShieldCheck, X } from 'lucide-react'
import { money, validateOffer, type Offer, type Recovery } from '../features/recoveries/data'
import { AddSupplierQuote } from './AddSupplierQuote'

type RecoveryFilter = 'All' | Recovery['status']
type DueFilter = 'Any' | 'Overdue' | '24 hours' | '7 days'
type SortOption = 'Deadline soonest' | 'Deadline latest' | 'Budget highest' | 'Recovery newest'

type RecoveriesPageProps = {
  recoveries: Recovery[]
  offers: Offer[]
  selectedId: string
  live: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onAddOffer: (offer: Offer) => void | Promise<void>
  onTranscript: (offer: Offer) => void
}

const stages: Recovery['status'][] = ['Ready to source', 'Calling suppliers', 'Needs approval', 'Approved']

const statusCopy: Record<Recovery['status'], { step: number; action: string; activity: string }> = {
  'Ready to source': { step: 1, action: 'Ready for sourcing', activity: 'Supplier outreach has not started' },
  'Calling suppliers': { step: 2, action: 'Agent is collecting quotes', activity: 'Supplier outreach is in progress' },
  'Needs approval': { step: 3, action: 'Your decision is required', activity: 'Comparable quotes are ready' },
  Approved: { step: 4, action: 'Supplier approved', activity: 'Selection saved and ready to confirm' },
}

function deadlineLabel(value: string) {
  return new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function matchesDueFilter(recovery: Recovery, filter: DueFilter, now: number) {
  if (filter === 'Any') return true
  const deadline = new Date(recovery.deadline).getTime()
  if (!Number.isFinite(deadline)) return false
  if (filter === 'Overdue') return deadline < now && recovery.status !== 'Approved'
  const horizon = filter === '24 hours' ? 86_400_000 : 604_800_000
  return deadline >= now && deadline <= now + horizon
}

export function RecoveriesPage({ recoveries, offers, selectedId, live, onSelect, onCreate, onAddOffer, onTranscript }: RecoveriesPageProps) {
  const [statusFilter, setStatusFilter] = useState<RecoveryFilter>('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [dueFilter, setDueFilter] = useState<DueFilter>('Any')
  const [sort, setSort] = useState<SortOption>('Recovery newest')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [showQuotes, setShowQuotes] = useState(false)
  const categories = useMemo(() => [...new Set(recoveries.map(recovery => recovery.category))].sort(), [recoveries])
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const now = Date.now()
    return recoveries.filter(recovery => {
      const matchesStatus = statusFilter === 'All' || recovery.status === statusFilter
      const matchesCategory = categoryFilter === 'All' || recovery.category === categoryFilter
      const matchesQuery = !normalizedQuery || `${recovery.id} ${recovery.item} ${recovery.category} ${recovery.location}`.toLowerCase().includes(normalizedQuery)
      return matchesStatus && matchesCategory && matchesQuery && matchesDueFilter(recovery, dueFilter, now)
    }).sort((a, b) => sort === 'Deadline soonest' ? Date.parse(a.deadline) - Date.parse(b.deadline) : sort === 'Deadline latest' ? Date.parse(b.deadline) - Date.parse(a.deadline) : sort === 'Budget highest' ? b.budget - a.budget : b.id.localeCompare(a.id, undefined, { numeric: true }))
  }, [recoveries, statusFilter, categoryFilter, dueFilter, query, sort])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selected = recoveries.find(recovery => recovery.id === selectedId) ?? visible[0] ?? recoveries[0]
  const selectedOffers = offers.filter(offer => offer.requestId ? offer.requestId === selected?.id : selected?.id === 'REC-024')
  const recommended = selectedOffers.find(offer => !offer.manuallyAdded)
  const manualOffers = selectedOffers.filter(offer => offer.manuallyAdded)
  const open = recoveries.filter(recovery => recovery.status !== 'Approved').length
  const awaiting = recoveries.filter(recovery => recovery.status === 'Needs approval').length
  const protectedBudget = recoveries.filter(recovery => recovery.status !== 'Approved').reduce((total, recovery) => total + recovery.budget, 0)
  const hasFilters = statusFilter !== 'All' || categoryFilter !== 'All' || dueFilter !== 'Any' || query.trim() !== ''

  useEffect(() => setPage(1), [statusFilter, categoryFilter, dueFilter, query, sort, pageSize])

  function clearFilters() {
    setStatusFilter('All')
    setCategoryFilter('All')
    setDueFilter('Any')
    setQuery('')
  }

  function selectRecovery(id: string) {
    onSelect(id)
    setShowQuotes(false)
    setDetailsOpen(true)
  }

  async function addOffer(offer: Offer) {
    await onAddOffer(offer)
    onSelect(offer.requestId ?? selectedId)
    setShowQuotes(true)
    setQuoteOpen(false)
    setDetailsOpen(true)
  }

  return <section className="recoveries-page">
    <div className="recovery-summary" aria-label="Recovery summary">
      <div><span>Open recoveries</span><strong>{String(open).padStart(2, '0')}</strong><small>Across active sourcing jobs</small></div>
      <div className={awaiting ? 'attention' : ''}><span>Needs your approval</span><strong>{String(awaiting).padStart(2, '0')}</strong><small>{awaiting ? 'A quote decision is waiting' : 'Nothing waiting on you'}</small></div>
      <div><span>Active supplier calls</span><strong>{recoveries.filter(recovery => recovery.status === 'Calling suppliers').length}</strong><small>{live ? 'Live sourcing jobs in progress' : 'Demo outreach in progress'}</small></div>
      <div><span>Open budget protected</span><strong>{money(protectedBudget)}</strong><small>Maximum authorised spend</small></div>
    </div>

    <div className="recovery-toolbar">
      <div><h2>Recovery queue</h2><p>Track sourcing progress. Open a row only when you need its full detail.</p></div>
      <button className="primary" disabled={recoveries.length === 0} onClick={() => setQuoteOpen(true)}><Plus size={16}/> Add supplier quote</button>
    </div>

    <div className="recovery-table-card">
      <div className="recovery-filters" aria-label="Recovery filters">
        <label className="search"><Search size={16}/><input aria-label="Search recovery queue" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search ID, item, category or location…"/></label>
        <label className="table-filter"><span>Status</span><select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as RecoveryFilter)}><option value="All">All statuses</option>{stages.map(stage => <option key={stage}>{stage}</option>)}</select></label>
        <label className="table-filter"><span>Category</span><select aria-label="Filter by category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option>All</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label className="table-filter"><span>Due</span><select aria-label="Filter by due date" value={dueFilter} onChange={event => setDueFilter(event.target.value as DueFilter)}><option>Any</option><option>Overdue</option><option>24 hours</option><option>7 days</option></select></label>
        <label className="table-filter"><span>Sort</span><select aria-label="Sort recoveries" value={sort} onChange={event => setSort(event.target.value as SortOption)}><option>Deadline soonest</option><option>Deadline latest</option><option>Budget highest</option><option>Recovery newest</option></select></label>
        {hasFilters && <button className="clear-filters" onClick={clearFilters}><X size={14}/> Clear</button>}
      </div>

      <div className="recovery-result-bar"><span><Filter size={14}/>{filtered.length} {filtered.length === 1 ? 'recovery' : 'recoveries'}</span>{hasFilters && <small>Filtered from {recoveries.length} total</small>}</div>
      <div className="recovery-table-wrap">
        <table className="recovery-table">
          <thead><tr><th>Recovery</th><th>Status</th><th>Progress</th><th>Quotes</th><th>Budget</th><th>Required by</th><th aria-label="Open details"/></tr></thead>
          <tbody>{visible.map(recovery => {
            const meta = statusCopy[recovery.status]
            const quoteCount = offers.filter(offer => offer.requestId ? offer.requestId === recovery.id : recovery.id === 'REC-024').length
            return <tr className={selected?.id === recovery.id && detailsOpen ? 'selected' : ''} key={recovery.id} tabIndex={0} role="button" aria-label={`Open ${recovery.id}, ${recovery.item}`} onClick={() => selectRecovery(recovery.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRecovery(recovery.id) } }}>
              <td><div className="table-recovery"><span className={`recovery-state state-${meta.step}`}><span/></span><span><small>{recovery.id} · {recovery.category}</small><strong>{recovery.item}</strong><em>{recovery.quantity} {recovery.unit} · {recovery.location}</em></span></div></td>
              <td><span className={`badge ${recovery.status === 'Approved' ? 'green' : recovery.status === 'Needs approval' ? 'amber' : 'neutral-badge'}`}><span className="status-dot"/>{recovery.status}</span></td>
              <td><div className="table-progress"><span><i style={{ width: `${meta.step * 25}%` }}/></span><small>{meta.activity}</small></div></td>
              <td><strong className="quote-count">{quoteCount}</strong></td>
              <td><strong className="table-number">{money(recovery.budget)}</strong></td>
              <td><div className="table-deadline"><Clock3 size={14}/><strong>{deadlineLabel(recovery.deadline)}</strong></div></td>
              <td><ChevronRight size={17}/></td>
            </tr>
          })}</tbody>
        </table>
        {visible.length === 0 && <div className="queue-empty"><Search size={20}/><strong>No matching recoveries</strong><p>Change a filter or clear the search to see the queue.</p><button className="secondary" onClick={clearFilters}>Clear all filters</button></div>}
      </div>

      <div className="recovery-pagination">
        <label>Rows per page<select aria-label="Rows per page" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}><option value="2">2</option><option value="5">5</option><option value="10">10</option></select></label>
        <span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length}` : '0 results'}</span>
        <div><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={17}/></button><strong>Page {currentPage} of {totalPages}</strong><button aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}><ChevronRight size={17}/></button></div>
      </div>
    </div>

    {recoveries.length === 0 && <div className="recoveries-empty"><h2>Create a procurement request first</h2><p>A supplier quote must be attached to an owner-approved recovery brief.</p><button className="primary" onClick={onCreate}><Plus size={16}/> Create procurement request</button></div>}
    {quoteOpen && <AddSupplierQuote recoveries={recoveries} initialRecoveryId={selected?.id ?? recoveries[0]?.id ?? ''} onAdd={addOffer} onClose={() => setQuoteOpen(false)}/>}
    {detailsOpen && selected && <RecoveryDrawer recovery={selected} offers={selectedOffers} recommended={recommended} manualOffers={manualOffers} live={live} showQuotes={showQuotes} onShowQuotes={() => setShowQuotes(value => !value)} onTranscript={onTranscript} onClose={() => setDetailsOpen(false)}/>}
  </section>
}

type RecoveryDrawerProps = { recovery: Recovery; offers: Offer[]; recommended?: Offer; manualOffers: Offer[]; live: boolean; showQuotes: boolean; onShowQuotes: () => void; onTranscript: (offer: Offer) => void; onClose: () => void }

function RecoveryDrawer({ recovery, offers, recommended, manualOffers, live, showQuotes, onShowQuotes, onTranscript, onClose }: RecoveryDrawerProps) {
  const state = statusCopy[recovery.status]
  return <dialog className="recovery-drawer" aria-labelledby="recovery-drawer-title" ref={node => { if (node && !node.open) node.showModal() }} onCancel={onClose}>
    <div className="drawer-head"><div><span className="eyebrow">{recovery.id} · {recovery.category}</span><h2 id="recovery-drawer-title">{recovery.item}</h2><p>{recovery.quantity} {recovery.unit} required by {deadlineLabel(recovery.deadline)}</p></div><button className="icon-button" autoFocus aria-label="Close recovery details" onClick={onClose}><X size={20}/></button></div>
    <div className="drawer-scroll">
      <div className="drawer-status"><span className={`badge ${recovery.status === 'Approved' ? 'green' : recovery.status === 'Needs approval' ? 'amber' : 'neutral-badge'}`}><span className="status-dot"/>{recovery.status}</span><small>Owner-controlled procurement</small></div>
      <div className="recovery-stage-track">{stages.map((stage, index) => <div className={index + 1 < state.step ? 'done' : index + 1 === state.step ? 'current' : ''} key={stage}><span>{index + 1 < state.step ? <Check size={12}/> : index + 1}</span><small>{stage === 'Ready to source' ? 'Brief' : stage === 'Calling suppliers' ? 'Source' : stage === 'Needs approval' ? 'Decide' : 'Complete'}</small></div>)}</div>
      <section className="next-action-card"><span className="eyebrow">CURRENT STEP</span><h3>{state.action}</h3><p>{recovery.status === 'Needs approval' ? 'Backfill found a quote that may satisfy the request. Review its evidence before explicitly approving any purchase order.' : recovery.status === 'Calling suppliers' ? 'The agent is working through the authorised supplier list and recording comparable terms.' : recovery.status === 'Approved' ? (live ? 'The approved purchase state is retained in your workspace with its audit trail.' : 'The preferred supplier has been selected. No live order has been sent in this demo.') : 'The brief is complete and waiting to enter the supplier queue.'}</p></section>
      <div className="recovery-facts"><div><span>Maximum budget</span><strong>{money(recovery.budget)}</strong></div><div><span>Payment target</span><strong>{recovery.minimumPaymentDays ?? 0}+ days</strong></div><div><span>Deposit limit</span><strong>{recovery.maximumDepositPercent ?? 0}%</strong></div><div><span>Approval mode</span><strong>{recovery.purchaseMode === 'preauthorised' ? 'Pre-authorised' : 'Owner confirms'}</strong></div></div>
      <div className="delivery-fact"><MapPin size={16}/><span><small>Deliver to</small><strong>{recovery.location}</strong></span></div>
      {manualOffers.map(offer => <section className="manual-quote-card" key={offer.id}><div><ShieldCheck size={16}/><span><strong>Supplier lead awaiting verification</strong><small>Manually captured · no outreach authorised</small></span></div><h3>{offer.name}</h3><p>{offer.quantity} {recovery.unit} · {money(offer.price + offer.fees)} total · {offer.delivery}</p><dl><div><dt>ABN</dt><dd>{offer.supplierContact?.abn}</dd></div><div><dt>Source</dt><dd>{offer.supplierContact?.source}</dd></div><div><dt>Payment</dt><dd>Net {offer.paymentDays}</dd></div><div><dt>Deposit</dt><dd>{offer.depositPercent}%</dd></div></dl>{offer.supplierContact?.note && <p>Evidence note: {offer.supplierContact.note}</p>}</section>)}
      {recommended && <section className="recovery-recommendation"><div className="recommendation-top"><span><CheckCircle2 size={15}/> Best available quote</span><small>{recommended.live ? 'Live transcript evidence' : 'Demo recommendation'}</small></div><div className="recommendation-supplier"><span className="supplier-logo">{recommended.initials}</span><div><strong>{recommended.name}</strong><small>{recommended.exact ? 'Exact product' : 'Substitution'} · {recommended.quantity} {recovery.unit} · {recommended.onTime ? 'on time' : 'timing review'}</small></div><b>{money(recommended.price + recommended.fees)}<small>delivered total</small></b></div><div className="recommendation-saving"><ShieldCheck size={15}/><span><strong>{recommended.price + recommended.fees <= recovery.budget ? `${money(recovery.budget - recommended.price - recommended.fees)} under budget` : 'Over budget'}</strong><small>{recommended.paymentDays ? `Net ${recommended.paymentDays}` : 'Due on delivery'} · {recommended.depositPercent}% deposit · {money(recommended.fees)} fees</small></span></div><button className="primary full" onClick={onShowQuotes}>{showQuotes ? 'Hide quote comparison' : `Review all ${offers.length} quotes`} <ArrowRight size={15}/></button></section>}
      {showQuotes && offers.length > 0 && <div className="compact-quotes">{offers.map(offer => {
        const checks = validateOffer(offer, recovery)
        const failures = Object.entries(checks).filter(([, passes]) => !passes).map(([label]) => label)
        return <button key={offer.id} disabled={offer.manuallyAdded} onClick={() => onTranscript(offer)}><span className={offer.manuallyAdded ? 'quote-pending' : failures.length ? 'quote-excluded' : 'quote-best'}>{offer.manuallyAdded ? 'Verify' : failures.length ? '—' : 'Best'}</span><span><strong>{offer.name}</strong><small>{offer.manuallyAdded ? 'Manual quote · transcript unavailable' : failures.length ? failures.join(' · ') : `${offer.quantity}${recovery.unit} · ${offer.delivery}`}</small></span><b>{money(offer.price + offer.fees)}</b></button>
      })}</div>}
      {recovery.status === 'Calling suppliers' && <div className="live-activity-card"><div><Phone size={16}/><span><strong>Supplier outreach</strong><small>{live ? `${offers.length} completed quote${offers.length === 1 ? '' : 's'} · open the supplier queue for current attempts` : '2 completed · 1 unanswered · 1 queued'}</small></span></div><span className="activity-pulse"/></div>}
    </div>
  </dialog>
}
