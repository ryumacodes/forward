import { supabase } from './lib/supabase/client'
import { useOwner } from './lib/supabase/AuthGate'
import { loadWorkspace, saveProcurementRequest, saveSupplier, addOrganizationMember, updateMyProfilePhone, type CallQueueItem, type Organization, type OrgMember } from './lib/supabase/workspace'
import { useEffect, useRef, useState } from 'react'
import { Mic, Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, FileText, LayoutDashboard, LogOut, Mail, MapPin, MessageSquare, MoreHorizontal, Package, Phone, Plus, RotateCcw, Search, ShieldCheck, VerifiedBadge, Users, X } from './icons'
import { SupplierImport } from './components/SupplierImport'
import { NegotiationTools } from './components/NegotiationTools'
import { DiscoveryPolicy } from './components/DiscoveryPolicy'
import { AgentPolicy } from './components/AgentPolicy'
import { IntakeNormalizer } from './components/IntakeNormalizer'
import { SupplierLeadList } from './components/SupplierLeadList'
import type { ImportedSupplier } from './features/suppliers/verification'
import { SupplierRanking } from './components/SupplierRanking'
import { paymentLabel } from './features/requests/ranking'
import { NewRequest } from './components/NewRequest'
import { RequestsPage } from './components/RequestsPage'
import { CallQueuePanel } from './components/CallQueuePanel'
import { TeamPanel } from './components/TeamPanel'
import { VoiceOrb } from './components/VoiceOrb'
import { BrandMark } from './components/BrandMark'
import { initialRequests, offers, money, validateOffer, type ProcurementRequest, type Offer } from './features/requests/data'
import { sourcingModeLabel } from './features/requests/workflow'
import { discoverImportAndVerifySuppliers } from './features/discovery/service'
type Page = 'Overview' | 'Requests' | 'Suppliers' | 'Call activity'
export default function App() {
  const owner = useOwner()
  const [organization,setOrganization] = useState<Organization|null>(null)
  const [organizations,setOrganizations] = useState<Organization[]>([])
  const [members,setMembers] = useState<OrgMember[]>([])
  const [loading,setLoading] = useState(Boolean(supabase))
  const [loadError,setLoadError] = useState('')
  const [liveOffers,setLiveOffers] = useState<Offer[]>([])
  const [callQueue,setCallQueue] = useState<CallQueueItem[]>([])
  const workspaceOffers = supabase ? liveOffers : offers
  const [importedSuppliers, setImportedSuppliers] = useState<ImportedSupplier[]>([])
  const [mobileDetail, setMobileDetail] = useState(false)
  const [page, setPage] = useState<Page>('Overview')
  const [requests, setRequests] = useState<ProcurementRequest[]>(supabase ? [] : initialRequests)
  const [selected, setSelected] = useState('REQ-024')
  const [tab, setTab] = useState('Overview')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [transcript, setTranscript] = useState<Offer | null>(null)
  const [notice, setNotice] = useState('')
  const [accountMenu, setAccountMenu] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const screeningRequestIds = useRef(new Set<string>())
  const request = requests.find(r => r.id === selected) ?? {...initialRequests[0],id:'',item:'No request selected',status:'Ready to source' as const}
  const requestOffers=workspaceOffers.filter(offer=>!offer.requestId||offer.requestId===request.id)
  const seeded = !supabase && request.id === 'REQ-024'
  const approved = request.status === 'Approved'
  const filtered = requests.filter(r => `${r.item} ${r.id}`.toLowerCase().includes(query.toLowerCase()))
  const nav = (next: Page) => { setPage(next); setQuery(''); setMobileDetail(false); setAccountMenu(false); window.scrollTo({top:0}) }
  const notify = (message: string) => setNotice(message)
  const showWorkspaceGuide = () => {
    notify(supabase?'Create a request, choose its buying rules, authorise an ABN-verified supplier, then compare evidence-backed quotes. A PO can only be automatic when that request was explicitly pre-authorised.':'Create a request and explore the clearly labelled sample workflow. Configure Supabase to connect live services.')
    setAccountMenu(false)
  }
  const signOut = async () => {
    if (!supabase) return
    setAccountBusy(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      notify(error.message || 'Could not sign out. Please try again.')
      setAccountBusy(false)
    }
  }
  const today = new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date())
  useEffect(() => {
    if(!supabase || !owner)return
    let cancelled=false
    loadWorkspace().then(data=>{if(cancelled)return;setOrganization(data.organization);setOrganizations(data.organizations);setMembers(data.members);setRequests(data.requests);setImportedSuppliers(data.suppliers);setLiveOffers(data.offers);setCallQueue(data.callQueue);setSelected(data.requests[0]?.id ?? '')}).catch(error=>{if(!cancelled)setLoadError(error.message || 'Could not load your workspace.')}).finally(()=>{if(!cancelled)setLoading(false)})
    return ()=>{cancelled=true}
  },[owner?.id])
  const switchOrganization=async(organizationId:string)=>{
    setLoading(true);setLoadError('')
    try{const data=await loadWorkspace(organizationId);setOrganization(data.organization);setOrganizations(data.organizations);setMembers(data.members);setRequests(data.requests);setImportedSuppliers(data.suppliers);setLiveOffers(data.offers);setCallQueue(data.callQueue);setSelected(data.requests[0]?.id??'')}
    catch(error){setLoadError(error instanceof Error?error.message:'Could not load this organisation.')}
    finally{setLoading(false)}
  }
  const refreshWorkspace=async()=>{
    if(!organization)return
    const data=await loadWorkspace(organization.id)
    setRequests(data.requests);setImportedSuppliers(data.suppliers);setLiveOffers(data.offers);setCallQueue(data.callQueue);setMembers(data.members)
  }
  useEffect(() => {
    const createdFromSarah = notice === 'Request created from Sarah. Start automatic supplier screening.'
    const demoCreatedFromSarah = notice === 'Request created from Sarah in this demo session.'
    if (!createdFromSarah && !demoCreatedFromSarah) return

    setPage('Requests')
    setMobileDetail(true)
    window.scrollTo({top:0})

    if (!supabase || !organization) {
      setNotice('Request created and added to Requests. Live supplier and ABN screening needs a connected workspace.')
      return
    }

    const createdRequest = requests.find(item => item.id === selected)
    if (!createdRequest || screeningRequestIds.current.has(createdRequest.id)) return
    screeningRequestIds.current.add(createdRequest.id)
    setNotice('Request saved. Finding suppliers and checking public ABNs…')
    void discoverImportAndVerifySuppliers({
      request: createdRequest,
      organizationId: organization.id,
      onProgress: message => setNotice(message),
      onImported: async count => {
        await refreshWorkspace()
        setPage('Suppliers')
        setMobileDetail(false)
        window.scrollTo({top:0})
        setNotice(`${count} researched supplier${count===1?'':'s'} added. ABN verification has started…`)
      },
    }).then(async summary => {
      await refreshWorkspace()
      setPage('Suppliers')
      setMobileDetail(false)
      setNotice(`ABN verification completed: ${summary.verified} verified, ${summary.needsAbn} need an ABN, ${summary.failed} failed. Choose “Authorise & start outreach” to send the supplier SMS and queue Sarah’s call.`)
    }).catch(error => {
      const message = error instanceof Error ? error.message : 'Unknown supplier screening error.'
      setNotice(`Request saved in Requests. Automatic supplier screening could not finish: ${message}`)
    })
  }, [notice, organization, requests, selected])
  const requestStarter=(item:ProcurementRequest)=>item.createdById?item.createdById===owner?.id?'you':item.createdBy||'a team member':undefined
  const myRole=members.find(member=>member.userId===owner?.id)?.role
  const roleLabel=myRole==='owner'?'Workspace owner':myRole==='admin'?'Administrator':supabase?'Workspace member':'Business owner'
  const addMember=async(email:string)=>{
    if(!organization)return
    const added=await addOrganizationMember(organization.id,email)
    setMembers(previous=>[...previous.filter(item=>item.userId!==added.userId),added])
    notify(`${added.fullName || added.email || 'That account'} can now use the ${organization.name} workspace.`)
  }
  const saveMyPhone=async(phone:string)=>{
    await updateMyProfilePhone(phone)
    notify(supabase?'Sarah will call or text this number for requests you start.':'Phone preference saved in the demo workspace.')
  }
  const addRequest=async(input:ProcurementRequest)=>{
    const created=organization ? await saveProcurementRequest(input,organization.id) : input
    setRequests(previous=>[created,...previous])
    setSelected(created.id)
    notify(supabase?'Request saved. Authorise a verified supplier to start live outreach.':'Request added to the demo queue.')
    return created
  }
  useEffect(()=>{
    if(!supabase||!organization)return
    const client=supabase
    let timer:number|undefined
    const refresh=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>{void loadWorkspace(organization.id).then(data=>{setRequests(data.requests);setImportedSuppliers(data.suppliers);setLiveOffers(data.offers);setCallQueue(data.callQueue)})},250)}
    const channel=client.channel(`workspace-calls-${organization.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'supplier_call_queue',filter:`organization_id=eq.${organization.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'supplier_calls',filter:`organization_id=eq.${organization.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'supplier_quotes',filter:`organization_id=eq.${organization.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'suppliers',filter:`organization_id=eq.${organization.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'supplier_verifications',filter:`organization_id=eq.${organization.id}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'purchase_orders',filter:`organization_id=eq.${organization.id}`},refresh)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'procurement_requests',filter:`organization_id=eq.${organization.id}`},refresh)
      .subscribe()
    return()=>{window.clearTimeout(timer);void client.removeChannel(channel)}
  },[organization?.id])
  useEffect(() => {
    if (!accountMenu) return
    const closeOutside = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenu(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setAccountMenu(false)
      accountTriggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    accountMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountMenu])
  if(loading || loadError)return <div className="auth-screen"><h2>{loadError?'Workspace unavailable':'Loading your workspace…'}</h2>{loadError && <><p role="alert">{loadError}</p><p>Check the Supabase connection and apply the database migration.</p><button className="secondary" onClick={()=>window.location.reload()}>Retry</button></>}</div>
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={() => nav('Overview')}><BrandMark className="brand-mark"/>sourcepilot<span className="brand-period">.</span></a>
      <div className="workspace"><span className="workspace-logo">{organization?.name?.[0]?.toUpperCase() ?? 'F'}</span><div><select aria-label="Organisation workspace" value={organization?.id??''} disabled={!supabase||organizations.length<2} onChange={event=>void switchOrganization(event.target.value)}>{organizations.length?organizations.map(item=><option value={item.id} key={item.id}>{item.name}</option>):<option>{organization?.name??'Flinders Kitchen'}</option>}</select><small>{organization?.kind === 'personal' ? 'Personal organisation' : 'Business organisation'}</small></div><ChevronDown size={15}/></div>
      <span className="nav-label">WORKSPACE</span>
      <nav>{([[LayoutDashboard,'Overview'],[Package,'Requests'],[Users,'Suppliers'],[Phone,'Call activity']] as const).map(([Icon, label]) => <button key={label} aria-current={page === label ? 'page' : undefined} className={page === label ? 'nav-item active' : 'nav-item'} onClick={() => nav(label)}><Icon size={19}/>{label}{label === 'Requests' && <span className="nav-count">{requests.filter(r => r.status !== 'Approved').length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="agent-status"><span className="status-dot"/><strong>Sarah is ready</strong><p>Calls first. You stay in control.</p><div><Phone size={14}/><span/><MessageSquare size={14}/><span/><Mail size={14}/></div></div><button className="help" onClick={showWorkspaceGuide}><CircleHelp size={18}/> Help & getting started <ArrowUpRight size={15}/></button><div className="account" ref={accountMenuRef}><span className="avatar">{(owner?.email?.[0] ?? 'J').toUpperCase()}</span><div className="account-identity"><strong>{owner?.email ?? 'Jamie Lee'}</strong><small>{roleLabel}</small></div><button ref={accountTriggerRef} className="account-menu-trigger" aria-label={accountMenu ? 'Close account menu' : 'Open account menu'} aria-haspopup="menu" aria-expanded={accountMenu} aria-controls="account-menu" onClick={() => setAccountMenu(open => !open)}><MoreHorizontal size={19}/></button>{accountMenu && <div className="account-menu" id="account-menu" role="menu" aria-label="Account options"><div className="account-menu-heading"><strong>{supabase ? organization?.name ?? 'Connected workspace' : 'Demo workspace'}</strong><span>{supabase ? 'Your organisation and session' : 'Safe to explore and reset'}</span></div>{supabase && <TeamPanel members={members} currentUserId={owner?.id} canManage={Boolean(owner?.id && ['owner','admin'].includes(String(myRole)))} onAddMember={async email=>{try{await addMember(email);return ''}catch(error){return error instanceof Error?error.message:'Could not add that member.'}}} onSavePhone={saveMyPhone} onError={message=>notify(message)}/>}<button role="menuitem" onClick={showWorkspaceGuide}><CircleHelp size={17}/><span><strong>Workspace guide</strong><small>See how procurement flows</small></span></button>{supabase && owner ? <button role="menuitem" disabled={accountBusy} onClick={signOut}><LogOut size={17}/><span><strong>{accountBusy ? 'Signing out…' : 'Sign out'}</strong><small>End this workspace session</small></span></button> : <button role="menuitem" onClick={() => window.location.reload()}><RotateCcw size={17}/><span><strong>Restart demo data</strong><small>Return to the sample workspace</small></span></button>}</div>}</div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14}/> <span>{page}</span></div><div className="topbar-right"><span className="demo-badge">{supabase ? 'Connected workspace' : 'Demo workspace'}</span><span className="top-date">{today}</span></div></header>
    <main className={mobileDetail ? 'mobile-detail-active' : ''}>
      <div className="page-heading"><div><div className="eyebrow">YOUR PROCUREMENT, UNDER CONTROL</div><h1>{page === 'Overview' ? 'Voice procurement' : page}</h1><p>{page === 'Overview' ? 'Say what you need. Sarah takes it from there.' : page === 'Requests' ? 'Track every sourcing job from request to approved supplier.' : page === 'Suppliers' ? 'Your authorised supplier list. ABN verification is required before outreach.' : 'Every conversation. Every detail. All in one place.'}</p></div><button className="primary" onClick={() => setModal(true)}><Mic size={18}/> Talk to Sarah</button></div>
      {page === 'Overview' && <>
        <section className="voice-entry"><button className="dashboard-orb" aria-label="Start talking to Sarah" onClick={() => setModal(true)}><VoiceOrb size={88}/></button><div><span className="eyebrow">ONE CONVERSATION. PROCUREMENT HANDLED.</span><h2>“I need 30 kilos of chicken by 8 am, under $350.”</h2><p>Sarah calls authorised suppliers, compares quotes, and gets it sorted.</p></div><button className="primary" onClick={() => setModal(true)}><Mic size={16}/> Start talking</button></section><div className="flow-strip"><span><Mic size={14}/> Tell us what you need</span><ChevronRight size={13}/><span><ShieldCheck size={14}/> ABN-verified suppliers</span><ChevronRight size={13}/><span><Phone size={14}/> Call & compare</span><ChevronRight size={13}/><span><CheckCheck size={14}/> You approve any order</span></div><section className="metrics"><Metric title="Active requests" value={String(requests.filter(r => r.status !== 'Approved').length).padStart(2,'0')} note={`${requests.filter(r => r.status === 'Needs approval').length} waiting for your decision`} icon={<Package size={18}/>}/><Metric title="Completed this week" value={String(requests.filter(r => r.status === 'Approved').length).padStart(2,'0')} note={supabase ? 'Saved in your workspace' : 'From your demo requests'} icon={<CheckCheck size={18}/>}/><Metric title="Time spent on calls" value={supabase ? '—' : '3m 12s'} note="Handled by Sarah" icon={<Phone size={18}/>}/><Metric title="Below budget" value={supabase ? '—' : '$35'} note="On the recommended option" icon={<ArrowDownLeft size={18}/>}/></section>
        <div className="section-header"><div className="section-title"><h2>Procurement requests</h2><span className="count">{requests.length}</span></div><label className="search"><Search size={16}/><input aria-label="Search requests" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search requests…"/></label></div>
        <div className="request-layout"><section className="request-list">{filtered.map(r => <button key={r.id} className={`request-item ${r.id === selected ? 'selected' : ''}`} onClick={() => { setSelected(r.id); setTab('Overview'); setMobileDetail(true); window.scrollTo({top:0}) }}><div className="request-meta"><span>{r.id}</span><ChevronRight size={15}/></div><h3>{r.item}</h3><p>{r.quantity} {r.unit} <span>·</span> {money(r.budget)} budget{requestStarter(r) && <> <span>·</span> by {requestStarter(r)}</>}</p><Badge status={r.status}/></button>)}{filtered.length === 0 && <p className="empty">No matching requests.</p>}<button className="add-request" onClick={() => setModal(true)}><Plus size={15}/> Create a request</button><div className="list-caption"><ShieldCheck size={16}/><span>Purchases follow your<br/>authorisation rules.</span></div></section>
        <section className={requests.length ? "detail" : "detail no-selection"}>{requests.length === 0 && <div className="workspace-empty"><h2>Your workspace is ready.</h2><p>Create your first procurement request to get started.</p><button className="primary" onClick={() => setModal(true)}>Create a request</button></div>}<button className="mobile-back" onClick={() => { setMobileDetail(false); window.scrollTo({top:0}) }}><ArrowLeft size={18}/> All requests</button><div className="detail-header"><div><div className="detail-kicker">{request.id} <span>/</span> {request.category}{requestStarter(request) && <span> · started by {requestStarter(request)}</span>}</div><h2>{request.item} <span>— {request.quantity}{request.unit === 'units' ? ' ' : ''}{request.unit}</span></h2></div><Badge status={request.status}/></div><div className="constraints"><span><Clock3 size={16}/>{new Date(request.deadline).toLocaleString('en-AU',{day:'numeric', month:'short',hour:'numeric',minute:'2-digit'})}</span><span><span className="dollar">$</span> {money(request.budget)} max budget</span><span><MapPin size={16}/>{request.location}</span></div>
        {request.purchaseMode && <div className="request-rules"><ShieldCheck size={15}/><span>{sourcingModeLabel(request.sourcingMode)} · {request.purchaseMode === 'preauthorized' ? `Pre-authorised up to ${money(request.budget)} when all requirements pass` : 'Confirm with you before buying'} · {request.confirmationChannel === 'sms' ? 'Confirmation by text' : 'Call you first, then text'}<em>Payment: {request.minimumPaymentDays ?? 0}+ days from invoice · deposit up to {request.maximumDepositPercent ?? 0}%</em>{request.brief && <em>“{request.brief}”</em>}</span></div>}<div className="tabs" role="tablist">{['Overview','Supplier quotes','Call transcripts'].map(t => <button role="tab" aria-selected={tab === t} className={tab === t ? 'tab active' : 'tab'} key={t} onClick={() => setTab(t)}>{t}{t === 'Supplier quotes' && <span>{seeded ? 3 : 0}</span>}</button>)}</div>
        {!seeded ? requestOffers.length ? <SupplierRanking offers={requestOffers} request={request} organizationId={organization?.id} onTranscript={setTranscript}/> : <div className="empty-state"><span className="empty-icon">{approved ? <CheckCheck/> : <Phone/>}</span><h3>{approved ? 'Request approved' : 'Ready for supplier outreach'}</h3><p>{approved ? 'This request has already been approved.' : 'Your request is captured. Authorise a verified supplier to start a live quote call.'}</p><span className="demo-badge">{supabase?'Waiting for live quotes':'Demo · No live calls'}</span></div> : <>
        {tab === 'Overview' && <div className="detail-body"><section className={`recommendation ${approved ? 'approved' : ''}`}><div className="recommend-label"><span><VerifiedBadge size={16}/>{approved ? 'SUPPLIER APPROVED' : 'RECOMMENDED OPTION'}</span><span className="verified"><ShieldCheck size={14}/> Verified by call</span></div><div className="recommend-main"><div className="supplier-heading"><span className="supplier-logo">VF</span><div><h3>Victorian Foods</h3><p>Exact match · {request.quantity}kg available</p></div></div><div className="price">$315<span>AUD · incl. delivery</span></div></div><div className="delivery-line"><Clock3 size={16}/><strong>{offers[0].delivery}</strong><span>1 hour before your deadline</span></div><div className="checks">{Object.entries(validateOffer(offers[0],request)).map(([label,pass]) => <span key={label}>{pass ? <Check size={14}/> : <X size={14}/>} {label}</span>)}</div><div className="negotiated-terms"><strong>Payment terms improved</strong><span>Due on delivery → Net 14 from invoice · No deposit · No added fees</span><button className="text-button" onClick={() => setTab('Supplier quotes')}>Compare supplier rankings <ArrowRight size={14}/></button></div><div className="recommend-footer"><span><strong>$35 under budget.</strong> All requirements met.</span><button className="primary" disabled={approved} onClick={() => { setRequests(requests.map(r => r.id === selected ? {...r,status:'Approved'} : r)); notify('Supplier approved in this demo. No order or supplier message has been sent.') }}>{approved ? <><Check size={16}/> Approved</> : <>Approve supplier <ArrowRight size={16}/></>}</button></div></section>
        <div className="timeline-heading"><h3>Request activity</h3><span><Clock3 size={14}/> 3m 12s of calls</span></div><div className="timeline"><Timeline time="14:08" title="Procurement request created" description="30kg chicken breast · before 8:00 am · up to $350"/><Timeline time="14:08" title="3 alternative suppliers contacted" description="Sarah called to confirm stock, price and delivery." icon={<Phone size={14}/>}/><Timeline time="14:09" title="FreshFoods Wholesale" description="20kg available · $9.80/kg" badge="Insufficient quantity"/><Timeline time="14:10" title="Metro Poultry" description="30kg available · $300 total" badge="Misses deadline"/><Timeline time="14:11" title="Victorian Foods meets all requirements" description={`30kg · $315 delivered · ${offers[0].delivery}`} success/>{approved && <Timeline time="Now" title="Approved by you" description="Supplier selection saved for this demo." success/>}</div><button className="text-button" onClick={() => setTab('Call transcripts')}>View call transcripts <ArrowRight size={15}/></button></div>}
        {tab === 'Supplier quotes' && <SupplierRanking offers={requestOffers} request={request} organizationId={organization?.id} onTranscript={setTranscript}/>}
        {tab === 'Call transcripts' && <div className="quotes-view">{requestOffers.map(o => <CallRow key={o.id} offer={o} onClick={() => setTranscript(o)}/>)}</div>}
        </>}
        </section></div>
      </>}
      {page === 'Requests' && <RequestsPage requests={requests} offers={workspaceOffers} selectedId={selected} live={Boolean(supabase)} onSelect={setSelected} onCreate={() => setModal(true)} onAddRequest={addRequest} onTranscript={setTranscript}/>}
      {page === 'Suppliers' && <section className="directory"><SupplierImport suppliers={importedSuppliers} organizationId={organization?.id} activeRequestId={selected} onCallStarted={notify} onQueueChanged={refreshWorkspace} onImport={async supplier => {if(organization)await saveSupplier(supplier,organization.id);setImportedSuppliers(previous => [...previous,supplier])}} onUpdate={supplier => setImportedSuppliers(previous => previous.map(item => item.id === supplier.id ? supplier : item))}/><DiscoveryPolicy organizationId={organization?.id} request={request} onImported={refreshWorkspace}/><SupplierLeadList deliveryLocation={request.location}/>{workspaceOffers.map(o => <article className="supplier-card" key={o.id}><div className="supplier-heading"><span className="supplier-logo neutral">{o.initials}</span><div><h2>{o.name}</h2><p>{o.live?'Recorded quote supplier':'Melbourne · Poultry & fresh produce · Demo supplier'}</p></div></div><div className="supplier-policy"><ShieldCheck size={16}/> {o.abnVerified&&o.authorised?'ABN verified · Owner authorised':'ABN verification or owner authorisation required'}</div><div className="supplier-stats"><div><span>Last quote</span><strong>{money(o.price)} <small>/ {o.quantity}{o.item?'':'kg'}</small></strong></div><div><span>Last contact</span><strong>{o.live?'Latest completed call':'Demo supplier history'}</strong></div></div><details className="supplier-review"><summary>Check supplier history & terms</summary><p>On-time history: {o.completedOrders?`${o.onTimeDeliveries} of ${o.completedOrders} orders`:'Not established'}. Payment: {paymentLabel(o.paymentDays)}. Deposit: {o.depositPercent}%. Added fees: {money(o.fees)}.</p><p>{o.live?'Quote facts are retained with the verified provider transcript.':'ABN verification must complete before any real outreach. History shown here is sample data.'}</p></details><button className="secondary" onClick={() => setTranscript(o)}><FileText size={16}/> View last conversation</button></article>)}</section>}
      {page === 'Call activity' && supabase && <CallQueuePanel items={callQueue} onChanged={refreshWorkspace}/>}
      {page === 'Call activity' && <section className="activity-page"><div className="section-header"><h2>Recent supplier calls</h2><span className="demo-badge">{supabase ? `${workspaceOffers.length} live quote transcripts` : '3 demo conversations'}</span></div>{workspaceOffers.map(o => <CallRow key={o.id} offer={o} onClick={() => setTranscript(o)}/>)}{workspaceOffers.length===0&&<p className="import-empty">No completed supplier quote calls yet.</p>}<div className="channel-note"><Phone size={20}/><div><strong>A conversation comes first.</strong><p>SMS and email are follow-up channels when a supplier needs written details. No follow-ups sent.</p></div></div></section>}
      {page === 'Call activity' && <NegotiationTools/>}
      {page === 'Call activity' && <AgentPolicy/>}
      {page === 'Call activity' && <IntakeNormalizer/>}
      <footer><span><ShieldCheck size={14}/> Your rules. Your budget. Sarah handles the rest.</span><span>All amounts in AUD <span className="footer-dot">·</span> {supabase ? 'Saved workspace' : 'Sample data'}</span></footer>
    </main></div>
    {modal && <NewRequest
      onClose={() => setModal(false)}
      onCreate={async (input,options) => {
        const r = organization ? await saveProcurementRequest(input,organization.id) : input
        setRequests(previous => [r,...previous]); setSelected(r.id); setMobileDetail(true)
        window.scrollTo({top:0}); setPage('Requests'); setTab('Overview')
        if(!options?.keepOpen)setModal(false)
        notify(options?.keepOpen
          ? (supabase ? 'Request created from Sarah. Start automatic supplier screening.' : 'Request created from Sarah in this demo session.')
          : (supabase ? 'Request saved. Authorise a verified supplier to start live outreach.' : 'Request created and added to Requests. Live supplier calls are not connected in demo mode.'))
      }}
    />}
    {transcript && <TranscriptDialog offer={transcript} onClose={()=>setTranscript(null)}/>}
    {notice && <div className="toast" role="status"><Activity size={19}/><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={17}/></button></div>}
  </div>
}
function Metric({title,value,note,icon}:{title:string;value:string;note:string;icon:React.ReactNode}) { return <article className="metric"><div>{title}{icon}</div><strong>{value}</strong><span>{note}</span></article> }
function Badge({status}:{status:string}) { return <span className={`badge ${status === 'Approved' ? 'green' : status === 'Needs approval' ? 'amber' : 'neutral-badge'}`}><span className="status-dot"/>{status}</span> }
function Timeline({time,title,description,badge,icon,success}:{time:string;title:string;description:string;badge?:string;icon?:React.ReactNode;success?:boolean}) { return <div className="timeline-row"><time>{time}</time><span className={`timeline-node ${success ? 'success' : ''}`}>{success ? <Check size={14}/> : icon || <span/>}</span><div><strong>{title}</strong><p>{description} {badge && <span className="reason">{badge}</span>}</p></div></div> }
function CallRow({offer,onClick}:{offer:Offer;onClick:()=>void}) { return <button className="call-row" onClick={onClick}><span className="call-icon"><Phone size={18}/></span><div><strong>{offer.name}</strong><p>{offer.item ?? 'Chicken breast'} · Outbound call</p></div><span className="call-duration">{offer.minutes}</span><span className="call-completed"><Check size={14}/> Completed</span><ChevronRight size={18}/></button> }
function TranscriptDialog({offer,onClose}:{offer:Offer;onClose:()=>void}) {return <dialog className="transcript-panel" ref={node=>{if(node&&!node.open)node.showModal()}} onCancel={onClose} aria-label="Call transcript"><button className="secondary" autoFocus onClick={onClose}><ArrowLeft size={16}/> Back to workspace</button><div className="eyebrow">{offer.live?'VERIFIED PROVIDER TRANSCRIPT':'DEMO CALL TRANSCRIPT'}</div><h2>{offer.name}</h2><p className="muted">{offer.minutes} · Completed</p>{offer.live?<><div className="waveform"><span><Check size={14}/> ElevenLabs post-call webhook received</span></div>{offer.transcript?.map((turn,index)=><div className={`speech ${turn.role==='user'?'supplier':''}`} key={index}><span>{turn.role==='user'?offer.name.toUpperCase():'SARAH · SOURCEPILOT AI'}</span><p>{turn.message}</p></div>)}<div className="channel-note"><ShieldCheck size={20}/><p>Webhook signature verified. Quote fields are extracted only from supplier turns and remain reviewable against this transcript.</p></div></>:<><div className="waveform">{Array.from({length:48},(_,i)=><i key={i} style={{height:`${12+((i*17)%35)}px`}}/>)}<span><Check size={14}/> Call complete</span></div><div className="speech"><span>SARAH · SOURCEPILOT AI</span><p>Hi, I’m calling on behalf of Flinders Kitchen. Can you supply 30kg of chicken breast, delivered to Flinders Lane before 8 am tomorrow?</p></div><div className="speech supplier"><span>{offer.name.toUpperCase()}</span><p>We have {offer.quantity} kilos available. The total is {money(offer.price)}, including delivery. We can deliver {offer.delivery.toLowerCase()}.</p></div><div className="speech"><span>SARAH · SOURCEPILOT AI</span><p>Could you offer at least 14 days from invoice, with no deposit? Please confirm any fees and the final total.</p></div><div className="speech supplier"><span>{offer.name.toUpperCase()}</span><p>We can move from {paymentLabel(offer.originalPaymentDays).toLowerCase()} to {paymentLabel(offer.paymentDays).toLowerCase()}. The deposit is {offer.depositPercent}%, with {money(offer.fees)} in added fees. Total payable is {money(offer.price+offer.fees)}.</p></div><div className="speech"><span>SARAH · SOURCEPILOT AI</span><p>Thank you. I’ll pass those details to the owner for review. This is a quote enquiry, so no order is being placed.</p></div><div className="channel-note"><ShieldCheck size={20}/><p>Illustrative transcript for the UI prototype. A real call recording is not connected.</p></div></>}</dialog>}
