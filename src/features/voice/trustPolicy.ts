export type ContactContext = {
  abnVerified: boolean
  authorised: boolean
  optedOut: boolean
  localHour: number
  attemptsToday: number
  callbackNumber: string
  businessName: string
}

export function checkContactPolicy(context: ContactContext) {
  const blockers: string[] = []
  if (!context.abnVerified) blockers.push('ABN verification is missing')
  if (!context.authorised) blockers.push('Owner authorisation is missing')
  if (context.optedOut) blockers.push('Supplier opted out')
  if (context.localHour < 9 || context.localHour >= 17) blockers.push('Outside 9 am to 5 pm supplier local time')
  if (context.attemptsToday >= 2) blockers.push('Daily attempt limit reached')
  if (!context.businessName.trim() || !context.callbackNumber.trim()) blockers.push('Caller identity or callback number is missing')
  return {allowed:blockers.length === 0,blockers}
}

export function trustedIntroduction(businessName: string, callbackNumber: string) {
  return `Hi, I’m Backfill, an AI procurement assistant calling on behalf of ${businessName}. This is a quote enquiry, not an order. You can ask me to stop at any time, or call ${callbackNumber} to verify the request.`
}

export function normalizeAustralianPhone(value:string) {
  const compact=value.replace(/[^\d+]/g,'')
  if(/^\+61[2-478]\d{8}$/.test(compact))return compact
  if(/^0[2-478]\d{8}$/.test(compact))return `+61${compact.slice(1)}`
  throw new Error('Use a valid Australian landline or mobile number.')
}

export function trustedProductIntroduction(input:{businessName:string;callbackNumber:string;product:string;quantity:number|string;unit:string;contactSource:string}) {
  return `Hi, I’m Backfill, an AI procurement assistant calling on behalf of ${input.businessName} about ${input.quantity} ${input.unit} of ${input.product}. Your details came from ${input.contactSource}. Is now a convenient time for a brief quote enquiry? I can email the request first. This is not an order. You can ask me to stop at any time or call ${input.callbackNumber} to verify us.`
}

export function outboundTrustPrompt(input:{businessName:string;callbackNumber:string;product:string;quantity:number|string;unit:string;deliveryLocation:string;deadline:string;maximumTotalCents:number;minimumPaymentDays:number;maximumDepositBps:number;maximumCounteroffers:number;allowSubstitutions:boolean}) {
  return `You are Backfill, an explicitly disclosed AI procurement assistant for ${input.businessName}. Seek a quote for ${input.quantity} ${input.unit} of ${input.product}, delivered to ${input.deliveryLocation} by ${input.deadline}. Keep the first call under two minutes. Ask if now is convenient and offer to email the brief. Do not use repeated scripted persuasion. Never invent stock, pricing, evidence, authority, or another supplier's quote. Never name another supplier. Maximum total is AUD ${(input.maximumTotalCents/100).toFixed(2)}, minimum payment terms are ${input.minimumPaymentDays} days, maximum deposit is ${(input.maximumDepositBps/100).toFixed(2)}%, and at most ${input.maximumCounteroffers} counteroffers are allowed. ${input.allowSubstitutions?'Record substitutions but do not accept them without owner review.':'Any substitution must be escalated without negotiation.'} If the supplier is frustrated, uncertain, asks to stop, or proposes unusual terms, politely end and escalate to a human. Read back the final quoted total, quantity, delivery, fees, deposit and payment terms. Clearly finish by saying no order has been placed. You cannot buy, accept, commit, or promise payment on this call. Verification callback: ${input.callbackNumber}.`
}
