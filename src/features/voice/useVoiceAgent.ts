import { supplyCheckClientTools } from '../supplycheck/agentTools'
import { intakeClientTools } from '../intake/agentTools'
import { useEffect, useRef, useState } from 'react'
import type { OrbSignal } from 'orb-ui'
import type { ElevenLabsOrbAdapter } from 'orb-ui/adapters'
import type { ConfirmedVoiceIntake } from '../intake/request'
import { voiceAgentErrorMessage } from './errors'

type ConfirmedIntakeHandler = (input: ConfirmedVoiceIntake) => void | Promise<void>

export function useVoiceAgent(onTranscript: (text: string) => void, onConfirmedIntake?: ConfirmedIntakeHandler) {
  const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID?.trim()
  const [signal, setSignal] = useState<OrbSignal>({state:'idle'})
  const [ready, setReady] = useState(false)
  const adapterRef = useRef<ElevenLabsOrbAdapter | null>(null)
  const callback = useRef(onTranscript)
  const confirmedCallback = useRef(onConfirmedIntake)
  const alive = useRef(true)
  const busy = useRef(false)
  callback.current = onTranscript
  confirmedCallback.current = onConfirmedIntake
  useEffect(() => {
    alive.current = true
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    setReady(false)
    if (agentId) {
      void Promise.all([import('@elevenlabs/client'), import('orb-ui/adapters')]).then(([{Conversation}, {createElevenLabsAdapter}]) => {
        if (cancelled) return
        const adapter = createElevenLabsAdapter(Conversation, {agentId, clientTools: {...intakeClientTools, ...supplyCheckClientTools, finish_intake_conversation: async (parameters: {intake?: ConfirmedVoiceIntake;sourcingMode?: ConfirmedVoiceIntake['sourcingMode']} | undefined) => {
          const intake = {...(parameters?.intake ?? {}),sourcingMode:parameters?.sourcingMode ?? parameters?.intake?.sourcingMode}
          if (!confirmedCallback.current) return JSON.stringify({ok:false,error:'Request saving is unavailable. Keep the conversation open.'})
          try {
            await confirmedCallback.current(intake)
            window.setTimeout(() => { void adapterRef.current?.stop().catch(() => {}) }, 1800)
            return JSON.stringify({ok:true,instruction:'The request was saved. Say only “Okay — request captured.” The conversation will now end.'})
          } catch(error) {
            return JSON.stringify({ok:false,error:error instanceof Error ? error.message : 'The request could not be saved. Keep the conversation open and ask the owner to retry.'})
          }
        }}, onMessage: (event: {source: string; message: string}) => {
          if (alive.current && event.source === 'user') callback.current(event.message)
        }})
        adapterRef.current = adapter
        unsubscribe = adapter.subscribe(next => { if (alive.current) setSignal(next) })
        if (alive.current) setReady(true)
      }).catch(error => { if (!cancelled) { setReady(false); setSignal({state:'error',error}) } })
    }
    return () => { cancelled = true; alive.current = false; unsubscribe?.(); const adapter = adapterRef.current; adapterRef.current = null; void adapter?.stop().catch(() => {}) }
  }, [agentId])
  async function toggle() {
    const adapter = adapterRef.current
    if (!adapter || busy.current) return
    busy.current = true
    try {
      if (signal.state !== 'idle' && signal.state !== 'error') await adapter.stop()
      else await adapter.start()
    } catch(error) { if (alive.current) setSignal({state:'error',error}) }
    finally { busy.current = false }
  }
  return {configured: Boolean(agentId), ready, signal, errorMessage: signal.state === 'error' ? voiceAgentErrorMessage(signal.error) : '', toggle}
}
