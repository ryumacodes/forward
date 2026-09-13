import { supabase } from '../../lib/supabase/client'
import { previewNormalize, type IntakeSource, type NormalizedIntake } from './schema'
import { missingFieldsOf } from './clarify'

export type IntakeNormalization = {
  model: string
  mode: 'live' | 'local-preview' | 'local-fallback'
  result: NormalizedIntake
  fallbackReason?: string
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

type IntakeInvoker = (source: IntakeSource, text: string) => Promise<{data: unknown; error: unknown}>

export async function normalizeProcurementIntake(source: IntakeSource, text: string, liveInvoker?: IntakeInvoker): Promise<IntakeNormalization> {
  const cleaned = text.trim()
  if (!cleaned) throw new Error('Describe what you need before reviewing the request.')
  if (cleaned.length > 50_000) throw new Error('Keep the request under 50,000 characters.')
  const client = supabase
  const invoke = liveInvoker ?? (client ? ((intakeSource: IntakeSource, intakeText: string) => client.functions.invoke('normalize-intake', { body: { source: intakeSource, text: intakeText } })) : null)
  if (!invoke) return { model: 'deterministic-local-preview', mode: 'local-preview', result: previewNormalize(source, cleaned) }
  try {
    const { data, error } = await invoke(source, cleaned)
    if (error) throw error
    const response = data as {result?: unknown; model?: unknown} | null
    if (!response || !isNormalizedIntake(response.result)) throw new Error('invalid-response')
    const result = response.result
    result.missingFields = missingFieldsOf(result)
    return { model: String(response.model || 'unknown'), mode: 'live', result }
  } catch {
    // Intake review is a safety boundary and must remain usable during an Edge
    // Function or model outage. The conservative local parser leaves uncertain
    // fields blank so the owner still has to review them before saving.
    return {
      model: 'deterministic-local-fallback',
      mode: 'local-fallback',
      result: previewNormalize(source, cleaned),
      fallbackReason: 'Live extraction is temporarily unavailable. Local extraction was used; review every field before creating the request.',
    }
  }
}
