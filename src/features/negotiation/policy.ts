export type NegotiationPolicy = {
  maximumTotalCents: bigint
  minimumPaymentDays: number
  maximumDepositBps: number
  maximumCounteroffers: number
  allowSubstitutions: boolean
  allowAnonymousMarketAnchor: boolean
  autoPurchase: boolean
}

export type NegotiationProposal = {
  totalCents: bigint
  paymentDays: number
  depositBps: number
  counteroffersMade: number
  isSubstitution: boolean
  termsConfirmed: boolean
  supplierAskedToStop?: boolean
}

export type NegotiationDecision = {action:'accept'|'counter'|'escalate'|'stop'; reasons:string[]; canMentionMarketPrice:boolean}

export function evaluateNegotiation(policy: NegotiationPolicy, proposal: NegotiationProposal): NegotiationDecision {
  if (proposal.supplierAskedToStop) return {action:'stop',reasons:['Supplier asked to end contact'],canMentionMarketPrice:false}
  const reasons: string[] = []
  if (proposal.totalCents > policy.maximumTotalCents) reasons.push('Total exceeds the approved budget')
  if (proposal.paymentDays < policy.minimumPaymentDays) reasons.push(`Payment terms are shorter than ${policy.minimumPaymentDays} days`)
  if (proposal.depositBps > policy.maximumDepositBps) reasons.push('Deposit exceeds the approved limit')
  if (proposal.isSubstitution && !policy.allowSubstitutions) reasons.push('Substitution needs owner approval')
  if (!proposal.termsConfirmed) reasons.push('Fees and final terms are not confirmed')
  const canMentionMarketPrice = policy.allowAnonymousMarketAnchor
  if (reasons.length === 0) return {action:policy.autoPurchase ? 'accept' : 'escalate',reasons:policy.autoPurchase ? ['All purchase rules passed'] : ['Offer fits the rules and needs owner approval'],canMentionMarketPrice}
  if (proposal.counteroffersMade >= policy.maximumCounteroffers || proposal.isSubstitution) return {action:'escalate',reasons,canMentionMarketPrice}
  return {action:'counter',reasons,canMentionMarketPrice}
}

export const defaultNegotiationPolicy: NegotiationPolicy = {
  maximumTotalCents: 35_000n,
  minimumPaymentDays: 14,
  maximumDepositBps: 0,
  maximumCounteroffers: 2,
  allowSubstitutions: false,
  allowAnonymousMarketAnchor: true,
  autoPurchase: false,
}
