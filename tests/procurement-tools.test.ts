import { test, expect } from 'bun:test'
import { checkAbn, eligibleForAuthorisation, prepareSupplier } from '../src/features/suppliers/verification'
import { calculateQuote, formatCents } from '../src/features/negotiation/calculator'
import { assessConversation } from '../src/features/negotiation/signals'
import { defaultNegotiationPolicy, evaluateNegotiation } from '../src/features/negotiation/policy'
import { checkContactPolicy, normalizeAustralianPhone, outboundTrustPrompt, trustedProductIntroduction } from '../src/features/voice/trustPolicy'
import { demoCandidates, discoveryProfiles, rankCandidates } from '../src/features/discovery/engine'
import { previewNormalize } from '../src/features/intake/schema'
import { clarifyQuestions, applyResponse, confirmIntake } from '../src/features/intake/clarify'
import { intakeClientTools } from '../src/features/intake/agentTools'
import { supplierLeads } from '../src/data/supplierLeads'
import { businessNameMatches, parseAbrJsonp, toAbrVerification } from '../src/features/suppliers/abr'
import { cosineSimilarity, extractVisibleText, isPotentiallyPublicUrl, uniquePublicSources } from '../src/features/discovery/evidence'
import { supplierRequestedNoContact, supplierTranscript, transcriptText, verifyElevenLabsSignature } from '../src/features/voice/webhook'
import { canPurchase } from '../src/features/recoveries/ranking'
import { checkSupplies, allSupplyLeads } from '../src/features/supplycheck/engine'
import { createDemoSeed } from '../src/features/recoveries/data'
const input={quantity:'30',unitPrice:'10.50',discount:'0',delivery:'0',fees:'0',taxRate:'0',deposit:'0',budget:'350'}
test('ABR checksum rejects malformed values and invalid leading digits',()=>{
 expect(checkAbn('51 824 753 556')).toBe(true)
 expect(checkAbn('51824753557')).toBe(false)
 expect(checkAbn('ABN51824753556')).toBe(false)
 expect(checkAbn('00000000000')).toBe(false)
})
test('imports remain unauthorised and reject duplicate ABNs',()=>{
 const supplier=prepareSupplier('Example','51 824 753 556','03 9000 0000',[],'orders@example.com')
 expect(supplier.authorised).toBe(false)
 expect(supplier.email).toBe('orders@example.com')
 expect(()=>prepareSupplier('Other','11 111 111 111','03 9000 0000',[],'not-an-email')).toThrow()
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
test('supplier discovery applies hard gates before weighted ranking',()=>{
 const results=rankCandidates(demoCandidates,discoveryProfiles[0])
 expect(results[0].candidate.name).toBe('Southbank Produce Co')
 expect(results.at(-1)?.eligible).toBe(false)
 expect(results.at(-1)?.blockers.join(' ')).toContain('authorised')
})
test('negotiation bounds counter then escalate and never override a stop',()=>{
 const base={totalCents:36000n,paymentDays:7,depositBps:1000,counteroffersMade:0,isSubstitution:false,termsConfirmed:true}
 expect(evaluateNegotiation(defaultNegotiationPolicy,base).action).toBe('counter')
 expect(evaluateNegotiation(defaultNegotiationPolicy,{...base,counteroffersMade:2}).action).toBe('escalate')
 expect(evaluateNegotiation(defaultNegotiationPolicy,{...base,supplierAskedToStop:true}).action).toBe('stop')
})
test('a qualifying quote still requires an explicit owner purchase action',()=>{
 const request={id:'REC-1',item:'Chicken',quantity:30,unit:'kg',budget:350,deadline:'2026-09-13T08:00',location:'Melbourne',status:'Needs approval' as const,category:'Food',purchaseMode:'preauthorised',minimumPaymentDays:14,maximumDepositPercent:0}
 const offer={id:'Q-1',name:'Supplier',initials:'S',quantity:30,price:315,delivery:'2026-09-13T07:00',onTime:true,exact:true,minutes:'1m',paymentDays:14,depositPercent:0,fees:0,originalPaymentDays:0,onTimeDeliveries:10,completedOrders:10,authorised:true,abnVerified:true,termsConfirmed:true}
 expect(canPurchase(offer,request)).toBe(false)
})
test('contact policy blocks unverified, repeated and out-of-hours calls',()=>{
 const result=checkContactPolicy({abnVerified:false,authorised:true,optedOut:false,localHour:18,attemptsToday:2,businessName:'Cafe',callbackNumber:'03 9000 0000'})
 expect(result.allowed).toBe(false)
 expect(result.blockers).toHaveLength(3)
})
test('outbound call context uses Australian caller identity and supplier-trust language',()=>{
 expect(normalizeAustralianPhone('03 9000 0000')).toBe('+61390000000')
 expect(normalizeAustralianPhone('+61 412 345 678')).toBe('+61412345678')
 expect(()=>normalizeAustralianPhone('+1 555 123 4567')).toThrow('Australian')
 const opening=trustedProductIntroduction({businessName:'Flinders Kitchen',callbackNumber:'03 9000 0000',product:'chicken breast',quantity:30,unit:'kg',contactSource:'the owner supplier record'})
 expect(opening).toContain('AI procurement assistant')
 expect(opening).toContain('chicken breast')
 expect(opening).toContain('convenient time')
 expect(opening).toContain('email the request first')
 const prompt=outboundTrustPrompt({businessName:'Flinders Kitchen',callbackNumber:'03 9000 0000',product:'chicken',quantity:30,unit:'kg',deliveryLocation:'Melbourne',deadline:'tomorrow',maximumTotalCents:35000,minimumPaymentDays:14,maximumDepositBps:0,maximumCounteroffers:2,allowSubstitutions:false})
 expect(prompt).toContain('under two minutes')
 expect(prompt).toContain('no order has been placed')
 expect(prompt).toContain('cannot buy, accept, commit')
})
test('all intake channels normalize to the same fields with evidence',()=>{
 const result=previewNormalize('email','Need 30 kg of chicken breast, budget up to $350. Please quote net 14 days.')
 expect(result.item).toBe('chicken breast')
 expect(result.quantity).toBe(30)
 expect(result.budgetCents).toBe(35000)
 expect(result.paymentDays).toBe(14)
 expect(result.evidence.length).toBeGreaterThan(2)
})
test('intake preview resolves relative deadlines and delivery evidence',()=>{
 const result=previewNormalize('voice_note','Need 30 kilos of chicken breast tomorrow before 8 am, max $350, delivered to 24 Flinders Lane, Melbourne.',new Date('2026-09-12T10:00:00+10:00'))
 expect(result.item).toBe('chicken breast')
 expect(result.unit).toBe('kg')
 expect(result.deadline).toBe('2026-09-13T08:00')
 expect(result.deliveryLocation).toBe('24 Flinders Lane, Melbourne')
 expect(result.missingFields).toContain('halal')
 expect(result.missingFields).toContain('freshness')
})
test('intake preview keeps delivery clauses out of the product name',()=>{
 const result=previewNormalize('voice_note','I need 30 kilos of fresh halal chicken breast fillets delivered to 24 Flinders Lane Melbourne tomorrow before 8 am, maximum $350, net 14 and no deposit.',new Date(2026,8,13,10))
 expect(result.item).toBe('fresh halal chicken breast fillets')
 expect(result.deliveryLocation).toBe('24 Flinders Lane Melbourne')
 expect(result.deadline).toBe('2026-09-14T08:00')
})
test('demo recovery deadlines and supplier deliveries stay relative to one clock',()=>{
 const seed=createDemoSeed(new Date(2026,8,13,10))
 expect(seed.recoveries[0].deadline).toBe('2026-09-14T08:00')
 expect(seed.recoveries[1].deadline).toBe('2026-09-15T09:00')
 expect(seed.recoveries[2].deadline).toBe('2026-09-12T16:00')
 expect(seed.offers[0].delivery).toContain('14')
 expect(seed.offers[0].delivery).toContain('7:00 am')
 expect(seed.offers[2].delivery).toContain('15')
})
test('spoken request extracts item, quantity, budget, and deadline',()=>{
 const result=previewNormalize('voice_call','I want 30 kg chicken by 8pm sunday for 500$ or less')
 expect(result.item).toBe('chicken')
 expect(result.quantity).toBe(30)
 expect(result.budgetCents).toBe(50000)
 expect(result.deadline).toContain('Sunday')
 expect(result.deadline).toContain('8pm')
 expect(result.missingFields).toContain('halal')
 expect(result.missingFields).toContain('cut')
 expect(result.missingFields).toContain('freshness')
})
test('clarify pipeline asks halal then cut once quantity is known',()=>{
 const first=previewNormalize('voice_call','I want 30 kg chicken by 8pm sunday for 500$ or less')
 const questions=clarifyQuestions(first)
 expect(questions[0].field).toBe('halal')
 expect(questions[0].prompt.toLowerCase()).toContain('halal')
 const second=applyResponse(first,'halal','Yes, halal is important')
 expect(second.halal).toBe(true)
 expect(second.missingFields).not.toContain('halal')
 const third=applyResponse(second,'cut','Whole chicken, please')
 expect(third.cut).toBe('whole')
 expect(third.missingFields).not.toContain('cut')
})
test('confirmation recaps every captured detail before extraction',()=>{
 let intake=previewNormalize('voice_call','I want 30 kg chicken by 8pm sunday for 500$ or less')
 intake=applyResponse(intake,'halal','Yes halal')
 intake=applyResponse(intake,'cut','whole')
 intake=applyResponse(intake,'freshness','frozen')
 const script=confirmIntake(intake)
 expect(script).toContain('30 kg')
 expect(script).toContain('8pm')
 expect(script).toContain('$500')
 expect(script).toContain('halal')
 expect(script).toContain('whole')
 expect(script).toContain('frozen')
 expect(script).toContain('Is that right')
 expect(intake.missingFields).toHaveLength(0)
})
test('intake client tool returns next question then a confirmation script',()=>{
 const first=JSON.parse(intakeClientTools.clarify_intake_details({item:'chicken',quantity:30,unit:'kg'}))
 expect(first.ok).toBe(true)
 expect(first.allClear).toBe(false)
 expect(first.askNext.field).toBe('halal')
 const answered=JSON.parse(intakeClientTools.apply_intake_answer({intake:{item:'chicken',quantity:30,unit:'kg'},field:'halal',response:'Yes, halal'}))
 expect(answered.ok).toBe(true)
 expect(answered.missingFields).toContain('cut')
})
test('scraped supplier leads have valid active-ABN evidence and remain unauthorised',()=>{
 expect(supplierLeads.length).toBeGreaterThanOrEqual(8)
 for (const lead of supplierLeads) {
  expect(checkAbn(lead.abn)).toBe(true)
  expect(lead.abnEvidenceUrl).toStartWith('https://abr.business.gov.au/')
 }
})
test('ABR JSONP becomes conservative, attributable verification evidence',()=>{
 const record=parseAbrJsonp('backfill({"Abn":"51824753556","AbnStatus":"Active","EntityName":"Example Foods Pty Ltd","BusinessName":["Example Foods"],"Gst":"2000-07-01","AddressState":"VIC","AddressPostcode":"3000","Message":""})')
 const result=toAbrVerification(record,'Example Foods','2026-09-12T09:00:00.000Z')
 expect(result.active).toBe(true)
 expect(result.nameMatched).toBe(true)
 expect(result.gstRegistered).toBe(true)
 expect(result.source).toBe('ABR')
 expect(result.evidenceUrl).toContain('51824753556')
})
test('ABR name matching fails closed for unrelated businesses',()=>{
 expect(businessNameMatches('Harbour Produce','Completely Different Holdings Pty Ltd',['Different Trading Name'])).toBe(false)
 expect(()=>toAbrVerification({Message:'Authentication GUID is not recognised'},'Example')).toThrow('GUID')
})
test('supplier evidence extraction rejects SSRF targets and removes active markup',()=>{
 expect(isPotentiallyPublicUrl('https://supplier.example/products')).toBe(true)
 expect(isPotentiallyPublicUrl('http://supplier.example/products')).toBe(false)
 expect(isPotentiallyPublicUrl('https://127.0.0.1/admin')).toBe(false)
 expect(isPotentiallyPublicUrl('https://localhost/admin')).toBe(false)
 expect(extractVisibleText('<style>secret</style><h1>Chicken &amp; produce</h1><script>alert(1)</script>')).toBe('Chicken & produce')
 expect(uniquePublicSources([{url:'https://supplier.example/',title:'A'},{url:'https://supplier.example/',title:'B'}])).toHaveLength(1)
})
test('semantic similarity is deterministic and fails closed on dimension mismatch',()=>{
 expect(cosineSimilarity([1,0],[1,0])).toBe(1)
 expect(cosineSimilarity([1,0],[0,1])).toBe(0)
 expect(cosineSimilarity([1],[1,0])).toBe(0)
})
test('ElevenLabs webhooks require a fresh valid HMAC and preserve speaker evidence',async()=>{
 const body=JSON.stringify({type:'post_call_transcription'}),secret='webhook-secret',timestamp=1_799_712_000
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${body}`))
 const signature=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')
 expect(await verifyElevenLabsSignature(body,`t=${timestamp},v0=${signature}`,secret,timestamp)).toBe(true)
 expect(await verifyElevenLabsSignature(`${body} `,`t=${timestamp},v0=${signature}`,secret,timestamp)).toBe(false)
 expect(await verifyElevenLabsSignature(body,`t=${timestamp},v0=${signature}`,secret,timestamp+1801)).toBe(false)
 const turns=[{role:'agent' as const,message:'Can you quote?'},{role:'user' as const,message:'The total is $315. Please do not call us again.'}]
 expect(transcriptText(turns)).toContain('SUPPLIER: The total is $315')
 expect(supplierTranscript(turns)).not.toContain('Can you quote')
 expect(supplierRequestedNoContact(supplierTranscript(turns))).toBe(true)
})
test('supply check ranks halal suppliers and attaches websites when halal is required',()=>{
 const results=checkSupplies({item:'chicken breast fillets', quantity:30, unit:'kg', requiresHalal:true}, allSupplyLeads())
 expect(results.length).toBeGreaterThan(0)
 for (const result of results) {
  expect(result.lead.halal).toBe(true)
  expect(result.lead.website).toStartWith('https://')
 }
 for (const result of results) {
  if (result.matchScore === 0) continue
  expect(result.supplyPages.length).toBeGreaterThan(0)
  expect(result.callBrief).toContain(result.lead.phone)
 }
})
test('halal-supply check scores poultry specialists above broadline distributors',()=>{
 const results=checkSupplies({item:'whole halal chicken', requiresHalal:true})
 expect(results[0].matchScore).toBeGreaterThanOrEqual(results[1].matchScore)
 const top=results[0]
 expect(top.lead.id).toBeOneOf(['poultry-n-more','halal-madina','halal-map-food-services','halal-mfd-food','halal-eastern-halal','halal-al-abrar','tip-top-meats'])
})
test('non-halal request still lists qualifying halal leads without forcing halal filtering',()=>{
 const results=checkSupplies({item:'beef short rib', quantity:10, unit:'kg'})
 expect(results.some(result => result.lead.halal)).toBe(true)
 expect(results.some(result => !result.lead.halal)).toBe(true)
})
