import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Filter, MapPin, Phone, Plus, Search, ShieldCheck, X } from '../icons'
import { money, validateOffer, type Offer, type ProcurementRequest } from '../features/requests/data'
import { sourcingModeLabel } from '../features/requests/workflow'
import { AddRequest } from './AddRequest'

type ProcurementRequestFilter = 'All' | ProcurementRequest['status']
type DueFilter = 'Any' | 'Overdue' | '24 hours' | '7 days'
type SortOption = 'Deadline soonest' | 'Deadline latest' | 'Budget highest' | 'Request newest'

type RequestsPageProps = {
  requests: ProcurementRequest[]
  offers: Offer[]
  selectedId: string
  live: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onAddRequest: (request: ProcurementRequest) => ProcurementRequest | Promise<ProcurementRequest>
  onTranscript: (offer: Offer) => void
}

const stages: ProcurementRequest['status'][] = ['Ready to source', 'Calling suppliers', 'Needs approval', 'Approved']

const statusCopy: Record<ProcurementRequest['status'], { step: number; action: string; activity: string }> = {
  'Ready to source': { step: 1, action: 'Ready for sourcing', activity: 'Supplier outreach has not started' },
  'Calling suppliers': { step: 2, action: 'Agent is collecting quotes', activity: 'Supplier outreach is in progress' },
  'Needs approval': { step: 3, action: 'Your decision is required', activity: 'Comparable quotes are ready' },
  Approved: { step: 4, action: 'Supplier approved', activity: 'Selection saved and ready to confirm' },
}

function deadlineLabel(value: string) {
  return new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function matchesDueFilter(request: ProcurementRequest, filter: DueFilter, now: number) {
  if (filter === 'Any') return true
  const deadline = new Date(request.deadline).getTime()
  if (!Number.isFinite(deadline)) return false
  if (filter === 'Overdue') return deadline < now && request.status !== 'Approved'
  const horizon = filter === '24 hours' ? 86_400_000 : 604_800_000
  return deadline >= now && deadline <= now + horizon
}

export function RequestsPage({ requests, offers, selectedId, live, onSelect, onCreate, onAddRequest, onTranscript }: RequestsPageProps) {
  const [statusFilter, setStatusFilter] = useState<ProcurementRequestFilter>('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [dueFilter, setDueFilter] = useState<DueFilter>('Any')
  const [sort, setSort] = useState<SortOption>('Request newest')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [showQuotes, setShowQuotes] = useState(false)
  const categories = useMemo(() => [...new Set(requests.map(request => request.category))].sort(), [requests])
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const now = Date.now()
    return requests.filter(request => {
      const matchesStatus = statusFilter === 'All' || request.status === statusFilter
      const matchesCategory = categoryFilter === 'All' || request.category === categoryFilter
      const matchesQuery = !normalizedQuery || `${request.id} ${request.item} ${request.category} ${request.location}`.toLowerCase().includes(normalizedQuery)
      return matchesStatus && matchesCategory && matchesQuery && matchesDueFilter(request, dueFilter, now)
    }).sort((a, b) => sort === 'Deadline soonest' ? Date.parse(a.deadline) - Date.parse(b.deadline) : sort === 'Deadline latest' ? Date.parse(b.deadline) - Date.parse(a.deadline) : sort === 'Budget highest' ? b.budget - a.budget : b.id.localeCompare(a.id, undefined, { numeric: true }))
  }, [requests, statusFilter, categoryFilter, dueFilter, query, sort])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selected = requests.find(request => request.id === selectedId) ?? visible[0] ?? requests[0]
  const selectedOffers = offers.filter(offer => offer.requestId ? offer.requestId === selected?.id : selected?.id === 'REQ-024')
  const recommended = selectedOffers.find(offer => !offer.manuallyAdded)
  const manualOffers = selectedOffers.filter(offer => offer.manuallyAdded)
  const open = requests.filter(request => request.status !== 'Approved').length
  const awaiting = requests.filter(request => request.status === 'Needs approval').length
  const protectedBudget = requests.filter(request => request.status !== 'Approved').reduce((total, request) => total + request.budget, 0)
  const hasFilters = statusFilter !== 'All' || categoryFilter !== 'All' || dueFilter !== 'Any' || query.trim() !== ''

  useEffect(() => setPage(1), [statusFilter, categoryFilter, dueFilter, query, sort, pageSize])

  function clearFilters() {
    setStatusFilter('All')
    setCategoryFilter('All')
    setDueFilter('Any')
    setQuery('')
  }

  function selectRequest(id: string) {
    onSelect(id)
    setShowQuotes(false)
    setDetailsOpen(true)
  }

  async function addRequest(request: ProcurementRequest) {
    const created = await onAddRequest(request)
    clearFilters()
    setSort('Request newest')
    setPage(1)
    onSelect(created.id)
    setRequestOpen(false)
    setDetailsOpen(false)
    return created
  }

  return <section className="requests-page">
    <div className="request-summary" aria-label="Request summary">
      <div><span>Open requests</span><strong>{String(open).padStart(2, '0')}</strong><small>Across active sourcing jobs</small></div>
      <div className={awaiting ? 'attention' : ''}><span>Needs your approval</span><strong>{String(awaiting).padStart(2, '0')}</strong><small>{awaiting ? 'A quote decision is waiting' : 'Nothing waiting on you'}</small></div>
      <div><span>Active supplier calls</span><strong>{requests.filter(request => request.status === 'Calling suppliers').length}</strong><small>{live ? 'Live sourcing jobs in progress' : 'Demo outreach in progress'}</small></div>
      <div><span>Open budget protected</span><strong>{money(protectedBudget)}</strong><small>Maximum authorised spend</small></div>
    </div>

    <div className="request-toolbar">
      <div><h2>Requests</h2><p>Track sourcing progress. Open a row only when you need its full detail.</p></div>
      <button className="primary" onClick={() => setRequestOpen(true)}><Plus size={16}/> Add Request</button>
    </div>

    <div className="request-table-card">
      <div className="request-filters" aria-label="Request filters">
        <label className="search"><Search size={16}/><input aria-label="Search requests" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search ID, item, category or location…"/></label>
        <label className="table-filter"><span>Status</span><select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as ProcurementRequestFilter)}><option value="All">All statuses</option>{stages.map(stage => <option key={stage}>{stage}</option>)}</select></label>
        <label className="table-filter"><span>Category</span><select aria-label="Filter by category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option>All</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label className="table-filter"><span>Due</span><select aria-label="Filter by due date" value={dueFilter} onChange={event => setDueFilter(event.target.value as DueFilter)}><option>Any</option><option>Overdue</option><option>24 hours</option><option>7 days</option></select></label>
        <label className="table-filter"><span>Sort</span><select aria-label="Sort requests" value={sort} onChange={event => setSort(event.target.value as SortOption)}><option>Deadline soonest</option><option>Deadline latest</option><option>Budget highest</option><option>Request newest</option></select></label>
        <button className="clear-filters" disabled={!hasFilters} aria-hidden={!hasFilters} onClick={clearFilters}><X size={14}/> Clear</button>
      </div>

      <div className="request-result-bar"><span><Filter size={14}/>{filtered.length} {filtered.length === 1 ? 'request' : 'requests'}</span><small className={hasFilters ? '' : 'result-placeholder'}>{hasFilters ? `Filtered from ${requests.length} total` : 'All request records'}</small></div>
      <div className="request-table-wrap">
        <table className="request-table">
          <thead><tr><th>Request</th><th>Status</th><th>Progress</th><th>Quotes</th><th>Budget</th><th>Required by</th><th aria-label="Open details"/></tr></thead>
          <tbody>{visible.map(request => {
            const meta = statusCopy[request.status]
            const quoteCount = offers.filter(offer => offer.requestId ? offer.requestId === request.id : request.id === 'REQ-024').length
            return <tr className={selected?.id === request.id && detailsOpen ? 'selected' : ''} key={request.id} tabIndex={0} role="button" aria-label={`Open ${request.id}, ${request.item}`} onClick={() => selectRequest(request.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRequest(request.id) } }}>
              <td><div className="table-request"><span className={`request-state state-${meta.step}`}><span/></span><span><small>{request.id} · {request.category}</small><strong>{request.item}</strong><em>{request.quantity} {request.unit} · {request.location}</em></span></div></td>
              <td><span className={`badge ${request.status === 'Approved' ? 'green' : request.status === 'Needs approval' ? 'amber' : 'neutral-badge'}`}><span className="status-dot"/>{request.status}</span></td>
              <td><div className="table-progress"><span><i style={{ width: `${meta.step * 25}%` }}/></span><small>{meta.activity}</small></div></td>
              <td data-label="Quotes"><strong className="quote-count">{quoteCount}</strong></td>
              <td data-label="Budget"><strong className="table-number">{money(request.budget)}</strong></td>
              <td data-label="Required by"><div className="table-deadline"><Clock3 size={14}/><strong>{deadlineLabel(request.deadline)}</strong></div></td>
              <td><ChevronRight size={17}/></td>
            </tr>
          })}</tbody>
        </table>
        {visible.length === 0 && <div className="queue-empty"><Search size={20}/><strong>No matching requests</strong><p>Change a filter or clear the search to see the queue.</p><button className="secondary" onClick={clearFilters}>Clear all filters</button></div>}
      </div>

      <div className="request-pagination">
        <label>Rows per page<select aria-label="Rows per page" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}><option value="2">2</option><option value="5">5</option><option value="10">10</option></select></label>
        <span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length}` : '0 results'}</span>
        <div><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={17}/></button><strong>Page {currentPage} of {totalPages}</strong><button aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}><ChevronRight size={17}/></button></div>
      </div>
    </div>

    {requests.length === 0 && <div className="requests-empty"><h2>Create a procurement request first</h2><p>A supplier quote must be attached to an owner-approved request brief.</p><button className="primary" onClick={onCreate}><Plus size={16}/> Create procurement request</button></div>}
    {requestOpen && <AddRequest requests={requests} onAdd={addRequest} onClose={() => setRequestOpen(false)}/>}
    {detailsOpen && selected && <RequestDrawer request={selected} offers={selectedOffers} recommended={recommended} manualOffers={manualOffers} live={live} showQuotes={showQuotes} onShowQuotes={() => setShowQuotes(value => !value)} onTranscript={onTranscript} onClose={() => setDetailsOpen(false)}/>}
  </section>
}

type RequestDrawerProps = { request: ProcurementRequest; offers: Offer[]; recommended?: Offer; manualOffers: Offer[]; live: boolean; showQuotes: boolean; onShowQuotes: () => void; onTranscript: (offer: Offer) => void; onClose: () => void }

function RequestDrawer({ request, offers, recommended, manualOffers, live, showQuotes, onShowQuotes, onTranscript, onClose }: RequestDrawerProps) {
  const state = statusCopy[request.status]
  return <dialog className="request-drawer" aria-labelledby="request-drawer-title" ref={node => { if (node && !node.open) node.showModal() }} onCancel={onClose}>
    <div className="drawer-head"><div><span className="eyebrow">{request.id} · {request.category}</span><h2 id="request-drawer-title">{request.item}</h2><p>{request.quantity} {request.unit} required by {deadlineLabel(request.deadline)}</p></div><button className="icon-button" autoFocus aria-label="Close request details" onClick={onClose}><X size={20}/></button></div>
    <div className="drawer-scroll">
      <div className="drawer-status"><span className={`badge ${request.status === 'Approved' ? 'green' : request.status === 'Needs approval' ? 'amber' : 'neutral-badge'}`}><span className="status-dot"/>{request.status}</span><small>Owner-controlled procurement</small></div>
      <div className="request-stage-track">{stages.map((stage, index) => <div className={index + 1 < state.step ? 'done' : index + 1 === state.step ? 'current' : ''} key={stage}><span>{index + 1 < state.step ? <Check size={12}/> : index + 1}</span><small>{stage === 'Ready to source' ? 'Brief' : stage === 'Calling suppliers' ? 'Source' : stage === 'Needs approval' ? 'Decide' : 'Complete'}</small></div>)}</div>
      <section className="next-action-card"><span className="eyebrow">CURRENT STEP</span><h3>{state.action}</h3><p>{request.status === 'Needs approval' ? 'Backfill found a quote that may satisfy the request. Review its evidence before explicitly approving any purchase order.' : request.status === 'Calling suppliers' ? 'The agent is working through the authorised supplier list and recording comparable terms.' : request.status === 'Approved' ? (live ? 'The approved purchase state is retained in your workspace with its audit trail.' : 'The preferred supplier has been selected. No live order has been sent in this demo.') : 'The brief is complete and waiting to enter the supplier queue.'}</p></section>
      <div className="request-facts"><div><span>Maximum budget</span><strong>{money(request.budget)}</strong></div><div><span>Payment target</span><strong>{request.minimumPaymentDays ?? 0}+ days</strong></div><div><span>Deposit limit</span><strong>{request.maximumDepositPercent ?? 0}%</strong></div><div><span>Sourcing strategy</span><strong>{sourcingModeLabel(request.sourcingMode)}</strong></div><div><span>Approval mode</span><strong>{request.purchaseMode === 'preauthorized' ? 'Pre-authorised' : 'Owner confirms'}</strong></div>{request.createdBy && <div><span>Started by</span><strong>{request.createdBy}</strong></div>}</div>
      <div className="delivery-fact"><MapPin size={16}/><span><small>Deliver to</small><strong>{request.location}</strong></span></div>
      {manualOffers.map(offer => <section className="manual-quote-card" key={offer.id}><div><ShieldCheck size={16}/><span><strong>Supplier lead awaiting verification</strong><small>Manually captured · no outreach authorised</small></span></div><h3>{offer.name}</h3><p>{offer.quantity} {request.unit} · {money(offer.price + offer.fees)} total · {offer.delivery}</p><dl><div><dt>ABN</dt><dd>{offer.supplierContact?.abn}</dd></div><div><dt>Source</dt><dd>{offer.supplierContact?.source}</dd></div><div><dt>Payment</dt><dd>Net {offer.paymentDays}</dd></div><div><dt>Deposit</dt><dd>{offer.depositPercent}%</dd></div></dl>{offer.supplierContact?.note && <p>Evidence note: {offer.supplierContact.note}</p>}</section>)}
      {recommended && <section className="request-recommendation"><div className="recommendation-top"><span><CheckCircle2 size={15}/> Best available quote</span><small>{recommended.live ? 'Live transcript evidence' : 'Demo recommendation'}</small></div><div className="recommendation-supplier"><span className="supplier-logo">{recommended.initials}</span><div><strong>{recommended.name}</strong><small>{recommended.exact ? 'Exact product' : 'Substitution'} · {recommended.quantity} {request.unit} · {recommended.onTime ? 'on time' : 'timing review'}</small></div><b>{money(recommended.price + recommended.fees)}<small>delivered total</small></b></div><div className="recommendation-saving"><ShieldCheck size={15}/><span><strong>{recommended.price + recommended.fees <= request.budget ? `${money(request.budget - recommended.price - recommended.fees)} under budget` : 'Over budget'}</strong><small>{recommended.paymentDays ? `Net ${recommended.paymentDays}` : 'Due on delivery'} · {recommended.depositPercent}% deposit · {money(recommended.fees)} fees</small></span></div><button className="primary full" onClick={onShowQuotes}>{showQuotes ? 'Hide quote comparison' : `Review all ${offers.length} quotes`} <ArrowRight size={15}/></button></section>}
      {showQuotes && offers.length > 0 && <div className="compact-quotes">{offers.map(offer => {
        const checks = validateOffer(offer, request)
        const failures = Object.entries(checks).filter(([, passes]) => !passes).map(([label]) => label)
        return <button key={offer.id} disabled={offer.manuallyAdded} onClick={() => onTranscript(offer)}><span className={offer.manuallyAdded ? 'quote-pending' : failures.length ? 'quote-excluded' : 'quote-best'}>{offer.manuallyAdded ? 'Verify' : failures.length ? '—' : 'Best'}</span><span><strong>{offer.name}</strong><small>{offer.manuallyAdded ? 'Manual quote · transcript unavailable' : failures.length ? failures.join(' · ') : `${offer.quantity}${request.unit} · ${offer.delivery}`}</small></span><b>{money(offer.price + offer.fees)}</b></button>
      })}</div>}
      {request.status === 'Calling suppliers' && <div className="live-activity-card"><div><Phone size={16}/><span><strong>Supplier outreach</strong><small>{live ? `${offers.length} completed quote${offers.length === 1 ? '' : 's'} · open the supplier queue for current attempts` : '2 completed · 1 unanswered · 1 queued'}</small></span></div><span className="activity-pulse"/></div>}
    </div>
  </dialog>
}
