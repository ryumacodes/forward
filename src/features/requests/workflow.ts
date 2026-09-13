export type SourcingMode = 'first_qualifying' | 'compare'
export type PurchaseMode = 'confirm' | 'preauthorized'

export type PostQuoteAction = 'continue_sourcing' | 'request_owner_approval' | 'request_owner_selection' | 'auto_purchase' | 'review_no_match'
export type QuoteDisposition = 'quote_not_qualifying' | 'comparison_pending' | 'approval_required' | 'auto_purchase'

export function parseSourcingMode(value: string): SourcingMode | null {
  const corrections = value.split(/\b(?:actually|sorry|rather|instead|make that|change that to)\b[:,]?/i)
  const text = corrections.at(-1)?.toLowerCase() ?? value.toLowerCase()
  if (/\b(?:don'?t|do not|no need to)\s+(?:compare|shop around)|\b(?:first|any)\s+(?:supplier|quote|deal)\s+(?:that|which)\s+(?:works|qualifies|meets)|\bstop (?:once|when)|\bjust (?:buy|get it|sort it)\b/.test(text)) return 'first_qualifying'
  if (/\b(?:compare|comparison|shop around|multiple suppliers?|several suppliers?|a few suppliers?|more suppliers?|best (?:price|quote|deal|option)|cheapest)\b/.test(text)) return 'compare'
  return null
}

export function decideQuoteDisposition(input: {sourcingMode?: SourcingMode; purchaseMode?: PurchaseMode; quoteQualifies: boolean}): QuoteDisposition {
  if (!input.quoteQualifies) return 'quote_not_qualifying'
  if ((input.sourcingMode ?? 'compare') === 'compare') return 'comparison_pending'
  return input.purchaseMode === 'preauthorized' ? 'auto_purchase' : 'approval_required'
}

export function decidePostQuoteAction(input: {sourcingMode?: SourcingMode; purchaseMode?: PurchaseMode; quoteQualifies: boolean; hasMoreSuppliers: boolean}): PostQuoteAction {
  const disposition = decideQuoteDisposition(input)
  if (disposition === 'quote_not_qualifying') return input.hasMoreSuppliers ? 'continue_sourcing' : 'review_no_match'
  if (disposition === 'comparison_pending') return input.hasMoreSuppliers ? 'continue_sourcing' : 'request_owner_selection'
  return disposition === 'auto_purchase' ? 'auto_purchase' : 'request_owner_approval'
}

export function sourcingModeLabel(mode: SourcingMode | undefined) {
  return mode === 'first_qualifying' ? 'Stop at first qualifying quote' : 'Compare suppliers, then owner chooses'
}
