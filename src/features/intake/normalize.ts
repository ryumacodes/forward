import { supabase } from '../../lib/supabase/client'
import { previewNormalize, type IntakeSource, type NormalizedIntake } from './schema'
import { missingFieldsOf } from './clarify'

export type IntakeNormalization = {
  model: string
  mode: 'live' | 'local-preview'
  result: NormalizedIntake
}

function isNormalizedIntake(value: unknown): value is NormalizedIntake {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<NormalizedIntake>
  return typeof item.summary === 'string'
    && typeof item.intent === 'string'
    && typeof item.confidence === 'number'
    && item.confidence >= 0
    && item.confidence <= 1
    && Array.isArray(item.missingFields)
    && Array.isArray(item.evidence)
}

export async function normalizeProcurementIntake(source: IntakeSource, text: string): Promise<IntakeNormalization> {
  const cleaned = text.trim()
  if (!cleaned) throw new Error('Describe what you need before reviewing the request.')
  if (cleaned.length > 50_000) throw new Error('Keep the request under 50,000 characters.')
  if (!supabase) return { model: 'deterministic-local-preview', mode: 'local-preview', result: previewNormalize(source, cleaned) }
  const { data, error } = await supabase.functions.invoke('normalize-intake', { body: { source, text: cleaned } })
  if (error) throw new Error(`Could not structure the request: ${error.message}`)
  if (!data || !isNormalizedIntake(data.result)) throw new Error('The intake service returned an invalid result. Please try again.')
  const result = data.result
  result.missingFields = missingFieldsOf(result)
  return { model: String(data.model || 'unknown'), mode: 'live', result }
}
