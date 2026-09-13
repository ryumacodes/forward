import { test, expect } from 'bun:test'
import { initialRecoveries, offers } from '../src/features/recoveries/data'
import { rankOffers, canPurchase, paymentChecks } from '../src/features/recoveries/ranking'
const request = initialRecoveries[0]
test('late and partial offers cannot outrank a qualifying offer', () => {
  const ranked = rankOffers(offers, request)
  expect(ranked[0].offer.id).toBe('victorian')
  expect(ranked.filter(r => r.qualifies)).toHaveLength(1)
})
test('fees and deposits outside limits fail even when base price fits', () => {
  const checks = paymentChecks({...offers[0],fees:50,depositPercent:25},request)
  expect(checks['Total with fees']).toBe(false)
  expect(checks['Deposit limit']).toBe(false)
})
test('unknown terms cannot be treated as agreed terms', () => {
  expect(paymentChecks({...offers[0],termsConfirmed:false},request)['Payment period']).toBe(false)
})
test('purchase never bypasses explicit owner approval', () => {
  expect(canPurchase(offers[0],{...request,purchaseMode:'preauthorised'})).toBe(false)
  expect(canPurchase({...offers[0],abnVerified:true},{...request,purchaseMode:'confirm'})).toBe(false)
  expect(canPurchase({...offers[0],abnVerified:true},{...request,purchaseMode:'preauthorised'})).toBe(false)
  expect(canPurchase({...offers[0],abnVerified:true,depositPercent:25},{...request,purchaseMode:'preauthorised'})).toBe(false)
})
