import { supplyCheckClientTools } from '../supplycheck/agentTools'
import { intakeClientTools } from '../intake/agentTools'
import { useEffect, useRef, useState } from 'react'
import type { OrbSignal } from 'orb-ui'
import type { ElevenLabsOrbAdapter } from 'orb-ui/adapters'

export function useVoiceAgent(onTranscript: (text: string) => void) {
  const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID?.trim()
  const [signal, setSignal] = useState<OrbSignal>({state:'idle'})
  const [ready, setReady] = useState(false)
  const adapterRef = useRef<ElevenLabsOrbAdapter | null>(null)
  const callback = useRef(onTranscript)
  const alive = useRef(true)
  const busy = useRef(false)
  callback.current = onTranscript
  useEffect(() => {
    alive.current = true
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    setReady(false)
    if (agentId) {
      void Promise.all([import('@elevenlabs/client'), import('orb-ui/adapters')]).then(([{Conversation}, {createElevenLabsAdapter}]) => {
        if (cancelled) return
        const adapter = createElevenLabsAdapter(Conversation, {agentId, clientTools: {...intakeClientTools, ...supplyCheckClientTools}, onMessage: (event: {source: string; message: string}) => {
          if (alive.current && event.source === 'user') callback.current(event.message)
        }})
        adapterRef.current = adapter
        unsubscribe = adapter.subscribe(next => { if (alive.current) setSignal(next) })
        if (alive.current) setReady(true)
      }).catch(() => { if (!cancelled) { setReady(false); setSignal({state:'error'}) } })
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
    } catch { if (alive.current) setSignal({state:'error'}) }
    finally { busy.current = false }
  }
  return {configured: Boolean(agentId), ready, signal, toggle}
}
