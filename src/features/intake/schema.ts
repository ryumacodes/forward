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
  deliveryLocation: string | null
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
  required:['source','summary','intent','item','quantity','unit','budgetCents','deadline','deliveryLocation','paymentDays','depositBps','halal','cut','freshness','sentimentCue','confidence','missingFields','evidence'],
  properties:{
    source:{enum:['voice_call','voice_note','email','sms','form']}, summary:{type:'string'}, intent:{enum:['source','quote','counteroffer','confirmation','opt_out','other']},
    item:{type:['string','null']}, quantity:{type:['number','null']}, unit:{type:['string','null']}, budgetCents:{type:['integer','null']}, deadline:{type:['string','null']}, deliveryLocation:{type:['string','null']}, paymentDays:{type:['integer','null']}, depositBps:{type:['integer','null']},
    halal:{type:['boolean','null']}, cut:{type:['string','null']}, freshness:{enum:['fresh','frozen','either',null]},
    sentimentCue:{enum:['positive','neutral','frustrated','time_pressure','stop']}, confidence:{type:'number',minimum:0,maximum:1}, missingFields:{type:'array',items:{type:'string'}},
    evidence:{type:'array',items:{type:'object',additionalProperties:false,required:['field','text'],properties:{field:{type:'string'},text:{type:'string'}}}},
  },
} as const

const DAY_WORD: Record<string,string> = {mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday',sun:'Sunday',monday:'Monday',tuesday:'Tuesday',wednesday:'Wednesday',thursday:'Thursday',friday:'Friday',saturday:'Saturday',sunday:'Sunday'}
const DAY_RE = /\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|tomorrow|tonight|today)\b/i
const TIME_RE = /\b(?:by|before)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
const CUT_WORDS = ['whole','breast','fillet','fillets','thigh','drumstick','wings','wing','boneless','bone-in','mince','diced','ground','sausage','leg']

export function normalizeDeadline(text: string, now = new Date()): string | null {
  if (!text?.trim()) return null
  const dayToken=DAY_RE.exec(text)?.[1]?.toLowerCase()
  const time=TIME_RE.exec(text)
  if(dayToken==='today'||dayToken==='tomorrow'||dayToken==='tonight'){
    const date=new Date(now)
    if(dayToken==='tomorrow')date.setDate(date.getDate()+1)
    if(time){let hour=Number(time[1])%12;if(time[3].toLowerCase()==='pm')hour+=12;date.setHours(hour,Number(time[2]||0),0,0)}
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
  }
  const dayName=dayToken?DAY_WORD[dayToken]:''
  const timeLabel=time?`${Number(time[1])}${time[2]?`:${time[2]}`:''}${time[3].toLowerCase()}`:''
  return [dayName,timeLabel].filter(Boolean).join(' ')||text.trim()||null
}

export function previewNormalize(source: IntakeSource, text: string, now = new Date()): NormalizedIntake {
  const quantityMatch=/\b(\d+(?:\.\d+)?)\s*(kg|kilos?|litres?|liters?|l|units?|boxes?|cases?)\b/i.exec(text)
  const budgetMatch=/(?:under|budget(?: of| is|:)?|up to|max(?:imum)?(?: of)?|or less|cap(?:ped)?(?: at)?|for)\s*(?:\$\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*dollars?\b|([\d,]+(?:\.\d{1,2})?)\s*\$)/i.exec(text)
  const paymentMatch=/\b(?:net\s*)?(\d{1,3})\s*days?\b/i.exec(text)
  const depositMatch=/\b(\d{1,3}(?:\.\d{1,2})?)\s*%\s*deposit\b/i.exec(text)
  const noDeposit=/\bno deposit\b/i.test(text)
  const locationMatch=/\b(?:deliver(?:ed|y)?\s+(?:to|at)|drop(?:ped)?\s+(?:to|at))\s+([^,.]+(?:,\s*[^,.]+?)?)(?=\s+(?:by|before|today|tomorrow|under|budget|max|net|and no deposit)|[.]|$)/i.exec(text)
  const itemMatch=/(?:need|supply|quote(?: for)?|want)\s+(?:about\s+)?(?:\d+(?:\.\d+)?\s*(?:kg|kilos?|litres?|liters?|l|units?|boxes?|cases?)\s+(?:of\s+)?)?([^,.]+?)(?=\s+(?:by|before|today|tomorrow)\b|\s+(?:under|for|at|with)\s+(?:\$|\d)|[,.;]|$)/i.exec(text)
  const relativeDay=/\b(today|tomorrow|tonight)\b/i.exec(text)
  const namedDeadline=/\bby\s+([^,;.$]+?)(?=\s+(?:for|under|at|with|pay|net)\b|[,;.]|$)/i.exec(text)?.[1]
  const deadlineEvidence=relativeDay?[relativeDay[0],TIME_RE.exec(text)?.[0]].filter(Boolean).join(' '):namedDeadline?`by ${namedDeadline}`:''
  const deadline=deadlineEvidence?normalizeDeadline(deadlineEvidence,now):null
  const stop=/\b(do not (?:call|contact)|don't (?:call|contact)|stop calling|opt out)\b/i.exec(text)
  const timePressure=/\b(i(?:'m| am) busy|in a rush|make it quick)\b/i.exec(text)
  const frustrated=/\b(frustrat\w*|annoy\w*|already told you)\b/i.exec(text)
  const halalMatch=/\bhalal\b/i.exec(text),nonHalal=/\b(?:non[-\s]?halal|not halal|no halal)\b/i.test(text)
  const halal=nonHalal?false:halalMatch?true:null
  const cutMatch=new RegExp(`\\b(${CUT_WORDS.join('|')})\\b`,'i').exec(itemMatch?.[1]||text),cut=cutMatch?.[1].toLowerCase()??null
  const freshnessMatch=/\b(fresh|frozen|chilled)\b/i.exec(text)
  const freshness:Freshness=freshnessMatch?(freshnessMatch[1].toLowerCase()==='chilled'?'either':freshnessMatch[1].toLowerCase() as 'fresh'|'frozen'):null
  const meat=Boolean(itemMatch&&/meat|chicken|beef|lamb|goat|poultry|veal|duck|turkey/i.test(itemMatch[1]))
  const sentimentCue=stop?'stop':frustrated?'frustrated':timePressure?'time_pressure':'neutral'
  const missingFields=[...(!itemMatch?['item']:[]),...(!quantityMatch?['quantity']:[]),...(!budgetMatch?['budget']:[]),...(!deadline?['deadline']:[]),...(meat&&halal===null?['halal']:[]),...(meat&&!cut?['cut']:[]),...(meat&&!freshness?['freshness']:[])]
  const evidence:NormalizedIntake['evidence']=[]
  if(itemMatch)evidence.push({field:'item',text:itemMatch[0]})
  if(quantityMatch)evidence.push({field:'quantity',text:quantityMatch[0]})
  if(budgetMatch)evidence.push({field:'budgetCents',text:budgetMatch[0]})
  if(paymentMatch)evidence.push({field:'paymentDays',text:paymentMatch[0]})
  if(depositMatch||noDeposit)evidence.push({field:'depositBps',text:depositMatch?.[0]||'no deposit'})
  if(deadline)evidence.push({field:'deadline',text:deadlineEvidence})
  if(locationMatch)evidence.push({field:'deliveryLocation',text:locationMatch[0]})
  if(halalMatch)evidence.push({field:'halal',text:halalMatch[0]})
  if(cutMatch)evidence.push({field:'cut',text:cutMatch[0]})
  if(freshnessMatch)evidence.push({field:'freshness',text:freshnessMatch[0]})
  const cue=stop??timePressure??frustrated
  if(cue)evidence.push({field:'sentimentCue',text:cue[0]})
  const budgetValue=budgetMatch?(budgetMatch[1]??budgetMatch[2]??budgetMatch[3]):null
  return {
    source,summary:text.trim().slice(0,180),intent:stop?'opt_out':/\b(accept|confirm|go ahead|that's right|correct)\b/i.test(text)?'confirmation':/\b(offer|quote|price)\b/i.test(text)?'quote':'source',
    item:itemMatch?.[1]?.trim()??null,quantity:quantityMatch?Number(quantityMatch[1]):null,unit:quantityMatch?canonicalUnit(quantityMatch[2]):null,budgetCents:budgetValue?Math.round(Number(budgetValue.replaceAll(',',''))*100):null,
    deadline,deliveryLocation:locationMatch?.[1]?.trim()??null,paymentDays:paymentMatch?Number(paymentMatch[1]):null,depositBps:noDeposit?0:depositMatch?Math.round(Number(depositMatch[1])*100):null,
    halal,cut,freshness,sentimentCue,confidence:missingFields.length===0?1:Math.max(0,1-missingFields.length/7),missingFields,evidence,
  }
}

function canonicalUnit(value:string){const unit=value.toLowerCase();if(/^(kg|kilo)/.test(unit))return 'kg';if(/^(l|litre|liter)/.test(unit))return 'L';if(/^unit/.test(unit))return 'units';if(/^box/.test(unit))return 'boxes';if(/^case/.test(unit))return 'cases';return unit}
