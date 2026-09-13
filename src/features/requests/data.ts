import type { DiscoveryProfileId } from '../discovery/engine'

export type ProcurementRequest = { id: string; item: string; quantity: number; unit: string; budget: number; deadline: string; location: string; status: 'Needs approval' | 'Calling suppliers' | 'Ready to source' | 'Approved'; category: string; brief?: string; purchaseMode?: 'confirm'|'preauthorized'; buyingProfile?: DiscoveryProfileId; confirmationChannel?: string; minimumPaymentDays?: number; maximumDepositPercent?: number; requiresHalal?: boolean; cut?: string; freshness?: 'fresh'|'frozen'|'either' }
export type Offer = { id: string; name: string; initials: string; item?: string; quantity: number; price: number; delivery: string; onTime: boolean; exact: boolean; minutes: string; paymentDays: number; depositPercent: number; fees: number; originalPaymentDays: number; onTimeDeliveries: number; completedOrders: number; authorised: boolean; abnVerified: boolean; termsConfirmed: boolean; requestId?: string; transcript?: {role:'agent'|'user';message:string}[]; live?: boolean; manuallyAdded?: boolean; supplierContact?: { abn: string; contactName?: string; phone: string; email?: string; source: string; note?: string } }

function localDateTime(now: Date, dayOffset: number, hour: number, minute = 0) {
  const value = new Date(now)
  value.setDate(value.getDate() + dayOffset)
  value.setHours(hour, minute, 0, 0)
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
}

function deliveryLabel(value: string) {
  const date = new Date(value)
  const day = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
  const time = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(date)
  return `${day} · ${time}`
}

export function createDemoSeed(now = new Date()): { requests: ProcurementRequest[]; offers: Offer[] } {
  const primaryDeadline = localDateTime(now, 1, 8)
  const packagingDeadline = localDateTime(now, 2, 9)
  const approvedDeadline = localDateTime(now, -1, 16)
  const victorianDelivery = localDateTime(now, 1, 7)
  const freshDelivery = localDateTime(now, 1, 7, 30)
  const metroDelivery = localDateTime(now, 2, 9)
  return {
    requests: [
      { id: 'REQ-024', item: 'Chicken breast', quantity: 30, unit: 'kg', budget: 350, deadline: primaryDeadline, location: '24 Flinders Lane, Melbourne', status: 'Needs approval', category: 'Poultry · Fresh produce', minimumPaymentDays: 14, maximumDepositPercent: 0 },
      { id: 'REQ-023', item: 'Takeaway containers', quantity: 500, unit: 'units', budget: 180, deadline: packagingDeadline, location: '24 Flinders Lane, Melbourne', status: 'Calling suppliers', category: 'Packaging' },
      { id: 'REQ-022', item: 'Extra virgin olive oil', quantity: 20, unit: 'L', budget: 260, deadline: approvedDeadline, location: '24 Flinders Lane, Melbourne', status: 'Approved', category: 'Pantry' },
    ],
    offers: [
      { id: 'victorian', name: 'Victorian Foods', initials: 'VF', quantity: 30, price: 315, delivery: deliveryLabel(victorianDelivery), onTime: true, exact: true, minutes: '1m 12s', paymentDays: 14, originalPaymentDays: 0, depositPercent: 0, fees: 0, onTimeDeliveries: 18, completedOrders: 20, authorised: true, abnVerified: false, termsConfirmed: true },
      { id: 'fresh', name: 'FreshFoods Wholesale', initials: 'FW', quantity: 20, price: 196, delivery: deliveryLabel(freshDelivery), onTime: true, exact: true, minutes: '54s', paymentDays: 7, originalPaymentDays: 0, depositPercent: 25, fees: 0, onTimeDeliveries: 7, completedOrders: 10, authorised: true, abnVerified: false, termsConfirmed: true },
      { id: 'metro', name: 'Metro Poultry', initials: 'MP', quantity: 30, price: 300, delivery: deliveryLabel(metroDelivery), onTime: false, exact: true, minutes: '1m 06s', paymentDays: 30, originalPaymentDays: 14, depositPercent: 0, fees: 12, onTimeDeliveries: 8, completedOrders: 10, authorised: true, abnVerified: false, termsConfirmed: true },
    ],
  }
}

const demoSeed = createDemoSeed()
export const initialRequests = demoSeed.requests
export const offers = demoSeed.offers
export function validateOffer(offer: Offer, request: ProcurementRequest) {
  return { Product: offer.exact, Quantity: offer.quantity >= request.quantity, Budget: offer.price <= request.budget, Deadline: offer.onTime }
}
export const money = (value: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)
