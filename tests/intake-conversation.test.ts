import { expect, test } from 'bun:test'
import { intakeClientTools } from '../src/features/intake/agentTools'
import { applyResponse, clarifyQuestions } from '../src/features/intake/clarify'
import { normalizeDeadline, previewNormalize } from '../src/features/intake/schema'
import { parseDepositBps, parseHalalRequirement, parseMoneyCents, parsePaymentDays, parseQuantity } from '../src/features/intake/speech'
import { requestFromConfirmedVoiceIntake } from '../src/features/intake/request'

test('Australian quantity and money expressions normalize deterministically', () => {
  expect(parseQuantity('thirty kay')).toMatchObject({quantity: 30, unit: 'kg'})
  expect(parseQuantity('a coupla boxes')).toMatchObject({quantity: 2, unit: 'boxes'})
  expect(parseQuantity('half a dozen cartons')).toMatchObject({quantity: 6, unit: 'cartons'})
  expect(parseMoneyCents('keep it under three hundred and fifty bucks')?.cents).toBe(35_000)
  expect(parseMoneyCents('a grand max')?.cents).toBe(100_000)
})

test('Australian payment and deposit language maps to explicit commercial terms', () => {
  expect(parsePaymentDays('No dramas with COD, mate')).toBe(0)
  expect(parsePaymentDays('net 14')).toBe(14)
  expect(parsePaymentDays('net thirty')).toBe(30)
  expect(parsePaymentDays('A fortnight from invoice would be good')).toBe(14)
  expect(parsePaymentDays('a coupla weeks')).toBe(14)
  expect(parseDepositBps('Nothing upfront, mate')).toBe(0)
  expect(parseDepositBps('A quarter upfront is the most')).toBe(2500)
})

test('slang deadlines resolve only when the date and clock time are unambiguous', () => {
  const now = new Date('2026-09-14T10:00:00+10:00')
  expect(normalizeDeadline('tomoz before eight in the morning', now)).toBe('2026-09-15T08:00')
  expect(normalizeDeadline('tomoz at noon', now)).toBe('2026-09-15T12:00')
  expect(normalizeDeadline('this arvo', now)).toBeNull()
  expect(normalizeDeadline('tomoz before brekkie', now)).toBeNull()
  expect(normalizeDeadline('tomorrow first thing', now)).toBeNull()
})

test('a complete slang-heavy request becomes a complete reviewable brief', () => {
  const result = previewNormalize(
    'voice_call',
    'Need half a dozen boxes of fresh halal chicken breast fillets delivered to 24 Flinders Lane, Melbourne VIC 3000 tomoz before eight in the morning, under three hundred and fifty bucks, a fortnight from invoice and nothing upfront mate.',
    new Date('2026-09-14T10:00:00+10:00'),
  )
  expect(result.item).toBe('fresh halal chicken breast fillets')
  expect(result.quantity).toBe(6)
  expect(result.unit).toBe('boxes')
  expect(result.budgetCents).toBe(35_000)
  expect(result.deadline).toBe('2026-09-15T08:00')
  expect(result.deliveryLocation).toContain('24 Flinders Lane')
  expect(result.paymentDays).toBe(14)
  expect(result.depositBps).toBe(0)
  expect(result.halal).toBe(true)
  expect(result.cut).toBe('breast')
  expect(result.freshness).toBe('fresh')
  expect(result.missingFields).toEqual([])
})

test('self-corrections replace earlier values instead of preserving stale answers', () => {
  let intake = previewNormalize('voice_call', 'Need chicken')
  intake = applyResponse(intake, 'quantity', 'Thirty kay—sorry, make that forty kilos')
  intake = applyResponse(intake, 'freshness', 'Fresh, actually frozen')
  intake = applyResponse(intake, 'halal', 'Yeah nah, not fussed about halal')
  expect(intake.quantity).toBe(40)
  expect(intake.unit).toBe('kg')
  expect(intake.freshness).toBe('frozen')
  expect(intake.halal).toBe(false)
  expect(parseHalalRequirement('Nah yeah, it must be halal')).toBe(true)
})

test('unclear answers keep the same field missing and prompt again', () => {
  const intake = previewNormalize('voice_call', 'Need 30 kg chicken delivered to Melbourne CBD tomorrow at 8 am under $350, no deposit')
  const response = JSON.parse(intakeClientTools.apply_intake_answer({intake, field: 'payment', response: 'Whatever, sort it out'}))
  expect(response.understood).toBe(false)
  expect(response.missingFields).toContain('payment')
  expect(response.continueAsking.field).toBe('payment')
})

test('unclear corrections retry the changed field instead of silently retaining stale data', () => {
  const intake = previewNormalize('voice_call', 'Need 30 kg fresh halal chicken breast delivered to 24 Flinders Lane, Melbourne VIC 3000 tomorrow at 8 am under $350, net 14 and no deposit')
  const response = JSON.parse(intakeClientTools.apply_intake_answer({intake, field: 'payment', response: 'Actually, you know, whatever'}))
  expect(response.understood).toBe(false)
  expect(response.intake.paymentDays).toBe(14)
  expect(response.continueAsking.field).toBe('payment')
})

test('invalid tool-supplied commercial values cannot bypass missing-detail checks', () => {
  const response = JSON.parse(intakeClientTools.confirm_intake({intake:{item:'cups',quantity:-2,unit:'boxes',deadline:'tomorrow sometime',deliveryLocation:'Melbourne',budgetCents:0,paymentDays:-1,depositBps:20_000}}))
  expect(response.ok).toBe(false)
  expect(response.missingFields).toEqual(expect.arrayContaining(['quantity','budget','deadline','deliveryLocation','payment','deposit']))
})

test('confirmation is blocked until every delivery and payment detail is supplied', () => {
  const intake = previewNormalize('voice_call', 'Need 30 kg chicken under $350')
  const response = JSON.parse(intakeClientTools.confirm_intake({intake}))
  expect(response.ok).toBe(false)
  expect(response.missingFields).toContain('deadline')
  expect(response.missingFields).toContain('deliveryLocation')
  expect(response.missingFields).toContain('payment')
  expect(response.missingFields).toContain('deposit')
  expect(response.askNext.field).toBe('missingDetails')
  expect(response.askNext.prompt).toContain('whether halal is required')
})

test('Sarah groups every missing detail into one compact question', () => {
  const intake = previewNormalize('voice_call', 'Need a coupla boxes of compostable cups')
  const questions = clarifyQuestions(intake)
  const response = JSON.parse(intakeClientTools.clarify_intake_details(intake))
  expect(questions.map(question => question.field)).toEqual(['deadline', 'deliveryLocation', 'budget', 'payment', 'deposit'])
  expect(response.askNext.field).toBe('missingDetails')
  expect(response.askNext.prompt).toContain('delivery date and time')
  expect(response.askNext.prompt).toContain('deposit limit')
  expect(response.missingFields).toEqual(['budget', 'deadline', 'deliveryLocation', 'payment', 'deposit'])
  expect(response.remainingPrompts).toBe(1)
})

test('initial voice tool deterministically recovers fields omitted by the language model', () => {
  const response = JSON.parse(intakeClientTools.clarify_intake_details({requestText:'I need a coupla boxes of chicken, mate. Shop around and compare the best price.',item:'chicken',unit:'boxes',sourcingMode:'compare'}))
  expect(response.sourcingMode).toBe('compare')
  expect(response.askNext.field).toBe('missingDetails')
  expect(response.askNext.prompt).toContain('whether halal is required')
  expect(response.remainingPrompts).toBe(1)
})

test('one combined answer can complete the request and move directly to confirmation', () => {
  const first = JSON.parse(intakeClientTools.clarify_intake_details({requestText:'Need 40 kg chicken thighs by Friday, maximum budget 260 dollars, deposit no higher than 10 percent'}))
  expect(first.askNext.field).toBe('missingDetails')
  const answered = JSON.parse(intakeClientTools.apply_intake_answer({
    intake:first.intake,
    field:'missingDetails',
    response:'Friday at 5 pm, deliver to 24 Flinders Lane Melbourne VIC 3000, due on delivery, no halal requirement, fresh chicken thighs.',
  }))
  expect(answered.missingFields).toEqual([])
  expect(answered.intake.deliveryLocation).toBe('24 Flinders Lane Melbourne VIC 3000')
  expect(answered.intake.cut).toBe('thighs')
  expect(answered.confirm).toContain('Is that right')
  const confirmed = JSON.parse(intakeClientTools.confirm_intake({intake:answered.intake}))
  expect(confirmed.afterConfirmation).toContain('end the conversation immediately')
})

test('a confirmed voice intake becomes a persisted request payload', () => {
  const request = requestFromConfirmedVoiceIntake({
    item:'chicken thighs',quantity:40,unit:'kg',budgetCents:26_000,
    deadline:'2026-09-18T17:00',deliveryLocation:'24 Flinders Lane Melbourne VIC 3000',
    paymentDays:0,depositBps:1_000,halal:false,cut:'thighs',freshness:'fresh',
    sourcingMode:'first_qualifying',
  },'original voice transcript')
  expect(request).toMatchObject({item:'chicken thighs',quantity:40,unit:'kg',budget:260,status:'Ready to source',purchaseMode:'preauthorized',maximumDepositPercent:10,brief:'original voice transcript'})
  expect(() => requestFromConfirmedVoiceIntake({item:'chicken thighs'})).toThrow('Request is still missing')
})
