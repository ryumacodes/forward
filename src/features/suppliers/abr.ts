export type AbrApiRecord = {
  Abn?: string
  AbnStatus?: string
  AbnStatusEffectiveFrom?: string
  Acn?: string
  AddressPostcode?: string
  AddressState?: string
  BusinessName?: string[]
  EntityName?: string
  EntityTypeCode?: string
  EntityTypeName?: string
  Gst?: string
  Message?: string
}

export type AbrVerificationResult = {
  abn: string
  active: boolean
  legalName: string
  businessNames: string[]
  gstRegistered: boolean
  state: string | null
  postcode: string | null
  entityType: string | null
  statusEffectiveFrom: string | null
  nameMatched: boolean
  checkedAt: string
  source: 'ABR'
  evidenceUrl: string
}

export function parseAbrJsonp(payload: string): AbrApiRecord {
  const trimmed = payload.trim()
  const start = trimmed.indexOf('(')
  const end = trimmed.lastIndexOf(')')
  const json = start >= 0 && end > start ? trimmed.slice(start + 1, end) : trimmed
  const value = JSON.parse(json) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ABR returned an invalid response.')
  return value as AbrApiRecord
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/&/g,' and ').replace(/\b(pty|proprietary|limited|ltd|the)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
}

export function businessNameMatches(expectedName: string, legalName: string, businessNames: string[]) {
  const expected = normalizedName(expectedName)
  if (!expected) return false
  return [legalName,...businessNames].some(candidate => {
    const normalized = normalizedName(candidate)
    return normalized === expected || (expected.length >= 6 && (normalized.includes(expected) || expected.includes(normalized)))
  })
}

export function toAbrVerification(record: AbrApiRecord, expectedName: string, checkedAt = new Date().toISOString()): AbrVerificationResult {
  if (record.Message) throw new Error(record.Message)
  const abn = String(record.Abn || '').replace(/\D/g,'')
  if (!/^\d{11}$/.test(abn)) throw new Error('ABR did not return a valid ABN.')
  const legalName = String(record.EntityName || '').trim()
  const businessNames = Array.isArray(record.BusinessName) ? record.BusinessName.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim()) : []
  return {
    abn,
    active:String(record.AbnStatus || '').toLowerCase() === 'active',
    legalName,
    businessNames,
    gstRegistered:Boolean(record.Gst),
    state:record.AddressState?.trim() || null,
    postcode:record.AddressPostcode?.trim() || null,
    entityType:record.EntityTypeName?.trim() || null,
    statusEffectiveFrom:record.AbnStatusEffectiveFrom?.trim() || null,
    nameMatched:businessNameMatches(expectedName,legalName,businessNames),
    checkedAt,
    source:'ABR',
    evidenceUrl:`https://abr.business.gov.au/ABN/View?abn=${abn}`,
  }
}
