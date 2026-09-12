import { FormEvent, useState } from 'react'
import { AlertCircle, Check, ExternalLink, LoaderCircle, MapPin, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import { discoverSuppliers } from '../features/discovery/service'
import type { DiscoveredSupplier } from '../features/discovery/evidence'
import { demoCandidates, discoveryFactors, discoveryProfiles, rankCandidates, type DiscoveryFactor, type DiscoveryProfileId } from '../features/discovery/engine'

const labels: Record<DiscoveryFactor, string> = {productMatch:'Product match',deliveryFit:'Delivery fit',landedCost:'Landed cost',reliability:'Reliability',locality:'Local proximity',paymentTerms:'Payment terms',certifications:'Certifications'}

export function DiscoveryPolicy() {
  const [profileId,setProfileId] = useState<DiscoveryProfileId>('hospitality')
  const [product,setProduct] = useState('chicken breast wholesale')
  const [location,setLocation] = useState('Melbourne VIC')
  const [results,setResults] = useState<DiscoveredSupplier[]>([])
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const profile = discoveryProfiles.find(item => item.id === profileId) ?? discoveryProfiles[0]
  const ranked = rankCandidates(demoCandidates, profile)
  const search = async(event:FormEvent) => {
    event.preventDefault();setLoading(true);setError('')
    try{setResults(await discoverSuppliers({product,location,profileId}))}catch(reason){setError(reason instanceof Error?reason.message:'Supplier discovery failed.')}
    finally{setLoading(false)}
  }
  return <section className="policy-panel discovery-workbench">
    <div className="section-header"><div><h2>Live supplier discovery</h2><p>Searches public supplier pages, captures evidence, then uses embeddings to match product language.</p></div><span className="demo-badge">Evidence before eligibility</span></div>
    <form className="discovery-search-form" onSubmit={search}>
      <label>Product or specification<input required maxLength={200} value={product} onChange={event=>setProduct(event.target.value)} placeholder="e.g. halal chicken breast wholesale"/></label>
      <label>Delivery area<input required maxLength={200} value={location} onChange={event=>setLocation(event.target.value)} placeholder="e.g. Melbourne VIC 3000"/></label>
      <label>Buying profile<select value={profileId} onChange={event => setProfileId(event.target.value as DiscoveryProfileId)}>{discoveryProfiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="primary" disabled={loading}>{loading?<LoaderCircle className="spin" size={16}/>:<Search size={16}/>} {loading?'Searching public evidence…':'Find live suppliers'}</button>
    </form>
    {error&&<div className="discovery-error" role="alert"><AlertCircle size={17}/><span><strong>Live search is not available yet.</strong>{error}<small>Deploy the discovery function, migration, and server-side OpenAI secret. No result below is being presented as live.</small></span></div>}
    {results.length>0&&<div className="live-discovery-results"><div className="result-heading"><div><Sparkles size={16}/><strong>{results.length} evidence-backed leads</strong></div><span>Live web evidence · ranked by semantic match</span></div>{results.map((supplier,index)=><article className="live-lead" key={supplier.id}><span className="candidate-rank">{index+1}</span><div><div className="live-lead-heading"><strong>{supplier.name}</strong><span>{Math.round(supplier.semanticScore*100)}% semantic match</span></div><p><MapPin size={13}/>{supplier.locality||'Location needs confirmation'}</p><p>{supplier.summary}</p><div className="lead-tags">{supplier.products.slice(0,5).map(item=><span key={item}>{item}</span>)}</div><div className="lead-links">{supplier.sources.slice(0,4).map((source,sourceIndex)=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">Evidence {sourceIndex+1}: {source.title||new URL(source.url).hostname}<ExternalLink size={12}/></a>)}</div><div className="eligibility-warning"><ShieldCheck size={14}/> Lead only — import, live ABR verification, owner authorization, and request checks are still required before contact.</div></div></article>)}</div>}
    <div className="policy-layout"><div className="policy-settings"><h3>How this profile ranks eligible suppliers</h3><p>{profile.description}</p><div className="weight-list">{discoveryFactors.map(factor => <div key={factor}><span>{labels[factor]}</span><span className="weight-track"><i style={{width:`${profile.weights[factor] * 3}%`}}/></span><strong>{profile.weights[factor]}%</strong></div>)}</div></div><div className="discovery-results"><div className="pipeline"><span><Search size={15}/> Semantic product recall</span><span><ShieldCheck size={15}/> Hard eligibility rules</span><span><Check size={15}/> Weighted business fit</span></div><div className="example-label">Illustrative policy outcomes — not live search results</div>{ranked.map((result,index) => <article className={`candidate-row ${result.eligible ? '' : 'blocked'}`} key={result.candidate.id}><span className="candidate-rank">{result.eligible ? index + 1 : <X size={15}/>}</span><div><strong>{result.candidate.name}</strong><p>{result.eligible ? `Eligible for outreach · ${result.reviewReasons.length ? result.reviewReasons.join(' · ') : 'Evidence complete'}` : result.blockers.join(' · ')}</p></div><b>{result.score}<small>/100</small></b></article>)}</div></div>
    <p className="voice-message">The model finds and structures candidates; text-embedding-3-small handles catalogue-language similarity. Neither can override ABR, owner authorization, certification, opt-out, or minimum product-match rules.</p>
  </section>
}
