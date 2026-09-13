import type { IntakeSource, NormalizedIntake } from './schema'
import { clarifyQuestions, applyResponse, confirmIntake, missingFieldsOf } from './clarify'

export type IntakeAnswerInput = {
  intake?: Partial<NormalizedIntake>
  field: string
  response: string
}

function json(value: unknown) { return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v) }

export const intakeClientTools = {
  clarify_intake_details: (parameters: {item?: string; quantity?: number; unit?: string; deadline?: string; deliveryLocation?: string; halal?: boolean | null; cut?: string; freshness?: string; budgetCents?: number; paymentDays?: number} | undefined) => {
    const args = parameters ?? {}
    const halal = typeof args.halal === 'boolean' ? args.halal : null
    const freshness = args.freshness === 'fresh' || args.freshness === 'frozen' || args.freshness === 'either' ? args.freshness : null
    const intake: Partial<NormalizedIntake> = {
      item: args.item ?? null,
      quantity: args.quantity ?? null,
      unit: args.unit ?? null,
      deadline: args.deadline ?? null,
      deliveryLocation: args.deliveryLocation ?? null,
      halal,
      cut: args.cut ?? null,
      freshness,
      budgetCents: args.budgetCents ?? null,
      paymentDays: args.paymentDays ?? null,
    }
    const questions = clarifyQuestions(intake)
    if (questions.length === 0) return json({ok:true, allClear:true, note:'No gaps remain. Confirm the details back to the caller.'})
    return json({ok:true, allClear:false, askNext:questions[0], remaining:questions.length - 1})
  },
  apply_intake_answer: (parameters: IntakeAnswerInput | undefined) => {
    const args = parameters ?? {field:'item', response:''}
    if (typeof args.field !== 'string' || typeof args.response !== 'string' || !args.response.trim()) return json({error:'Provide the field and the caller’s spoken answer.'})
    const intake = {...intakeBase(args.intake), evidence:[...(args.intake?.evidence ?? [])]}
    const updated = applyResponse(intake, args.field, args.response)
    updated.missingFields = missingFieldsOf(updated)
    const questions = clarifyQuestions(updated)
    const confirm = updated.missingFields.length === 0 ? confirmIntake(updated as NormalizedIntake) : null
    return json({ok:true, intake:{...updated}, missingFields:updated.missingFields, continueAsking:questions.length > 0 ? questions[0] : null, confirm})
  },
  confirm_intake: (parameters: {intake?: Partial<NormalizedIntake> & {missingFields?: string[]}} | undefined) => {
    const args = parameters ?? {}
    return json({ok:true, script:confirmIntake(intakeBase(args.intake))})
  },
}

function intakeBase(partial?: Partial<NormalizedIntake>): NormalizedIntake {
  return {
    source: partial?.source ?? 'voice_call',
    summary: partial?.summary ?? '',
    intent: partial?.intent ?? 'source',
    item: partial?.item ?? null,
    quantity: partial?.quantity ?? null,
    unit: partial?.unit ?? null,
    budgetCents: partial?.budgetCents ?? null,
    deadline: partial?.deadline ?? null,
    deliveryLocation: partial?.deliveryLocation ?? null,
    paymentDays: partial?.paymentDays ?? null,
    depositBps: partial?.depositBps ?? null,
    halal: partial?.halal ?? null,
    cut: partial?.cut ?? null,
    freshness: partial?.freshness ?? null,
    sentimentCue: partial?.sentimentCue ?? 'neutral',
    confidence: 0,
    missingFields: partial?.missingFields ?? [],
    evidence: partial?.evidence ?? [],
  }
}
