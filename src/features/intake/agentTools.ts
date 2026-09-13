import { normalizeDeadline, previewNormalize, type IntakeSource, type NormalizedIntake } from './schema'
import { clarifyQuestions, applyResponse, canonicalIntakeField, confirmIntake, isIntakeResponseUnderstood, missingFieldsOf } from './clarify'
import { canonicalUnit } from './speech'
import { parseSourcingMode } from '../requests/workflow'

export type IntakeAnswerInput = {
  intake?: Partial<NormalizedIntake>
  field: string
  response: string
}

function json(value: unknown) { return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v) }

export const intakeClientTools = {
  clarify_intake_details: (parameters: {requestText?:string;item?: string; quantity?: number; unit?: string; deadline?: string; deliveryLocation?: string; halal?: boolean | null; cut?: string; freshness?: string; budgetCents?: number; paymentDays?: number;depositBps?:number;sourcingMode?:'compare'|'first_qualifying'} | undefined) => {
    const args = parameters ?? {}
    const parsed = args.requestText?.trim() ? previewNormalize('voice_call', args.requestText) : null
    const halal = typeof args.halal === 'boolean' ? args.halal : parsed?.halal ?? null
    const freshness = args.freshness === 'fresh' || args.freshness === 'frozen' || args.freshness === 'either' ? args.freshness : parsed?.freshness ?? null
    const intake: Partial<NormalizedIntake> = {
      item: args.item ?? parsed?.item ?? null,
      quantity: args.quantity ?? parsed?.quantity ?? null,
      unit: args.unit ?? parsed?.unit ?? null,
      deadline: args.deadline ?? parsed?.deadline ?? null,
      deliveryLocation: args.deliveryLocation ?? parsed?.deliveryLocation ?? null,
      halal,
      cut: args.cut ?? parsed?.cut ?? null,
      freshness,
      budgetCents: args.budgetCents ?? parsed?.budgetCents ?? null,
      paymentDays: args.paymentDays ?? parsed?.paymentDays ?? null,
      depositBps:args.depositBps ?? parsed?.depositBps ?? null,
    }
    const questions = clarifyQuestions(intake)
    const sourcingMode=args.sourcingMode ?? parseSourcingMode(args.requestText ?? '') ?? 'first_qualifying'
    if (questions.length === 0) return json({ok:true, allClear:true, sourcingMode, intake, note:'No gaps remain. Confirm the details back to the caller.'})
    return json({ok:true, allClear:false, sourcingMode, intake, askNext:questions[0], remaining:Math.max(0,missingFieldsOf(intake as NormalizedIntake).length - 1)})
  },
  apply_intake_answer: (parameters: IntakeAnswerInput | undefined) => {
    const args = parameters ?? {field:'item', response:''}
    if (typeof args.field !== 'string' || typeof args.response !== 'string' || !args.response.trim()) return json({error:'Provide the field and the caller’s spoken answer.'})
    const intake = {...intakeBase(args.intake), evidence:[...(args.intake?.evidence ?? [])]}
    const updated = applyResponse(intake, args.field, args.response)
    updated.missingFields = missingFieldsOf(updated)
    const questions = clarifyQuestions(updated)
    const confirm = updated.missingFields.length === 0 ? confirmIntake(updated as NormalizedIntake) : null
    const canonicalField = canonicalIntakeField(args.field)
    const understood = isIntakeResponseUnderstood(canonicalField, args.response)
    const retry = understood ? null : clarificationFor(canonicalField, updated)
    return json({ok:true, understood, intake:{...updated}, missingFields:updated.missingFields, continueAsking:retry ?? questions[0] ?? null, confirm})
  },
  confirm_intake: (parameters: {intake?: Partial<NormalizedIntake> & {missingFields?: string[]}} | undefined) => {
    const args = parameters ?? {}
    const intake = intakeBase(args.intake)
    const missingFields = missingFieldsOf(intake)
    if (missingFields.length) return json({ok:false,error:'The request is incomplete. Ask for every missing detail before confirmation.',missingFields,askNext:clarifyQuestions(intake)[0]})
    return json({ok:true, script:confirmIntake(intake)})
  },
}

function intakeBase(partial?: Partial<NormalizedIntake>): NormalizedIntake {
  const item = typeof partial?.item === 'string' && isIntakeResponseUnderstood('item', partial.item) ? partial.item.trim().slice(0, 120) : null
  const quantity = typeof partial?.quantity === 'number' && Number.isFinite(partial.quantity) && partial.quantity > 0 ? partial.quantity : null
  const budgetCents = typeof partial?.budgetCents === 'number' && Number.isFinite(partial.budgetCents) && partial.budgetCents > 0 ? Math.round(partial.budgetCents) : null
  const paymentDays = typeof partial?.paymentDays === 'number' && Number.isFinite(partial.paymentDays) && partial.paymentDays >= 0 && partial.paymentDays <= 365 ? Math.round(partial.paymentDays) : null
  const depositBps = typeof partial?.depositBps === 'number' && Number.isFinite(partial.depositBps) && partial.depositBps >= 0 && partial.depositBps <= 10_000 ? Math.round(partial.depositBps) : null
  const deadline = typeof partial?.deadline === 'string' ? normalizeDeadline(partial.deadline) : null
  const deliveryLocation = typeof partial?.deliveryLocation === 'string' && isIntakeResponseUnderstood('deliveryLocation', partial.deliveryLocation) ? partial.deliveryLocation.trim().slice(0, 200) : null
  return {
    source: partial?.source ?? 'voice_call',
    summary: partial?.summary ?? '',
    intent: partial?.intent ?? 'source',
    item,
    quantity,
    unit: quantity && partial?.unit?.trim() ? canonicalUnit(partial.unit) : null,
    budgetCents,
    deadline,
    deliveryLocation,
    paymentDays,
    depositBps,
    halal: partial?.halal ?? null,
    cut: partial?.cut ?? null,
    freshness: partial?.freshness ?? null,
    sentimentCue: partial?.sentimentCue ?? 'neutral',
    confidence: 0,
    missingFields: partial?.missingFields ?? [],
    evidence: partial?.evidence ?? [],
  }
}

function clarificationFor(field: string, intake: NormalizedIntake) {
  const incomplete: NormalizedIntake = {...intake}
  if (field === 'quantity') { incomplete.quantity = null; incomplete.unit = null }
  else if (field === 'budget') incomplete.budgetCents = null
  else if (field === 'payment') incomplete.paymentDays = null
  else if (field === 'deposit') incomplete.depositBps = null
  else if (field === 'deliveryLocation') incomplete.deliveryLocation = null
  else if (field === 'deadline') incomplete.deadline = null
  else if (field === 'halal') incomplete.halal = null
  else if (field === 'cut') incomplete.cut = null
  else if (field === 'freshness') incomplete.freshness = null
  else if (field === 'item') incomplete.item = null
  return clarifyQuestions(incomplete).find(question => question.field === field) ?? clarifyQuestions(incomplete)[0] ?? null
}
