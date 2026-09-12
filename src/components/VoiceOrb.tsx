import { Orb, type OrbSignal } from 'orb-ui'
/** Passive visual: the parent button owns start/stop and its accessible label. */
export function VoiceOrb({ listening = false, signal }: { listening?: boolean; signal?: OrbSignal }) {
  return <span className="cloud-orb" aria-hidden="true"><Orb theme="cloud" size={156} signal={signal ?? {state: listening ? 'listening' : 'idle'}} interactive={false}/></span>
}
