const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90}
const NUMBER_WORD = Object.keys({...SMALL, ...TENS}).join('|')
const UNIT_SOURCE = 'kg|kilos?|kilograms?|kays?|litres?|liters?|l|units?|boxes?|cases?|cartons?|trays?|packs?|dozens?'

export type ParsedQuantity = {quantity: number; unit: string; evidence: string}

export function correctionTail(value: string) {
  const parts = value.split(/\b(?:actually|sorry|rather|instead|make that|change that to|correction)\b[:,]?/i)
  return parts.at(-1)?.trim() || value.trim()
}

export function normalizeAustralianSpeech(value: string) {
  return value
    .replace(/\b(?:tomoz|tommo|tomo)\b/gi, 'tomorrow')
    .replace(/\barvo\b/gi, 'afternoon')
    .replace(/\bbrekkie\b/gi, 'breakfast')
    .replace(/\bcoupla\b/gi, 'couple')
    .replace(/\bper\s*cent\b/gi, 'percent')
}

export function parseSpokenNumber(value: string): number | null {
  const normalized = normalizeAustralianSpeech(value).toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9.\s]/g, ' ').trim()
  if (!normalized) return null
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized)
  if (/^(?:a\s+)?couple$/.test(normalized)) return 2
  if (/^half\s+(?:a\s+)?dozen$/.test(normalized)) return 6
  if (/^(?:a|one)\s+dozen$/.test(normalized) || normalized === 'dozen') return 12
  const tokens = normalized.split(/\s+/).filter(token => token !== 'and' && token !== 'a')
  if (!tokens.length || tokens.some(token => !(token in SMALL) && !(token in TENS) && token !== 'hundred' && token !== 'thousand')) return null
  let total = 0
  let current = 0
  for (const token of tokens) {
    if (token in SMALL) current += SMALL[token]
    else if (token in TENS) current += TENS[token]
    else if (token === 'hundred') current = Math.max(current, 1) * 100
    else if (token === 'thousand') { total += Math.max(current, 1) * 1000; current = 0 }
  }
  return total + current
}

function numberBefore(text: string, suffixSource: string) {
  const matches = [...text.matchAll(new RegExp(`(?:\\b(\\d+(?:\\.\\d+)?)|\\b((?:(?:${NUMBER_WORD}|hundred|thousand|and|a|couple|half|dozen)\\s+){0,7}(?:${NUMBER_WORD}|hundred|thousand|couple|dozen)))\\s*(${suffixSource})\\b`, 'gi'))]
  const match = matches.at(-1)
  if (!match) return null
  const amount = parseSpokenNumber(match[1] ?? match[2])
  return amount == null ? null : {amount, suffix: match[3], evidence: match[0]}
}

export function canonicalUnit(value: string) {
  const unit = value.toLowerCase()
  if (/^(kg|kilo|kay)/.test(unit)) return 'kg'
  if (/^(l|litre|liter)/.test(unit)) return 'L'
  if (/^unit/.test(unit)) return 'units'
  if (/^box/.test(unit)) return 'boxes'
  if (/^case/.test(unit)) return 'cases'
  if (/^carton/.test(unit)) return 'cartons'
  if (/^tray/.test(unit)) return 'trays'
  if (/^pack/.test(unit)) return 'packs'
  if (/^dozen/.test(unit)) return 'dozen'
  return unit
}

export function parseQuantity(value: string): ParsedQuantity | null {
  const parsed = numberBefore(normalizeAustralianSpeech(correctionTail(value)), UNIT_SOURCE)
  return parsed ? {quantity: parsed.amount, unit: canonicalUnit(parsed.suffix), evidence: parsed.evidence} : null
}

export function parseMoneyCents(value: string): {cents: number; evidence: string} | null {
  const text = normalizeAustralianSpeech(correctionTail(value))
  const numeric = [...text.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)|\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)\b|\b([\d,]+(?:\.\d{1,2})?)\s*\$/gi)].at(-1)
  if (numeric) {
    const amount = Number((numeric[1] ?? numeric[2] ?? numeric[3]).replaceAll(',', ''))
    return Number.isFinite(amount) ? {cents: Math.round(amount * 100), evidence: numeric[0]} : null
  }
  if (/\b(?:a|one)\s+grand\b/i.test(text)) return {cents: 100_000, evidence: text.match(/\b(?:a|one)\s+grand\b/i)?.[0] ?? 'a grand'}
  const spoken = numberBefore(text, 'dollars?|bucks?')
  if (spoken) return {cents: Math.round(spoken.amount * 100), evidence: spoken.evidence}
  const contextual = /\b(?:under|up to|max(?:imum)?|budget(?: is| of)?|cap(?:ped)? at)\s+(.+?)(?=\s+(?:and|with|delivered?|delivery|by|before|net|terms?)\b|[,.;]|$)/i.exec(text)
  if (contextual) {
    const amount = parseSpokenNumber(contextual[1].replace(/\b(?:dollars?|bucks?)\b/i, '').trim())
    if (amount != null) return {cents: Math.round(amount * 100), evidence: contextual[0]}
  }
  return null
}

export function parsePaymentDays(value: string): number | null {
  const text = normalizeAustralianSpeech(correctionTail(value)).toLowerCase()
  if (/\b(?:cod|cash on delivery|due on delivery|pay on delivery|no preference|whatever works|any terms?)\b/.test(text)) return 0
  if (/\b(?:a\s+)?fortnight(?:ly)?\b/.test(text)) return 14
  if (/\b(?:a\s+)?month\b/.test(text)) return 30
  const net = /\bnet\s+([^,.;]+?)(?=\s+(?:and|with|but)\b|[,.;]|$)/i.exec(text)
  if (net) {
    const amount = parseSpokenNumber(net[1].replace(/\bdays?\b/i, '').trim())
    if (amount != null) return Math.round(amount)
  }
  const days = numberBefore(text, 'days?')
  if (days) return Math.round(days.amount)
  const weeks = numberBefore(text, 'weeks?')
  if (weeks) return Math.round(weeks.amount * 7)
  return null
}

export function parseDepositBps(value: string): number | null {
  const text = normalizeAustralianSpeech(correctionTail(value)).toLowerCase()
  if (/\b(?:nothing|none|zero|no (?:deposit|money)|nothing to pay)\b(?:\s+\w+){0,2}\s*\b(?:upfront|up front|deposit)?\b/.test(text) || /\bno deposit\b/.test(text)) return 0
  if (/\b(?:a\s+)?quarter\s+(?:upfront|up front|deposit)\b/.test(text)) return 2500
  if (/\bhalf\s+(?:upfront|up front|deposit)\b/.test(text)) return 5000
  const percentage = numberBefore(text, 'percent|%')
  if (percentage && percentage.amount >= 0 && percentage.amount <= 100) return Math.round(percentage.amount * 100)
  const numeric = /\b(\d{1,3}(?:\.\d{1,2})?)\s*%/.exec(text)
  return numeric && Number(numeric[1]) <= 100 ? Math.round(Number(numeric[1]) * 100) : null
}

export function parseFreshness(value: string): 'fresh' | 'frozen' | 'either' | null {
  const text = normalizeAustralianSpeech(correctionTail(value)).toLowerCase()
  const matches = [...text.matchAll(/\b(fresh|chilled|frozen|either|whatever|anything|not fussed|doesn'?t matter)\b/g)]
  const answer = matches.at(-1)?.[1]
  if (!answer) return null
  if (answer === 'fresh' || answer === 'chilled') return 'fresh'
  if (answer === 'frozen') return 'frozen'
  return 'either'
}

export function parseHalalRequirement(value: string): boolean | null {
  let text = normalizeAustralianSpeech(correctionTail(value)).toLowerCase()
  text = text
    .replace(/\b(?:yeah\s+nah|not halal|no halal|doesn'?t need to be halal|not fussed(?:\s+about halal)?|doesn'?t matter(?:\s+if it'?s halal)?|either is fine|any is fine)\b/g, ' negativeanswer ')
    .replace(/\b(?:nah\s+yeah|must be halal|needs? to be halal|halal required|certified halal)\b/g, ' positiveanswer ')
  const explicit = [...text.matchAll(/\b(positiveanswer|negativeanswer|halal)\b/g)]
  const explicitCue = explicit.at(-1)?.[1]
  if (explicitCue) return explicitCue !== 'negativeanswer'
  // Bare yes/no is valid for the dedicated clarification question, but an
  // unrelated phrase such as "deposit no higher than 10%" must not silently
  // become a halal preference while normalising a full request.
  if (text.trim().split(/\s+/).length > 6) return null
  const cues = [...text.matchAll(/\b(yes|yeah|yep|definitely|no|nah|nope)\b/g)]
  const cue = cues.at(-1)?.[1]
  if (!cue) return null
  return !['no', 'nah', 'nope'].includes(cue)
}
