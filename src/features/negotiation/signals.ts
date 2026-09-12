export function assessConversation(text: string, counters = 0) {
  const stop = /\b(stop calling|do not call|don't call|not interested|end (the )?call|leave me alone)\b/i.exec(text)
  const time = /\b(i(?:'m| am) busy|in a rush|hurry|make it quick|only have (?:a |one |two |\d+ )?minute|call (?:me )?(?:back|later))\b/i.exec(text)
  const frustration = /\b(frustrat\w*|annoy\w*|already told you|asked (?:me )?(?:that|this) already|repeat myself)\b/i.exec(text)
  const boundary = /\b(final (?:price|offer)|best (?:price|offer)|can(?:not|'t) (?:go|do) (?:any )?lower|no (?:more )?discount)\b/i.exec(text)
  const open = /\b(happy to|let(?:'s| us) work|can offer|could offer|we can do)\b/i.exec(text)
  const evidence = [stop,time,frustration,boundary,open].filter(Boolean).map(m => m![0])
  if (stop) return {tone:'Explicit request to stop',pace:'End the conversation',action:'stop',evidence,response:'Understood. I’ll end the call and record that you do not want further contact.'}
  if (time || frustration) return {tone:frustration ? 'Possible frustration' : 'Time pressure stated',pace:'Keep it brief',action:'shorten',evidence,response:'Understood. I’ll keep this brief. Would you prefer one final summary, or should we arrange a better time?'}
  if (boundary || counters >= 2) return {tone:boundary ? 'Price boundary stated' : 'Counteroffer limit reached',pace:'Stop bargaining',action:'confirm',evidence,response:'Thanks. I’ll record those as your final terms and check them with the owner. No order is placed yet.'}
  return {tone:open ? 'Possible openness' : 'No clear sentiment cue',pace:'Normal pace',action:'clarify',evidence,response:'Can you confirm the total including all fees, delivery time, payment period, and any deposit?'}
}
