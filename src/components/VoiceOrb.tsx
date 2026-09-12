import { Orb, type OrbSignal, type OrbTheme } from 'orb-ui'

const procurementCloud: OrbTheme = {
  name: 'cloud',
  preset: 'calm',
  appearance: {
    deepColor: '#061638',
    upperColor: '#123fa3',
    lowerColor: '#2870dc',
    highlightColor: '#dceaff',
    launchColor: '#164cc8',
    spinnerColor: '#477fe0',
  },
}

export function VoiceOrb({ listening = false, signal }: { listening?: boolean; signal?: OrbSignal }) {
  return (
    <span className="cloud-orb" aria-hidden="true">
      <Orb
        theme={procurementCloud}
        size={156}
        signal={signal ?? { state: listening ? 'listening' : 'idle' }}
        interactive={false}
      />
    </span>
  )
}
