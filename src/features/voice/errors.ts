function errorText(error: unknown) {
  if (typeof error === 'string') return error
  if (error instanceof Error) return `${error.name} ${error.message}`
  if (!error || typeof error !== 'object') return String(error ?? '')
  const record = error as Record<string, unknown>
  return ['message','reason','error','error_type','code','closeReason']
    .map(key => record[key])
    .filter(value => value != null)
    .map(value => typeof value === 'object' ? JSON.stringify(value) : String(value))
    .join(' ')
}

export function voiceAgentErrorMessage(error: unknown) {
  const text = errorText(error).toLowerCase()
  if (/quota|credit|billing|payment required|insufficient balance/.test(text)) {
    return 'ElevenLabs credits are exhausted. Add credits or upgrade the ElevenLabs workspace, then try again.'
  }
  if (/server error:\s*unknown error/.test(text)) {
    // The current ElevenLabs browser SDK collapses the confirmed quota error into
    // this generic message before exposing it to the client adapter.
    return 'ElevenLabs rejected the voice session. This workspace is currently out of credits; add credits or upgrade, then try again.'
  }
  if (/notallowed|permission|microphone|audio input|device not found|notfounderror/.test(text)) {
    return 'Microphone access is unavailable. Allow microphone access for this site in your browser, then try again.'
  }
  if (/agent|configuration|unauthori[sz]ed|forbidden|invalid/.test(text)) {
    return 'Sarah’s ElevenLabs configuration could not be loaded. Check the deployed agent ID and access settings.'
  }
  return 'The ElevenLabs voice session ended unexpectedly. Check provider status and workspace usage, then try again.'
}
