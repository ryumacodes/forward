import type { ProcurementRequest } from '../requests/data'
import type { NormalizedIntake } from './schema'
import { missingFieldsOf } from './clarify'

export type ConfirmedVoiceIntake = Partial<NormalizedIntake> & {
  sourcingMode?: ProcurementRequest['sourcingMode']
}

export function requestFromConfirmedVoiceIntake(input: ConfirmedVoiceIntake, brief = ''): ProcurementRequest {
  const missing = missingFieldsOf(input as NormalizedIntake)
  if (missing.length) throw new Error(`Request is still missing: ${missing.join(', ')}`)
  const sourcingMode = input.sourcingMode ?? 'first_qualifying'
  return {
    id:`REQ-${Date.now().toString().slice(-6)}`,
    item:String(input.item),
    quantity:Number(input.quantity),
    unit:String(input.unit),
    budget:Number(input.budgetCents) / 100,
    deadline:String(input.deadline),
    location:String(input.deliveryLocation),
    status:'Ready to source',
    category:'Voice request',
    brief,
    sourcingMode,
    purchaseMode:sourcingMode === 'compare' ? 'confirm' : 'preauthorized',
    buyingProfile:'hospitality',
    confirmationChannel:'call',
    minimumPaymentDays:Number(input.paymentDays),
    maximumDepositPercent:Number(input.depositBps) / 100,
    requiresHalal:Boolean(input.halal),
    cut:input.cut || undefined,
    freshness:input.freshness || undefined,
  }
}
