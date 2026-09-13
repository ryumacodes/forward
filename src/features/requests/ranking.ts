import { type Offer, type ProcurementRequest, validateOffer } from './data'
export const paymentLabel = (days: number) => days === 0 ? 'Due on delivery' : `Net ${days} from invoice`
export function paymentChecks(offer: Offer, request: ProcurementRequest) {
  return {
    'Payment period': offer.termsConfirmed && offer.paymentDays >= (request.minimumPaymentDays ?? 0),
    'Deposit limit': offer.termsConfirmed && offer.depositPercent <= (request.maximumDepositPercent ?? 0),
    'Total with fees': offer.price + offer.fees <= request.budget,
  }
}
export function canPurchase(offer: Offer, request: ProcurementRequest) {
  const checks={...validateOffer(offer,request),...paymentChecks(offer,request)}
  return request.purchaseMode==='preauthorized'&&offer.authorised&&offer.abnVerified&&offer.termsConfirmed&&Object.values(checks).every(Boolean)
}
export function offerRankingWeights(request:ProcurementRequest){return request.buyingProfile==='construction'?{price:35,reliability:45,terms:20}:request.buyingProfile==='hospitality'?{price:35,reliability:40,terms:25}:{price:40,reliability:35,terms:25}}
export function rankOffers(offers: Offer[], request: ProcurementRequest) {
  const weights=offerRankingWeights(request)
  return offers.map(offer => {
    const liveChecks=offer.live?{'Supplier authorised':offer.authorised,'ABN current':offer.abnVerified}:{}
    const checks = {...validateOffer(offer, request), ...paymentChecks(offer, request),...liveChecks}
    const reasons = Object.entries(checks).filter(([,pass]) => !pass).map(([label]) => label)
    const reliability = offer.completedOrders > 0 ? offer.onTimeDeliveries / offer.completedOrders : 0
    const price = Math.max(0, Math.min(1, 1 - (offer.price + offer.fees) / request.budget))
    const terms = Math.max(0, Math.min(1, offer.paymentDays / 30))
    const score = Math.round((price * weights.price) + (reliability * weights.reliability) + (terms * weights.terms))
    return {offer, reasons, score, qualifies: reasons.length === 0 && offer.authorised, reliability}
  }).sort((a,b) => Number(b.qualifies) - Number(a.qualifies) || b.score - a.score || a.offer.id.localeCompare(b.offer.id))
}
