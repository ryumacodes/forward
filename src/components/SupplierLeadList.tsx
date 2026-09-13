import { useState } from 'react'
import { ExternalLink, MapPin, Search, ShieldCheck } from '../icons'
import { supplierLeads } from '../data/supplierLeads'
import { SupplierProximityMap } from './SupplierProximityMap'

export function SupplierLeadList({deliveryLocation='24 Flinders Lane, Melbourne'}:{deliveryLocation?:string}={}) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = supplierLeads.filter(lead =>
    `${lead.displayName} ${lead.categories.join(' ')} ${lead.location}`.toLowerCase().includes(normalizedQuery)
  )

  return (
    <section className="supplier-leads">
      <div className="section-header">
        <div>
          <h2>Researched example supplier leads</h2>
          <p>Public information gathered for the demo dataset. These are not live discovery or current ABR results.</p>
        </div>
        <span className="demo-badge">{supplierLeads.length} researched</span>
      </div>
      <label className="lead-search">
        <Search size={17}/>
        <input aria-label="Search supplier leads" placeholder="Search supplier, category or suburb" value={query} onChange={event => setQuery(event.target.value)}/>
      </label>
      <SupplierProximityMap leads={filtered} deliveryLocation={deliveryLocation}/>
      <div className="lead-list">
        {filtered.map(lead => (
          <article className="lead-card" key={lead.id}>
            <button className="lead-summary" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)} aria-expanded={expanded === lead.id}>
              <span className="supplier-logo">{lead.displayName.split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</span>
              <div>
                <h3>{lead.displayName}</h3>
                <p><MapPin size={13}/>{lead.location}</p>
                <div className="lead-tags">{lead.categories.slice(0, 4).map(category => <span key={category}>{category}</span>)}</div>
              </div>
              <span className="lead-status"><ShieldCheck size={15}/> Example evidence<small>Live checks required</small></span>
            </button>
            {expanded === lead.id && (
              <div className="lead-detail">
                <dl>
                  <div><dt>Legal entity</dt><dd>{lead.legalName}</dd></div>
                  <div><dt>ABN</dt><dd>{lead.abn} · {lead.gstRegistered ? 'GST registered' : 'Not GST registered'}</dd></div>
                  <div><dt>Phone</dt><dd><a href={`tel:${lead.phone.replace(/\s/g, '')}`}>{lead.phone}</a></dd></div>
                  <div><dt>Email</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : 'Not published'}</dd></div>
                  <div><dt>Service area</dt><dd>{lead.serviceArea}</dd></div>
                  <div><dt>Payment terms</dt><dd>{lead.paymentTerms ?? 'Ask supplier'}</dd></div>
                </dl>
                <p><strong>Delivery:</strong> {lead.deliveryNotes}</p>
                <p><strong>Public certification claims:</strong> {lead.certificationClaims.join(', ') || 'None recorded. Request current evidence.'}</p>
                <div className="lead-links">
                  <a href={lead.abnEvidenceUrl} target="_blank" rel="noreferrer">ABN Lookup <ExternalLink size={13}/></a>
                  <a href={lead.website} target="_blank" rel="noreferrer">Supplier website <ExternalLink size={13}/></a>
                  {lead.evidenceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Evidence {index + 1} <ExternalLink size={13}/></a>)}
                </div>
                <p className="lead-caveat">Snapshot researched 12 Sep 2026. Re-run live ABR and web checks; confirm stock, price, delivery, certifications, contact preference and terms before use.</p>
              </div>
            )}
          </article>
        ))}
      </div>
      {filtered.length === 0 && <p className="import-empty">No researched suppliers match that search.</p>}
    </section>
  )
}
