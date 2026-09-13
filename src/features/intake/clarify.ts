import type { Freshness, NormalizedIntake } from './schema'
import { normalizeDeadline } from './schema'

export type ClarifyQuestion = {
  field: string
  prompt: string
  options?: string[]
}

const MEAT_RE = /meat|chicken|beef|lamb|goat|poultry|veal|duck|turkey|halal/i

export function isMeatItem(item: string | null | undefined) {
  return !!item && MEAT_RE.test(item)
}

export function missingFieldsOf(intake: Pick<NormalizedIntake,'item'|'quantity'|'unit'|'budgetCents'|'deadline'|'halal'|'cut'|'freshness'>): string[] {
  const meat = isMeatItem(intake.item)
  const missing: string[] = []
  if (!intake.item) missing.push('item')
  if (intake.quantity == null || !intake.unit) missing.push('quantity')
  if (intake.budgetCents == null) missing.push('budget')
  if (!intake.deadline) missing.push('deadline')
  if (meat && intake.halal == null) missing.push('halal')
  if (meat && !intake.cut) missing.push('cut')
  if (meat && intake.freshness == null) missing.push('freshness')
  return missing
}

export function clarifyQuestions(intake: NormalizedIntake | Partial<NormalizedIntake>, limits = {haltAfter: 3}) {
  const questions: ClarifyQuestion[] = []
  const item = intake.item ?? null
  const meat = isMeatItem(item)
  const elicit = (question: ClarifyQuestion) => { if (questions.length < limits.haltAfter) questions.push(question) }
  if (!intake.item) { elicit({field:'item', prompt:'What product would you like us to source?'}); return questions }
  if (intake.quantity == null || !intake.unit) { elicit({field:'quantity', prompt:`How much ${item} do you need, with the unit — e.g. 30 kg?`}); return questions }
  if (meat && intake.halal == null) { elicit({field:'halal', prompt:`Is halal certification important for the ${item}?`, options:['Halal required','No halal requirement']}) }
  if (meat && !intake.cut) { elicit({field:'cut', prompt:`Whole ${item}, or particular cuts?`, options:['Whole','Breast','Thigh','Drumsticks','Mixed cuts']}) }
  if (meat && intake.freshness == null) { elicit({field:'freshness', prompt:'Fresh or frozen?', options:['Fresh','Frozen','Either']}) }
  if (!intake.deadline) { elicit({field:'deadline', prompt:'When is the latest you need it delivered?'}) }
  if (intake.budgetCents == null) { elicit({field:'budget', prompt:'Is there a budget cap we should aim under?'}) }
  if (intake.paymentDays == null) { elicit({field:'payment', prompt:'Any preferred payment terms, like net 30?'}) }
  return questions.slice(0, limits.haltAfter)
}

const CUT_WORDS = ['whole','breast','fillet','fillets','thigh','drumstick','drumsticks','wing','wings','boneless','bone-in','mince','diced','ground','sausage','leg','split']

export function parseCut(text: string): string | null {
  const match = new RegExp(`(?:\\.\\s*)?\\b(${CUT_WORDS.join('|')})\\b`,'i').exec(text)
  return match ? match[1].toLowerCase() : null
}

export function applyResponse(intake: NormalizedIntake, field: string, response: string): NormalizedIntake {
  const text = ` ${response.trim()} `
  const next: NormalizedIntake = {...intake, evidence:[...intake.evidence], missingFields:[...intake.missingFields]}
  const mark = (removed: string) => { next.missingFields = next.missingFields.filter(name => name !== removed) }
  switch (field) {
    case 'item':
      next.item = response.trim().slice(0, 120).replace(/^i ?(want|need) /i,'').replace(/\.$/,'')
      mark('item')
      break
    case 'quantity': {
      const match = /\b(\d+(?:\.\d+)?)\s*(kg|kilos?|kilograms?|litres?|liters?|l|units?|boxes?|cases?|cartons?|trays?)\b/i.exec(response)
      if (match) { next.quantity = Number(match[1]); next.unit = match[2].toLowerCase().replace(/s$/,''); mark('quantity') }
      break
    }
    case 'budget': {
      const match = /\$\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+)\s*dollars?\b/i.exec(response)
      if (match) { next.budgetCents = Math.round(Number((match[1] ?? match[2]).replace(',','')) * 100); mark('budget') }
      break
    }
    case 'deadline': {
      const normalized = normalizeDeadline(response)
      if (normalized) { next.deadline = normalized; mark('deadline') }
      break
    }
    case 'payment': {
      const match = /\b(?:net\s*)?(\d{1,3})\s*days?\b/i.exec(response)
      if (match) { next.paymentDays = Number(match[1]); mark('payment') }
      break
    }
    case 'halal': {
      const positive = /\b(yes|yeah|required|important|definitely|must|halal)\b/i.test(text)
      const negative = /\b(no|not|don'?t|doesn'?t matter|any)\b/i.test(text)
      if (positive && !negative) { next.halal = true; mark('halal') }
      else if (negative) { next.halal = false; mark('halal') }
      break
    }
    case 'cut': {
      const cut = parseCut(text)
      if (cut) { next.cut = cut; mark('cut') }
      break
    }
    case 'freshness': {
      if (/\bfresh\b/i.test(text) && !/\bfrozen\b/i.test(text)) { next.freshness = 'fresh'; mark('freshness') }
      else if (/\bfrozen\b/i.test(text)) { next.freshness = 'frozen'; mark('freshness') }
      else if (/\b(either|doesn'?t matter|anything)\b/i.test(text)) { next.freshness = 'either'; mark('freshness') }
      break
    }
  }
  if (next.missingFields.length === 0) next.confidence = 1
  next.evidence.push({field, text:response.trim().slice(0, 200)})
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
