export type QuoteInput = {quantity: string; unitPrice: string; discount: string; delivery: string; fees: string; taxRate: string; deposit: string; budget: string}
function fixed(value: string, places: number) {
  if (!new RegExp(`^\\d{1,9}(?:\\.\\d{1,${places}})?$`).test(value)) throw new Error(`Enter a non-negative number with up to ${places} decimal places.`)
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'))
}
const rounded = (n: bigint, divisor: bigint) => (n + divisor/2n) / divisor
export function calculateQuote(input: QuoteInput) {
  const quantity = fixed(input.quantity,3), unit = fixed(input.unitPrice,2)
  const discount = fixed(input.discount,2), taxRate = fixed(input.taxRate,2), depositRate = fixed(input.deposit,2)
  if (quantity === 0n) throw new Error('Quantity must be greater than zero.')
  if ([discount,taxRate,depositRate].some(n => n > 10000n)) throw new Error('Percentages must be between 0 and 100.')
  const subtotal = rounded(quantity * unit,1000n)
  const discountCents = rounded(subtotal * discount,10000n)
  const base = subtotal - discountCents + fixed(input.delivery,2) + fixed(input.fees,2)
  const tax = rounded(base * taxRate,10000n)
  const total = base + tax
  const deposit = rounded(total * depositRate,10000n)
  const headroom = fixed(input.budget,2) - total
  return {subtotal,discount:discountCents,tax,total,deposit,balance:total-deposit,headroom,withinBudget:headroom >= 0n}
}
export function formatCents(value: bigint) {
  const sign = value < 0n ? '−' : ''
  const absolute = value < 0n ? -value : value
  return `${sign}$${(absolute/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${(absolute%100n).toString().padStart(2,'0')}`
}
