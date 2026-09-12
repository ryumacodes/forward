import { type Offer, type Recovery, validateOffer } from './data'
export const paymentLabel = (days: number) => days === 0 ? 'Due on delivery' : `Net ${days} from invoice`
export function paymentChecks(offer: Offer, request: Recovery) {
  return {
    'Payment period': offer.termsConfirmed && offer.paymentDays >= (request.minimumPaymentDays ?? 0),
    'Deposit limit': offer.termsConfirmed && offer.depositPercent <= (request.maximumDepositPercent ?? 0),
    'Total with fees': offer.price + offer.fees <= request.budget,
  }
}
export function canPurchase(offer: Offer, request: Recovery) {
  return request.purchaseMode === 'preauthorised' && offer.authorised && offer.abnVerified &&
    Object.values({...validateOffer(offer, request), ...paymentChecks(offer, request)}).every(Boolean)
}
export function rankOffers(offers: Offer[], request: Recovery) {
  return offers.map(offer => {
    const checks = {...validateOffer(offer, request), ...paymentChecks(offer, request)}
    const reasons = Object.entries(checks).filter(([,pass]) => !pass).map(([label]) => label)
    const reliability = offer.completedOrders > 0 ? offer.onTimeDeliveries / offer.completedOrders : 0
    const price = Math.max(0, Math.min(1, 1 - (offer.price + offer.fees) / request.budget))
    const terms = Math.max(0, Math.min(1, offer.paymentDays / 30))
    const score = Math.round((price * 40) + (reliability * 35) + (terms * 25))
    return {offer, reasons, score, qualifies: reasons.length === 0 && offer.authorised, reliability}
  }).sort((a,b) => Number(b.qualifies) - Number(a.qualifies) || b.score - a.score || a.offer.id.localeCompare(b.offer.id))
}
