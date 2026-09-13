import type { SupplierLead } from '../../data/supplierLeads'
import { supplierLeads } from '../../data/supplierLeads'
import { halalSupplierLeads } from '../../data/halalSupplierLeads'

export type SupplyRequest = {
  item: string
  quantity?: number | null
  unit?: string | null
  requiresHalal?: boolean
}

export type SupplyCheckResult = {
  lead: SupplierLead
  matchScore: number
  matchedTokens: string[]
  supplyPages: { label: string; url: string }[]
  callBrief: string
}

const STOPWORDS = new Set(['a','an','of','for','need','needs','supply','quote','fresh','frozen','halal','kg','kgs','kilogram','kilograms','per','and','the'])

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/[\s-]+/).filter(token => token.length > 1 && !STOPWORDS.has(token))
}

export function allSupplyLeads(): SupplierLead[] {
  const byId = new Map<string, SupplierLead>()
  for (const lead of [...halalSupplierLeads, ...supplierLeads]) {
    if (!byId.has(lead.id)) byId.set(lead.id, lead)
  }
  return [...byId.values()]
}

export function scoreSupplyMatch(request: SupplyRequest, lead: SupplierLead) {
  const tokens = tokenize(request.item)
  if (tokens.length === 0) return {matchedTokens: [] as string[], matchScore: 0}
  const source = new Set([...(lead.categories.flatMap(text => tokenize(text))), ...lead.certificationClaims.flatMap(text => tokenize(text))])
  const matchedTokens = tokens.filter(token => source.has(token))
  const score = Math.round((matchedTokens.length / tokens.length) * 100)
  return {matchedTokens:[...new Set(matchedTokens)], matchScore: score}
}

export function buildCallBrief(request: SupplyRequest, result: Omit<SupplyCheckResult,'callBrief'>): string {
  const { lead, supplyPages } = result
  const spec = [request.quantity, request.unit].filter(Boolean).join(' ')
  return [
    `Call ${lead.displayName} on ${lead.phone}.`,
    `Their listed range covers: ${lead.categories.join(', ')}.`,
    ...(supplyPages.length ? [`Check the supply pages first: ${supplyPages.map(page => page.url).join(', ')}.`] : []),
    `Ask about: ${[spec, request.item].filter(Boolean).join(' ')} — exact cut and format, fresh vs frozen, lead time, minimum order, delivery.`,
  ].join(' ')
}

export function checkSupplies(request: SupplyRequest, leads: SupplierLead[] = allSupplyLeads()): SupplyCheckResult[] {
  const pool = request.requiresHalal ? leads.filter(lead => lead.halal) : leads
  return pool
    .filter(lead => !request.requiresHalal || lead.halal)
    .map(lead => ({lead, ...scoreSupplyMatch(request, lead)}))
    .map(result => ({...result, supplyPages: [
      {label:'website', url:result.lead.website},
      ...result.lead.evidenceUrls.map((url, index) => ({label:`supply page ${index + 1}`, url})),
    ]}))
    .map(result => ({...result, callBrief: buildCallBrief(request, result)}))
    .sort((a,b) => b.matchScore - a.matchScore || a.lead.displayName.localeCompare(b.lead.displayName))
}