import {expect, test} from 'bun:test'
import {voiceAgentErrorMessage} from '../src/features/voice/errors'

test('surfaces explicit ElevenLabs quota failures', () => {
  expect(voiceAgentErrorMessage({reason:"[quota_exceeded] You've run out of credits."})).toContain('credits are exhausted')
})

test('turns the deployed SDK generic server failure into actionable credit guidance', () => {
  const message = voiceAgentErrorMessage('Server error: Unknown error')
  expect(message).toContain('out of credits')
  expect(message).not.toContain('microphone')
})

test('keeps microphone permission errors distinct from provider failures', () => {
  expect(voiceAgentErrorMessage(new DOMException('Permission denied', 'NotAllowedError'))).toContain('Microphone access is unavailable')
})

test('provides a safe fallback for unclassified provider failures', () => {
  expect(voiceAgentErrorMessage({message:'Socket closed unexpectedly'})).toContain('voice session ended unexpectedly')
})
