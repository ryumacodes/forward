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
  paymentDays: number | null
  depositBps: number | null
  sentimentCue: 'positive'|'neutral'|'frustrated'|'time_pressure'|'stop'
  confidence: number
  missingFields: string[]
  evidence: {field:string; text:string}[]
}

export const intakeJsonSchema = {
  type:'object', additionalProperties:false,
  required:['source','summary','intent','item','quantity','unit','budgetCents','deadline','paymentDays','depositBps','sentimentCue','confidence','missingFields','evidence'],
  properties:{
    source:{enum:['voice_call','voice_note','email','sms','form']}, summary:{type:'string'}, intent:{enum:['source','quote','counteroffer','confirmation','opt_out','other']},
    item:{type:['string','null']}, quantity:{type:['number','null']}, unit:{type:['string','null']}, budgetCents:{type:['integer','null']}, deadline:{type:['string','null']}, paymentDays:{type:['integer','null']}, depositBps:{type:['integer','null']},
    sentimentCue:{enum:['positive','neutral','frustrated','time_pressure','stop']}, confidence:{type:'number',minimum:0,maximum:1}, missingFields:{type:'array',items:{type:'string'}},
    evidence:{type:'array',items:{type:'object',additionalProperties:false,required:['field','text'],properties:{field:{type:'string'},text:{type:'string'}}}},
  },
} as const

export function previewNormalize(source: IntakeSource, text: string): NormalizedIntake {
  const quantityMatch = /\b(\d+(?:\.\d+)?)\s*(kg|kilos?|litres?|liters?|l|units?|boxes?|cases?)\b/i.exec(text)
  const budgetMatch = /(?:under|budget(?: of| is|:)?|up to|max(?:imum)?(?: of)?)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text)
  const paymentMatch = /\b(?:net\s*)?(\d{1,3})\s*days?\b/i.exec(text)
  const depositMatch = /\b(\d{1,3}(?:\.\d{1,2})?)\s*%\s*deposit\b/i.exec(text)
  const stop = /\b(do not (?:call|contact)|don't (?:call|contact)|stop calling|opt out)\b/i.exec(text)
  const time = /\b(i(?:'m| am) busy|in a rush|make it quick)\b/i.exec(text)
  const frustrated = /\b(frustrat\w*|annoy\w*|already told you)\b/i.exec(text)
  const itemMatch = /(?:need|supply|quote(?: for)?)\s+(?:about\s+)?(?:\d+(?:\.\d+)?\s*(?:kg|kilos?|litres?|liters?|l|units?|boxes?|cases?)\s+(?:of\s+)?)?([^,.]+?)(?=\s+by\b|\s+(?:under|for|at)\s+\$|[,.]|$)/i.exec(text)
  const sentimentCue = stop ? 'stop' : frustrated ? 'frustrated' : time ? 'time_pressure' : 'neutral'
  const missingFields = [...(!itemMatch ? ['item'] : []),...(!quantityMatch ? ['quantity'] : []),...(!budgetMatch ? ['budget'] : [])]
  const evidence = [
    itemMatch && {field:'item',text:itemMatch[0]}, quantityMatch && {field:'quantity',text:quantityMatch[0]}, budgetMatch && {field:'budgetCents',text:budgetMatch[0]},
    paymentMatch && {field:'paymentDays',text:paymentMatch[0]}, depositMatch && {field:'depositBps',text:depositMatch[0]}, (stop || time || frustrated) && {field:'sentimentCue',text:(stop || time || frustrated)![0]},
  ].filter(Boolean) as {field:string;text:string}[]
  return {
    source, summary:text.trim().slice(0,180), intent:stop ? 'opt_out' : /\b(accept|confirm|go ahead)\b/i.test(text) ? 'confirmation' : /\b(offer|quote|price)\b/i.test(text) ? 'quote' : 'source',
    item:itemMatch?.[1]?.trim() ?? null, quantity:quantityMatch ? Number(quantityMatch[1]) : null, unit:quantityMatch?.[2]?.toLowerCase() ?? null,
    budgetCents:budgetMatch ? Math.round(Number(budgetMatch[1].replace(',','')) * 100) : null, deadline:null, paymentDays:paymentMatch ? Number(paymentMatch[1]) : null,
    depositBps:depositMatch ? Math.round(Number(depositMatch[1]) * 100) : null, sentimentCue, confidence:Math.max(.35,.95 - missingFields.length * .17), missingFields, evidence,
  }
}
