import { test, expect } from 'bun:test'
import { initialRequests, offers } from '../src/features/requests/data'
import { rankOffers, canPurchase, paymentChecks } from '../src/features/requests/ranking'
import { decidePostQuoteAction, parseSourcingMode } from '../src/features/requests/workflow'
const request = initialRequests[0]
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
test('automatic purchase requires stored mode and every deterministic offer check', () => {
  expect(canPurchase(offers[0],{...request,purchaseMode:'preauthorized'})).toBe(false)
  expect(canPurchase({...offers[0],abnVerified:true},{...request,purchaseMode:'confirm'})).toBe(false)
  expect(canPurchase({...offers[0],abnVerified:true},{...request,purchaseMode:'preauthorized'})).toBe(true)
  expect(canPurchase({...offers[0],abnVerified:true,depositPercent:25},{...request,purchaseMode:'preauthorized'})).toBe(false)
})
test('request buying profile changes the ranking trade-off',()=>{
  const value={...offers[0],id:'value',price:250,onTimeDeliveries:8,completedOrders:10,abnVerified:true}
  const reliable={...offers[0],id:'reliable',price:320,onTimeDeliveries:10,completedOrders:10,abnVerified:true}
  expect(rankOffers([value,reliable],{...request,buyingProfile:'general'})[0].offer.id).toBe('value')
  expect(rankOffers([value,reliable],{...request,buyingProfile:'hospitality'})[0].offer.id).toBe('reliable')
})
test('a live quote is not qualifying until supplier authorisation and ABN evidence are current',()=>{
  const live={...offers[0],live:true,abnVerified:false}
  const result=rankOffers([live],request)[0]
  expect(result.qualifies).toBe(false)
  expect(result.reasons).toContain('ABN current')
})
test('first-qualifying and comparison sourcing have distinct stopping rules', () => {
  expect(decidePostQuoteAction({sourcingMode:'first_qualifying',purchaseMode:'preauthorized',quoteQualifies:true,hasMoreSuppliers:true})).toBe('auto_purchase')
  expect(decidePostQuoteAction({sourcingMode:'first_qualifying',purchaseMode:'confirm',quoteQualifies:true,hasMoreSuppliers:true})).toBe('request_owner_approval')
  expect(decidePostQuoteAction({sourcingMode:'compare',purchaseMode:'confirm',quoteQualifies:true,hasMoreSuppliers:true})).toBe('continue_sourcing')
  expect(decidePostQuoteAction({sourcingMode:'compare',purchaseMode:'confirm',quoteQualifies:true,hasMoreSuppliers:false})).toBe('request_owner_selection')
  expect(decidePostQuoteAction({sourcingMode:'first_qualifying',purchaseMode:'preauthorized',quoteQualifies:false,hasMoreSuppliers:false})).toBe('review_no_match')
})
test('natural sourcing instructions select the requested workflow and respect corrections', () => {
  expect(parseSourcingMode('shop around and find me the best price')).toBe('compare')
  expect(parseSourcingMode('just buy from the first supplier that meets everything')).toBe('first_qualifying')
  expect(parseSourcingMode('compare them—actually, just sort it with the first supplier that works')).toBe('first_qualifying')
  expect(parseSourcingMode('I need 30 kg of chicken')).toBeNull()
})
