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
