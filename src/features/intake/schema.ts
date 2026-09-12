export type IntakeSource = 'voice_call'|'voice_note'|'email'|'sms'|'form'

export type NormalizedIntake = {
  source: IntakeSource
  summary: string
  intent: 'source'|'quote'|'counteroffer'|'confirmation'|'opt_out'|'other'
  item: string | null
  quantity: number | null
  unit: string | null
  budgetCents: number | null
  deadline: string | null
  deliveryLocation: string | null
  paymentDays: number | null
  depositBps: number | null
  sentimentCue: 'positive'|'neutral'|'frustrated'|'time_pressure'|'stop'
  confidence: number
  missingFields: string[]
  evidence: {field:string; text:string}[]
}

export const intakeJsonSchema = {
  type:'object', additionalProperties:false,
  required:['source','summary','intent','item','quantity','unit','budgetCents','deadline','deliveryLocation','paymentDays','depositBps','sentimentCue','confidence','missingFields','evidence'],
  properties:{
    source:{enum:['voice_call','voice_note','email','sms','form']}, summary:{type:'string'}, intent:{enum:['source','quote','counteroffer','confirmation','opt_out','other']},
    item:{type:['string','null']}, quantity:{type:['number','null']}, unit:{type:['string','null']}, budgetCents:{type:['integer','null']}, deadline:{type:['string','null']}, deliveryLocation:{type:['string','null']}, paymentDays:{type:['integer','null']}, depositBps:{type:['integer','null']},
    sentimentCue:{enum:['positive','neutral','frustrated','time_pressure','stop']}, confidence:{type:'number',minimum:0,maximum:1}, missingFields:{type:'array',items:{type:'string'}},
    evidence:{type:'array',items:{type:'object',additionalProperties:false,required:['field','text'],properties:{field:{type:'string'},text:{type:'string'}}}},
  },
} as const

export function previewNormalize(source: IntakeSource, text: string, now = new Date()): NormalizedIntake {
  const quantityMatch = /\b(\d+(?:\.\d+)?)\s*(kg|kilos?|litres?|liters?|l|units?|boxes?|cases?)\b/i.exec(text)
  const budgetMatch = /(?:under|budget(?: of| is|:)?|up to|max(?:imum)?(?: of)?)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text)
  const paymentMatch = /\b(?:net\s*)?(\d{1,3})\s*days?\b/i.exec(text)
  const depositMatch = /\b(\d{1,3}(?:\.\d{1,2})?)\s*%\s*deposit\b/i.exec(text)
  const locationMatch = /\b(?:deliver(?:ed|y)?\s+(?:to|at)|drop(?:ped)?\s+(?:to|at))\s+([^,.]+(?:,\s*[^,.]+?)?)(?=\s+(?:by|before|today|tomorrow|under|budget|max)|[.]|$)/i.exec(text)
  const clockMatch = /\b(?:by|before)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text)
  const stop = /\b(do not (?:call|contact)|don't (?:call|contact)|stop calling|opt out)\b/i.exec(text)
  const time = /\b(i(?:'m| am) busy|in a rush|make it quick)\b/i.exec(text)
  const frustrated = /\b(frustrat\w*|annoy\w*|already told you)\b/i.exec(text)
  const itemMatch = /(?:need|supply|quote(?: for)?)\s+(?:about\s+)?(?:\d+(?:\.\d+)?\s*(?:kg|kilos?|litres?|liters?|l|units?|boxes?|cases?)\s+(?:of\s+)?)?([^,.]+?)(?=\s+(?:by|before|today|tomorrow)\b|\s+(?:under|for|at)\s+\$|[,.]|$)/i.exec(text)
  const sentimentCue = stop ? 'stop' : frustrated ? 'frustrated' : time ? 'time_pressure' : 'neutral'
  const missingFields = [...(!itemMatch ? ['item'] : []),...(!quantityMatch ? ['quantity'] : []),...(!budgetMatch ? ['budget'] : []),...(!(/\b(?:today|tomorrow)\b/i.test(text)) ? ['deadline'] : []),...(!locationMatch ? ['delivery location'] : [])]
  let deadline: string | null = null
  if (/\btomorrow\b/i.test(text) || /\btoday\b/i.test(text)) {
    const date = new Date(now)
    if (/\btomorrow\b/i.test(text)) date.setDate(date.getDate() + 1)
    if (clockMatch) {
      let hour = Number(clockMatch[1]) % 12
      if (clockMatch[3].toLowerCase() === 'pm') hour += 12
      date.setHours(hour, Number(clockMatch[2] || 0), 0, 0)
    }
    deadline = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
  }
  const evidence: NormalizedIntake['evidence'] = []
  if (itemMatch) evidence.push({field:'item',text:itemMatch[0]})
  if (quantityMatch) evidence.push({field:'quantity',text:quantityMatch[0]})
  if (budgetMatch) evidence.push({field:'budgetCents',text:budgetMatch[0]})
  if (paymentMatch) evidence.push({field:'paymentDays',text:paymentMatch[0]})
  if (depositMatch) evidence.push({field:'depositBps',text:depositMatch[0]})
  if (deadline) evidence.push({field:'deadline',text:[/\b(?:today|tomorrow)\b/i.exec(text)?.[0],clockMatch?.[0]].filter(Boolean).join(' ')})
  if (locationMatch) evidence.push({field:'deliveryLocation',text:locationMatch[0]})
  const cue = stop ?? time ?? frustrated
  if (cue) evidence.push({field:'sentimentCue',text:cue[0]})
  return {
    source, summary:text.trim().slice(0,180), intent:stop ? 'opt_out' : /\b(accept|confirm|go ahead)\b/i.test(text) ? 'confirmation' : /\b(offer|quote|price)\b/i.test(text) ? 'quote' : 'source',
    item:itemMatch?.[1]?.trim() ?? null, quantity:quantityMatch ? Number(quantityMatch[1]) : null, unit:quantityMatch ? canonicalUnit(quantityMatch[2]) : null,
    budgetCents:budgetMatch ? Math.round(Number(budgetMatch[1].replaceAll(',','')) * 100) : null, deadline, deliveryLocation:locationMatch?.[1]?.trim() ?? null, paymentDays:paymentMatch ? Number(paymentMatch[1]) : null,
    depositBps:depositMatch ? Math.round(Number(depositMatch[1]) * 100) : null, sentimentCue, confidence:(5 - missingFields.length) / 5, missingFields, evidence,
  }
}

function canonicalUnit(value: string) {
  const unit = value.toLowerCase()
  if (/^(kg|kilo)/.test(unit)) return 'kg'
  if (/^(l|litre|liter)/.test(unit)) return 'L'
  if (/^unit/.test(unit)) return 'units'
  if (/^box/.test(unit)) return 'boxes'
  if (/^case/.test(unit)) return 'cases'
  return unit
}
