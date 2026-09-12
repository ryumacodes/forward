export type DiscoveryProfileId = 'hospitality' | 'construction' | 'general'

export type DiscoveryFactor =
  | 'productMatch'
  | 'deliveryFit'
  | 'landedCost'
  | 'reliability'
  | 'locality'
  | 'paymentTerms'
  | 'certifications'

export type DiscoveryProfile = {
  id: DiscoveryProfileId
  name: string
  description: string
  weights: Record<DiscoveryFactor, number>
}

export type SupplierCandidate = {
  id: string
  name: string
  abnActive: boolean
  abnCheckedAt: string
  authorised: boolean
  optedOut: boolean
  productMatch: number
  deliveryFit: number
  landedCost: number
  reliability: number
  locality: number
  paymentTerms: number
  certifications: number
  requiredCertificationsMet: boolean
  sourceConfidence: number
  evidenceUrls: string[]
}

export type DiscoveryDecision = {
  candidate: SupplierCandidate
  eligible: boolean
  score: number
  blockers: string[]
  reviewReasons: string[]
}

export const discoveryProfiles: DiscoveryProfile[] = [
  {
    id: 'hospitality',
    name: 'Hospitality & perishables',
    description: 'Freshness and delivery windows matter more than small price differences.',
    weights: {productMatch: 25, deliveryFit: 25, landedCost: 15, reliability: 15, locality: 10, paymentTerms: 5, certifications: 5},
  },
  {
    id: 'construction',
    name: 'Construction & urgent materials',
    description: 'Exact specification, availability and delivery certainty lead the ranking.',
    weights: {productMatch: 30, deliveryFit: 25, landedCost: 15, reliability: 15, locality: 5, paymentTerms: 5, certifications: 5},
  },
  {
    id: 'general',
    name: 'General wholesale',
    description: 'A balanced default for repeat SME purchasing.',
    weights: {productMatch: 25, deliveryFit: 15, landedCost: 20, reliability: 15, locality: 10, paymentTerms: 10, certifications: 5},
  },
]

const FACTORS: DiscoveryFactor[] = ['productMatch','deliveryFit','landedCost','reliability','locality','paymentTerms','certifications']

export function evaluateCandidate(candidate: SupplierCandidate, profile: DiscoveryProfile, now = Date.now()): DiscoveryDecision {
  const blockers: string[] = []
  const age = now - Date.parse(candidate.abnCheckedAt)
  if (!candidate.abnActive || !Number.isFinite(age) || age < 0 || age > 86_400_000) blockers.push('ABN is not confirmed active in the last 24 hours')
  if (!candidate.authorised) blockers.push('Supplier is not on the owner’s authorised list')
  if (candidate.optedOut) blockers.push('Supplier has asked not to be contacted')
  if (!candidate.requiredCertificationsMet) blockers.push('Required product certifications are missing')
  if (candidate.productMatch < 60) blockers.push('Product match is below the 60% minimum')
  const reviewReasons: string[] = []
  if (candidate.sourceConfidence < .75) reviewReasons.push('Extracted details need human review')
  if (candidate.evidenceUrls.length === 0) reviewReasons.push('No source evidence is attached')
  const score = Math.round(FACTORS.reduce((sum, factor) => sum + candidate[factor] * profile.weights[factor], 0) / 100)
  return {candidate, eligible: blockers.length === 0, score, blockers, reviewReasons}
}

export function rankCandidates(candidates: SupplierCandidate[], profile: DiscoveryProfile, now = Date.now()) {
  return candidates.map(candidate => evaluateCandidate(candidate, profile, now)).sort((a,b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.candidate.name.localeCompare(b.candidate.name))
}

export const demoCandidates: SupplierCandidate[] = [
  {id:'southbank',name:'Southbank Produce Co',abnActive:true,abnCheckedAt:new Date().toISOString(),authorised:true,optedOut:false,productMatch:94,deliveryFit:92,landedCost:78,reliability:91,locality:96,paymentTerms:70,certifications:88,requiredCertificationsMet:true,sourceConfidence:.94,evidenceUrls:['supplier-page']},
  {id:'metro',name:'Metro Trade Supply',abnActive:true,abnCheckedAt:new Date().toISOString(),authorised:true,optedOut:false,productMatch:90,deliveryFit:70,landedCost:91,reliability:82,locality:72,paymentTerms:92,certifications:80,requiredCertificationsMet:true,sourceConfidence:.87,evidenceUrls:['catalogue']},
  {id:'value',name:'Value Source Australia',abnActive:true,abnCheckedAt:new Date().toISOString(),authorised:false,optedOut:false,productMatch:88,deliveryFit:83,landedCost:96,reliability:69,locality:55,paymentTerms:65,certifications:74,requiredCertificationsMet:true,sourceConfidence:.81,evidenceUrls:['directory']},
]
