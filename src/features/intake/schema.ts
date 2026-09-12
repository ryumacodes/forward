export type IntakeSource = 'voice_call'|'voice_note'|'email'|'sms'|'form'
export type Freshness = 'fresh'|'frozen'|'either'|null

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
  halal: boolean | null
  cut: string | null
  freshness: Freshness
  sentimentCue: 'positive'|'neutral'|'frustrated'|'time_pressure'|'stop'
  confidence: number
  missingFields: string[]
  evidence: {field:string; text:string}[]
}

export const intakeJsonSchema = {
  type:'object', additionalProperties:false,
  required:['source','summary','intent','item','quantity','unit','budgetCents','deadline','paymentDays','depositBps','halal','cut','freshness','sentimentCue','confidence','missingFields','evidence'],
  properties:{
    source:{enum:['voice_call','voice_note','email','sms','form']}, summary:{type:'string'}, intent:{enum:['source','quote','counteroffer','confirmation','opt_out','other']},
    item:{type:['string','null']}, quantity:{type:['number','null']}, unit:{type:['string','null']}, budgetCents:{type:['integer','null']}, deadline:{type:['string','null']}, paymentDays:{type:['integer','null']}, depositBps:{type:['integer','null']},
    halal:{type:['boolean','null']}, cut:{type:['string','null']}, freshness:{enum:['fresh','frozen','either',null]},
    sentimentCue:{enum:['positive','neutral','frustrated','time_pressure','stop']}, confidence:{type:'number',minimum:0,maximum:1}, missingFields:{type:'array',items:{type:'string'}},
    evidence:{type:'array',items:{type:'object',additionalProperties:false,required:['field','text'],properties:{field:{type:'string'},text:{type:'string'}}}},
  },
} as const

const DAY_WORD: Record<string,string> = {mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday',sun:'Sunday',monday:'Monday',tuesday:'Tuesday',wednesday:'Wednesday',thursday:'Thursday',friday:'Friday',saturday:'Saturday',sunday:'Sunday'}
const DAY_RE = /\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|tomorrow|tonight|today)\b/i
const ENDS_IN_AM_PM_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
const RAW_TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i

export function normalizeDeadline(text: string): string | null {
  if (!text?.trim()) return null
  const day = DAY_RE.exec(text)?.[1]?.toLowerCase()
  const dayName = day === 'tomorrow' ? 'Tomorrow' : day === 'tonight' || day === 'today' ? '' : day ? DAY_WORD[day] : ''
  const ampm = ENDS_IN_AM_PM_RE.exec(text)
  let time = ''
  if (ampm) {
    let hour = Number(ampm[1])
    if (ampm[3]?.toLowerCase() === 'pm' && hour < 12) hour += 12
    if (ampm[3]?.toLowerCase() === 'am' && hour === 12) hour = 0
    time = `${hour % 12 === 0 ? 12 : hour % 12}${ampm[2] ? `:${ampm[2]}` : ''}${ampm[3]?.toLowerCase()}`
  } else {
    const plain = RAW_TIME_RE.exec(text)
    if (plain && !/\b(asap|when|time|ham|jam)\b/i.test(text)) {
      let hour = Number(plain[1])
      if (hour >= 1 && hour <= 11) time = hourlyAmPm(hour, plain[2])
    }
  }
  const parts = [dayName, time].filter(Boolean)
  return parts.join(' ') || (text.trim() ? text.trim() : null)
}

function hourlyAmPm(hour: number, minute?: string) {
  if (hour >= 12) return `${hour === 12 ? 12 : hour % 12}${minute ? `:${minute}` : ''}pm`
  if (hour >= 5 && hour <= 11) return `${hour}${minute ? `:${minute}` : ''}am`
  return `${hour}${minute ? `:${minute}` : ''}`
}

const CUT_WORDS = ['whole','breast','fillet','fillets','thigh','drumstick','wings','wing','boneless','bone-in','mince','diced','ground','sausage','leg']

export function previewNormalize(source: IntakeSource, text: string): NormalizedIntake {
  const quantityMatch = /\b(\d+(?:\.\d+)?)\s*(kg|kilos?|litres?|liters?|l|units?|boxes?|cases?)\b/i.exec(text)
  const budgetMatch = /(?:under|budget(?: of| is|:)?|up to|max(?:imum)?(?: of)?|or less|cap(?:ped)?(?: at)?|for)\s*(?:\$\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*dollars?\b|([\d,]+(?:\.\d{1,2})?)\s*\$)/i.exec(text)
  const budgetCentsFrom = (match: RegExpExecArray | null) => {
    if (!match) return null
    const value = match[1] ?? match[2] ?? match[3]
    return Math.round(Number(value.replace(',','')) * 100)
  }
  const paymentMatch = /\b(?:net\s*)?(\d{1,3})\s*days?\b/i.exec(text)
  const depositMatch = /\b(\d{1,3}(?:\.\d{1,2})?)\s*%\s*deposit\b/i.exec(text)
  const deadlineFromBy = /\bby\s+([^,;.$]+?)(?=\s+(?:for|under|at|with|pay|net)\b|[,;.]|$)/i.exec(text)?.[1]
  const bySuffix = deadlineFromBy?.trim() ? `by ${deadlineFromBy.trim()}` : ''
  const deadline = normalizeDeadline(bySuffix)
  const stop = /\b(do not (?:call|contact)|don't (?:call|contact)|stop calling|opt out)\b/i.exec(text)
  const time = /\b(i(?:'m| am) busy|in a rush|make it quick)\b/i.exec(text)
  const frustrated = /\b(frustrat\w*|annoy\w*|already told you)\b/i.exec(text)
  const itemMatch = /(?:need|supply|quote(?: for)?|want)\s+(?:about\s+)?(?:\d+(?:\.\d+)?\s*(?:kg|kilos?|litres?|liters?|l|units?|boxes?|cases?)\s+(?:of\s+)?)?([^,.]+?)(?=\s+by\b|\s+(?:under|for|at|with)\s+(?:\$|\d)|[,;.]|$)/i.exec(text)
  const halalMatch = /\bhalal\b/i.exec(text)
  const nonHalal = /\b(?:non[-\s]?halal|not halal|no halal)\b/i.test(text)
  const halal = halalMatch && !nonHalal ? true : nonHalal ? false : null
  const cutMatch = new RegExp(`\\b(${CUT_WORDS.join('|')})\\b`,'i').exec(text)
  const cut = cutMatch ? cutMatch[1].toLowerCase() : null
  const freshnessMatch = /\b(fresh|frozen|chilled)\b/i.exec(text)
  const freshness: Freshness = freshnessMatch ? (freshnessMatch[1].toLowerCase() === 'chilled' ? 'either' : freshnessMatch[1].toLowerCase() as 'fresh'|'frozen') : null
  const sentimentCue = stop ? 'stop' : frustrated ? 'frustrated' : time ? 'time_pressure' : 'neutral'
  const meat = !!itemMatch && /meat|chicken|beef|lamb|goat|poultry|veal|duck|turkey/i.test(itemMatch[1])
  const missingFields = [...(!itemMatch ? ['item'] : []),...(!quantityMatch ? ['quantity'] : []),...(!budgetMatch ? ['budget'] : []),...(!deadline ? ['deadline'] : []),...(meat && halal === null ? ['halal'] : []),...(meat && !cutMatch ? ['cut'] : []),...(meat && !freshnessMatch ? ['freshness'] : [])]
  const evidence: NormalizedIntake['evidence'] = []
  if (itemMatch) evidence.push({field:'item',text:itemMatch[0]})
  if (quantityMatch) evidence.push({field:'quantity',text:quantityMatch[0]})
  if (budgetMatch) evidence.push({field:'budgetCents',text:budgetMatch[0]})
  if (paymentMatch) evidence.push({field:'paymentDays',text:paymentMatch[0]})
  if (depositMatch) evidence.push({field:'depositBps',text:depositMatch[0]})
  if (deadline) evidence.push({field:'deadline',text:bySuffix})
  if (halalMatch) evidence.push({field:'halal',text:halalMatch[0]})
  if (cutMatch) evidence.push({field:'cut',text:cutMatch[0]})
  if (freshnessMatch) evidence.push({field:'freshness',text:freshnessMatch[0]})
  const cue = stop ?? time ?? frustrated
  if (cue) evidence.push({field:'sentimentCue',text:cue[0]})
  return {
    source, summary:text.trim().slice(0,180), intent:stop ? 'opt_out' : /\b(accept|confirm|go ahead|that's right|correct)\b/i.test(text) ? 'confirmation' : /\b(offer|quote|price)\b/i.test(text) ? 'quote' : 'source',
    item:itemMatch?.[1]?.trim() ?? null, quantity:quantityMatch ? Number(quantityMatch[1]) : null, unit:quantityMatch?.[2]?.toLowerCase() ?? null,
    budgetCents:budgetCentsFrom(budgetMatch), deadline, paymentDays:paymentMatch ? Number(paymentMatch[1]) : null,
    depositBps:depositMatch ? Math.round(Number(depositMatch[1]) * 100) : null, halal, cut, freshness, sentimentCue, confidence:(missingFields.length === 0 ? 1 : Math.max(0,1 - missingFields.length / 7)), missingFields, evidence,
  }
}