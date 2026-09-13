import type { NormalizedIntake } from './schema'
import { normalizeDeadline } from './schema'
import { correctionTail, parseDepositBps, parseFreshness, parseHalalRequirement, parseMoneyCents, parsePaymentDays, parseQuantity } from './speech'

export type ClarifyQuestion = {
  field: string
  prompt: string
  options?: string[]
}

const MEAT_RE = /meat|chicken|beef|lamb|goat|poultry|veal|duck|turkey|halal/i

export function isMeatItem(item: string | null | undefined) {
  return !!item && MEAT_RE.test(item)
}

export function missingFieldsOf(intake: Pick<NormalizedIntake,'item'|'quantity'|'unit'|'budgetCents'|'deadline'|'deliveryLocation'|'paymentDays'|'depositBps'|'halal'|'cut'|'freshness'>): string[] {
  const meat = isMeatItem(intake.item)
  const missing: string[] = []
  if (!intake.item) missing.push('item')
  if (intake.quantity == null || !Number.isFinite(intake.quantity) || intake.quantity <= 0 || !intake.unit) missing.push('quantity')
  if (intake.budgetCents == null || !Number.isFinite(intake.budgetCents) || intake.budgetCents <= 0) missing.push('budget')
  if (!intake.deadline) missing.push('deadline')
  if (!intake.deliveryLocation) missing.push('deliveryLocation')
  if (intake.paymentDays == null || !Number.isFinite(intake.paymentDays) || intake.paymentDays < 0 || intake.paymentDays > 365) missing.push('payment')
  if (intake.depositBps == null || !Number.isFinite(intake.depositBps) || intake.depositBps < 0 || intake.depositBps > 10_000) missing.push('deposit')
  if (meat && intake.halal == null) missing.push('halal')
  if (meat && !intake.cut) missing.push('cut')
  if (meat && intake.freshness == null) missing.push('freshness')
  return missing
}

export function clarifyQuestions(intake: NormalizedIntake | Partial<NormalizedIntake>, limits = {haltAfter: 10}) {
  const questions: ClarifyQuestion[] = []
  const item = intake.item ?? null
  const meat = isMeatItem(item)
  const elicit = (question: ClarifyQuestion) => { if (questions.length < limits.haltAfter) questions.push(question) }
  if (!intake.item) { elicit({field:'item', prompt:'What product would you like us to source?'}); return questions }
  if (intake.quantity == null || !intake.unit) { elicit({field:'quantity', prompt:`How much ${item} do you need, with the unit — e.g. 30 kg?`}); return questions }
  if (meat && intake.halal == null) { elicit({field:'halal', prompt:`Is halal certification important for the ${item}?`, options:['Halal required','No halal requirement']}) }
  if (meat && !intake.cut) { elicit({field:'cut', prompt:`Whole ${item}, or particular cuts?`, options:['Whole','Breast','Thigh','Drumsticks','Mixed cuts']}) }
  if (meat && intake.freshness == null) { elicit({field:'freshness', prompt:'Fresh or frozen?', options:['Fresh','Frozen','Either']}) }
  if (!intake.deadline) { elicit({field:'deadline', prompt:'What exact date and time must it arrive? For example, tomorrow by 8 am.'}) }
  if (!intake.deliveryLocation) { elicit({field:'deliveryLocation', prompt:'What is the full delivery address, including suburb and postcode?'}) }
  if (intake.budgetCents == null) { elicit({field:'budget', prompt:'Is there a budget cap we should aim under?'}) }
  if (intake.paymentDays == null) { elicit({field:'payment', prompt:'What minimum payment terms do you need—on delivery, net 7, net 14, or net 30?'}) }
  if (intake.depositBps == null) { elicit({field:'deposit', prompt:'What is the maximum deposit you will accept?',options:['No deposit','10%','25%','50%']}) }
  return questions.slice(0, limits.haltAfter)
}

const CUT_WORDS = ['whole','breast','fillet','fillets','thigh','drumstick','drumsticks','wing','wings','boneless','bone-in','mince','diced','ground','sausage','leg','split']

export function parseCut(text: string): string | null {
  const match = new RegExp(`(?:\\.\\s*)?\\b(${CUT_WORDS.join('|')})\\b`,'i').exec(text)
  return match ? match[1].toLowerCase() : null
}

export function canonicalIntakeField(field: string) {
  return ({paymentDays:'payment',paymentTerms:'payment',depositBps:'deposit',depositTerms:'deposit',delivery:'deadline',deliveryTime:'deadline',deliveryAddress:'deliveryLocation',location:'deliveryLocation'} as Record<string,string>)[field] ?? field
}

function parseItem(response: string) {
  const item = correctionTail(response).replace(/^(?:i\s+)?(?:want|need|would like)\s+/i,'').replace(/^(?:some|the)\s+/i,'').replace(/[.]+$/,'').trim().slice(0,120)
  return item && !/^(?:whatever|anything|same as before|you know)$/i.test(item) ? item : null
}

function parseDeliveryLocation(response: string) {
  const location = correctionTail(response).replace(/^(?:deliver(?:y|ed)?(?:\s+it)?\s+(?:to|at)|send(?:\s+it)?\s+to|to)\s+/i,'').trim().slice(0,200)
  return /\d+\s+\S+|\b(?:vic|nsw|qld|wa|sa|tas|nt|act)\s*\d{4}\b/i.test(location) ? location : null
}

export function isIntakeResponseUnderstood(field: string, response: string) {
  switch (canonicalIntakeField(field)) {
    case 'item': return parseItem(response) != null
    case 'quantity': return (parseQuantity(response)?.quantity ?? 0) > 0
    case 'budget': return (parseMoneyCents(response)?.cents ?? 0) > 0
    case 'deadline': return normalizeDeadline(response) != null
    case 'deliveryLocation': return parseDeliveryLocation(response) != null
    case 'payment': { const value = parsePaymentDays(response); return value != null && value >= 0 && value <= 365 }
    case 'deposit': { const value = parseDepositBps(response); return value != null && value >= 0 && value <= 10_000 }
    case 'halal': return parseHalalRequirement(response) != null
    case 'cut': return parseCut(response) != null
    case 'freshness': return parseFreshness(response) != null
    default: return false
  }
}

export function applyResponse(intake: NormalizedIntake, field: string, response: string): NormalizedIntake {
  const text = ` ${response.trim()} `
  const next: NormalizedIntake = {...intake, evidence:[...intake.evidence], missingFields:[...intake.missingFields]}
  const canonicalField = canonicalIntakeField(field)
  switch (canonicalField) {
    case 'item': {
      const item = parseItem(response)
      if (item) next.item = item
      break
    }
    case 'quantity': {
      const parsed = parseQuantity(response)
      if (parsed && parsed.quantity > 0) { next.quantity = parsed.quantity; next.unit = parsed.unit }
      break
    }
    case 'budget': {
      const parsed = parseMoneyCents(response)
      if (parsed && parsed.cents > 0) next.budgetCents = parsed.cents
      break
    }
    case 'deadline': {
      const normalized = normalizeDeadline(response)
      if (normalized) next.deadline = normalized
      break
    }
    case 'deliveryLocation': {
      const location = parseDeliveryLocation(response)
      if (location) next.deliveryLocation=location
      break
    }
    case 'payment': {
      const days = parsePaymentDays(response)
      if (days != null && days >= 0 && days <= 365) next.paymentDays = days
      break
    }
    case 'deposit': {
      const bps = parseDepositBps(response)
      if (bps != null) next.depositBps = bps
      break
    }
    case 'halal': {
      const halal = parseHalalRequirement(text)
      if (halal != null) next.halal = halal
      break
    }
    case 'cut': {
      const cut = parseCut(correctionTail(text))
      if (cut) next.cut = cut
      break
    }
    case 'freshness': {
      const freshness = parseFreshness(text)
      if (freshness) next.freshness = freshness
      break
    }
  }
  next.missingFields = missingFieldsOf(next)
  next.confidence = next.missingFields.length === 0 ? 1 : Math.max(0, 1 - next.missingFields.length / 10)
  next.evidence.push({field:canonicalField, text:response.trim().slice(0, 200)})
  return next
}

export function confirmIntake(intake: NormalizedIntake): string {
  const parts: string[] = []
  if (intake.item) parts.push([intake.quantity, intake.unit, intake.cut, intake.item, intake.halal === false ? 'non-halal' : intake.halal ? 'halal' : null, intake.freshness === 'either' ? null : intake.freshness].filter(Boolean).join(' '))
  if (intake.deadline) parts.push(`delivered by ${intake.deadline}`)
  if (intake.deliveryLocation) parts.push(`to ${intake.deliveryLocation}`)
  if (intake.budgetCents != null) parts.push(`for up to $${(intake.budgetCents / 100).toFixed(2)}`)
  if (intake.paymentDays != null) parts.push(`net ${intake.paymentDays} days`)
  if (intake.depositBps != null) parts.push(`${intake.depositBps / 100}% deposit`)
  const body = parts.length ? parts.join(', ') : 'your request'
  return `Just to confirm: ${body}. Is that right?`
}
