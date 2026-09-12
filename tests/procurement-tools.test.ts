import { test, expect } from 'bun:test'
import { checkAbn, eligibleForAuthorisation, prepareSupplier } from '../src/features/suppliers/verification'
import { calculateQuote, formatCents } from '../src/features/negotiation/calculator'
import { assessConversation } from '../src/features/negotiation/signals'
const input={quantity:'30',unitPrice:'10.50',discount:'0',delivery:'0',fees:'0',taxRate:'0',deposit:'0',budget:'350'}
test('ABR checksum rejects malformed values and invalid leading digits',()=>{
 expect(checkAbn('51 824 753 556')).toBe(true)
 expect(checkAbn('51824753557')).toBe(false)
 expect(checkAbn('ABN51824753556')).toBe(false)
 expect(checkAbn('00000000000')).toBe(false)
})
test('imports remain unauthorised and reject duplicate ABNs',()=>{
 const supplier=prepareSupplier('Example','51 824 753 556','03 9000 0000',[])
 expect(supplier.authorised).toBe(false)
 expect(()=>prepareSupplier('Other','51824753556','03 9000 0000',[supplier])).toThrow('already')
 expect(eligibleForAuthorisation()).toBe(false)
 expect(eligibleForAuthorisation({source:'ABR',active:true,legalName:'Example',checkedAt:'2000-01-01',nameMatched:true,contactConfirmed:true})).toBe(false)
})
test('quote maths keeps cents exact and reconciles deposit with balance',()=>{
 const result=calculateQuote({...input,quantity:'3',unitPrice:'0.10',deposit:'33.33'})
 expect(result.total).toBe(30n)
 expect(result.deposit+result.balance).toBe(result.total)
 expect(formatCents(result.total)).toBe('$0.30')
})
test('fees tax and discounts are included in budget comparison',()=>{
 const result=calculateQuote({...input,discount:'10',delivery:'20',fees:'10',taxRate:'10',deposit:'25',budget:'340'})
 expect(result.discount).toBe(3150n)
 expect(result.total).toBe(34485n)
 expect(result.withinBudget).toBe(false)
 expect(result.headroom).toBe(-485n)
})
test('invalid numbers and percentages fail closed',()=>{
 expect(()=>calculateQuote({...input,quantity:'0'})).toThrow()
 expect(()=>calculateQuote({...input,discount:'101'})).toThrow()
 expect(()=>calculateQuote({...input,fees:'-2'})).toThrow()
 expect(()=>calculateQuote({...input,unitPrice:'NaN'})).toThrow()
})
test('stop requests override other cues and repeated offers stop bargaining',()=>{
 expect(assessConversation('Happy to help but do not call again').action).toBe('stop')
 expect(assessConversation('I am busy, make it quick').action).toBe('shorten')
 expect(assessConversation('This is our final offer').action).toBe('confirm')
 expect(assessConversation('The total is $315',2).action).toBe('confirm')
 expect(assessConversation('The total is $315').tone).toBe('No clear sentiment cue')
})
