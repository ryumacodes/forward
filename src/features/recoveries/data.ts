export type Recovery = { id: string; item: string; quantity: number; unit: string; budget: number; deadline: string; location: string; status: 'Needs approval' | 'Calling suppliers' | 'Ready to source' | 'Approved'; category: string; brief?: string; purchaseMode?: string; confirmationChannel?: string; minimumPaymentDays?: number; maximumDepositPercent?: number }
export type Offer = { id: string; name: string; initials: string; quantity: number; price: number; delivery: string; onTime: boolean; exact: boolean; minutes: string; paymentDays: number; depositPercent: number; fees: number; originalPaymentDays: number; onTimeDeliveries: number; completedOrders: number; authorised: boolean; abnVerified: boolean; termsConfirmed: boolean }
export const initialRecoveries: Recovery[] = [
  { id: 'REC-024', item: 'Chicken breast', quantity: 30, unit: 'kg', budget: 350, deadline: '2026-09-13T08:00', location: '24 Flinders Lane, Melbourne', status: 'Needs approval', category: 'Poultry · Fresh produce', minimumPaymentDays: 14, maximumDepositPercent: 0 },
  { id: 'REC-023', item: 'Takeaway containers', quantity: 500, unit: 'units', budget: 180, deadline: '2026-09-14T09:00', location: '24 Flinders Lane, Melbourne', status: 'Calling suppliers', category: 'Packaging' },
  { id: 'REC-022', item: 'Extra virgin olive oil', quantity: 20, unit: 'L', budget: 260, deadline: '2026-09-12T16:00', location: '24 Flinders Lane, Melbourne', status: 'Approved', category: 'Pantry' },
]
export const offers: Offer[] = [
  { id: 'victorian', name: 'Victorian Foods', initials: 'VF', quantity: 30, price: 315, delivery: 'Sun, 13 Sep · 7:00 am', onTime: true, exact: true, minutes: '1m 12s', paymentDays: 14, originalPaymentDays: 0, depositPercent: 0, fees: 0, onTimeDeliveries: 18, completedOrders: 20, authorised: true, abnVerified: false, termsConfirmed: true },
  { id: 'fresh', name: 'FreshFoods Wholesale', initials: 'FW', quantity: 20, price: 196, delivery: 'Sun, 13 Sep · 7:30 am', onTime: true, exact: true, minutes: '54s', paymentDays: 7, originalPaymentDays: 0, depositPercent: 25, fees: 0, onTimeDeliveries: 7, completedOrders: 10, authorised: true, abnVerified: false, termsConfirmed: true },
  { id: 'metro', name: 'Metro Poultry', initials: 'MP', quantity: 30, price: 300, delivery: 'Mon, 14 Sep · 9:00 am', onTime: false, exact: true, minutes: '1m 06s', paymentDays: 30, originalPaymentDays: 14, depositPercent: 0, fees: 12, onTimeDeliveries: 8, completedOrders: 10, authorised: true, abnVerified: false, termsConfirmed: true },
]
export function validateOffer(offer: Offer, request: Recovery) {
  return { Product: offer.exact, Quantity: offer.quantity >= request.quantity, Budget: offer.price <= request.budget, Deadline: offer.onTime }
}
export const money = (value: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)
