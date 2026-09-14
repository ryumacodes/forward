export type IntakeSource = 'voice_call'|'voice_note'|'email'|'sms'|'form'
export type Freshness = 'fresh'|'frozen'|'either'|null

import { canonicalUnit, normalizeAustralianSpeech, parseDepositBps, parseFreshness, parseHalalRequirement, parseMoneyCents, parsePaymentDays, parseQuantity, parseSpokenNumber } from './speech'

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
const CUT_WORDS = ['whole','breast','fillet','fillets','thigh','thighs','drumstick','wings','wing','boneless','bone-in','mince','diced','ground','sausage','leg']

export function normalizeDeadline(text: string, now = new Date()): string | null {
  if (!text?.trim()) return null
  const normalized=normalizeAustralianSpeech(text)
  const iso=/\b(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?\b/.exec(normalized)
  if(iso){
    const [,year,month,day,hour,minute]=iso
    const valid=new Date(`${year}-${month}-${day}T${hour}:${minute}:00`)
    if(!Number.isNaN(valid.getTime())&&valid.getFullYear()===Number(year)&&valid.getMonth()+1===Number(month)&&valid.getDate()===Number(day)&&Number(hour)<24&&Number(minute)<60)return `${year}-${month}-${day}T${hour}:${minute}`
  }
  const dayToken=DAY_RE.exec(normalized)?.[1]?.toLowerCase()
  const numericTime=TIME_RE.exec(normalized)
  const spokenTime=/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::(\d{2}))?\s*(?:in the\s+)?(morning|afternoon|evening|night)\b/i.exec(normalized)
  const specialTime=/\b(noon|midnight)\b/i.exec(normalized)
  let hour:number|null=null,minute=0,meridiem=''
  if(numericTime){hour=Number(numericTime[1])%12;if(numericTime[3].toLowerCase()==='pm')hour+=12;minute=Number(numericTime[2]||0);meridiem=numericTime[3].toLowerCase()}
  else if(spokenTime){hour=parseSpokenNumber(spokenTime[1]);minute=Number(spokenTime[2]||0);const period=spokenTime[3].toLowerCase();if(hour!=null&&period!=='morning'&&hour<12)hour+=12;meridiem=period==='morning'?'am':'pm'}
  else if(specialTime){hour=specialTime[1].toLowerCase()==='noon'?12:0;meridiem=hour===12?'pm':'am'}
  if(dayToken==='today'||dayToken==='tomorrow'||dayToken==='tonight'){
    // A relative day without a stated time is incomplete. Reusing the current
    // clock would invent a deadline and could incorrectly approve a late quote.
    if(hour==null)return null
    const date=new Date(now)
    if(dayToken==='tomorrow')date.setDate(date.getDate()+1)
    date.setHours(hour,minute,0,0)
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
  }
  const dayName=dayToken?DAY_WORD[dayToken]:''
  const displayHour=hour==null?'':hour===0?12:hour>12?hour-12:hour
  const timeLabel=hour==null?'':`${displayHour}${minute?`:${String(minute).padStart(2,'0')}`:''}${meridiem}`
  return dayName&&timeLabel?[dayName,timeLabel].join(' '):null
}

export function previewNormalize(source: IntakeSource, text: string, now = new Date()): NormalizedIntake {
  const normalizedText=normalizeAustralianSpeech(text)
  const quantity=parseQuantity(text)
  const budget=parseMoneyCents(text)
  const paymentDays=parsePaymentDays(text)
  const depositBps=parseDepositBps(text)
  const locationMatch=/\b(?:deliver(?:ed|y)?(?:\s+it)?\s+(?:to|at)|drop(?:ped)?(?:\s+it)?\s+(?:to|at)|send(?:\s+it)?\s+to)\s+([^,.]+?(?:,\s*[^,.]+?)?)(?=\s+(?:by|before|today|tomorrow|under|budget|max|net|and|with)\b|[.;]|$)/i.exec(normalizedText)
  const itemMatch=/(?:need|supply|quote(?: for)?|want|get me|after|order(?: for)?)\s+(?:about\s+)?(.+?)(?=\s+(?:deliver(?:ed|y)?|drop(?:ped)?|send(?:\s+it)?\s+to)\b|\s+(?:by|before|today|tomorrow|tonight|under|budget|max|net|with)\b|[,.;]|$)/i.exec(normalizedText)
  let item=itemMatch?.[1]?.trim()??null
  if(item&&quantity){const escaped=quantity.evidence.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');item=item.replace(new RegExp(`^${escaped}\\s+(?:of\\s+)?`,'i'),'').trim()||null}
  const deadline=normalizeDeadline(normalizedText,now)
  const deadlineEvidence=deadline?(normalizedText.match(/\b(?:by|before)?\s*(?:(?:\d{1,2}(?::\d{2})?\s*(?:am|pm))|(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+in the)?\s+(?:morning|afternoon|evening|night))|noon|midnight)?\s*(?:today|tomorrow|tonight|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)/i)?.[0]??deadline):''
  const stop=/\b(do not (?:call|contact)|don't (?:call|contact)|stop calling|opt out)\b/i.exec(text)
  const timePressure=/\b(i(?:'m| am) busy|in a rush|make it quick)\b/i.exec(text)
  const frustrated=/\b(frustrat\w*|annoy\w*|already told you)\b/i.exec(text)
  const halal=parseHalalRequirement(text)
  const halalMatch=/\b(?:halal|not fussed|doesn'?t matter)\b/i.exec(text)
  const cutMatch=new RegExp(`\\b(${CUT_WORDS.join('|')})\\b`,'i').exec(item||text),cut=cutMatch?.[1].toLowerCase()??null
  const freshness=parseFreshness(text) as Freshness
  const freshnessMatch=/\b(fresh|frozen|chilled|either|not fussed|doesn'?t matter)\b/i.exec(text)
  const meat=Boolean(item&&/meat|chicken|beef|lamb|goat|poultry|veal|duck|turkey/i.test(item))
  const sentimentCue=stop?'stop':frustrated?'frustrated':timePressure?'time_pressure':'neutral'
  const missingFields=[...(!item?['item']:[]),...(!quantity?['quantity']:[]),...(!budget?['budget']:[]),...(!deadline?['deadline']:[]),...(!locationMatch?['deliveryLocation']:[]),...(paymentDays==null?['payment']:[]),...(depositBps==null?['deposit']:[]),...(meat&&halal===null?['halal']:[]),...(meat&&!cut?['cut']:[]),...(meat&&!freshness?['freshness']:[])]
  const evidence:NormalizedIntake['evidence']=[]
  if(itemMatch)evidence.push({field:'item',text:itemMatch[0]})
  if(quantity)evidence.push({field:'quantity',text:quantity.evidence})
  if(budget)evidence.push({field:'budgetCents',text:budget.evidence})
  if(paymentDays!=null)evidence.push({field:'paymentDays',text:text.match(/\b(?:net\s*)?(?:\d+|a|one|two|couple)?\s*(?:days?|weeks?|fortnight|month|cod|cash on delivery|due on delivery)\b/i)?.[0]??'payment terms stated'})
  if(depositBps!=null)evidence.push({field:'depositBps',text:text.match(/\b(?:no deposit|nothing[^,.]*upfront|\d+(?:\.\d+)?\s*%|(?:ten|twenty|twenty five|quarter|half)\s+(?:percent|upfront))\b/i)?.[0]??'deposit stated'})
  if(deadline)evidence.push({field:'deadline',text:deadlineEvidence})
  if(locationMatch)evidence.push({field:'deliveryLocation',text:locationMatch[0]})
  if(halalMatch)evidence.push({field:'halal',text:halalMatch[0]})
  if(cutMatch)evidence.push({field:'cut',text:cutMatch[0]})
  if(freshnessMatch)evidence.push({field:'freshness',text:freshnessMatch[0]})
  const cue=stop??timePressure??frustrated
  if(cue)evidence.push({field:'sentimentCue',text:cue[0]})
  return {
    source,summary:text.trim().slice(0,180),intent:stop?'opt_out':/\b(accept|confirm|go ahead|that's right|correct)\b/i.test(text)?'confirmation':/\b(offer|quote|price)\b/i.test(text)?'quote':'source',
    item,quantity:quantity?.quantity??null,unit:quantity?canonicalUnit(quantity.unit):null,budgetCents:budget?.cents??null,
    deadline,deliveryLocation:locationMatch?.[1]?.trim()??null,paymentDays,depositBps,
    halal,cut,freshness,sentimentCue,confidence:missingFields.length===0?1:Math.max(0,1-missingFields.length/7),missingFields,evidence,
  }
}
