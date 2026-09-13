export {}

const confirmation = process.env.LIVE_COMMUNICATIONS_CONFIRM?.trim()
const emails = (process.env.LIVE_TEST_EMAILS ?? '').split(',').map(value => value.trim()).filter(Boolean)
const phone = normalizeAustralianPhone(process.env.LIVE_TEST_PHONE ?? '')

const required = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_AGENT_ID: process.env.ELEVENLABS_OWNER_NOTIFICATION_AGENT_ID || process.env.ELEVENLABS_AGENT_ID,
  ELEVENLABS_PHONE_NUMBER_ID: process.env.ELEVENLABS_PHONE_NUMBER_ID,
}

const missing = Object.entries(required).filter(([, value]) => !value?.trim()).map(([name]) => name)
if (confirmation !== 'send') missing.unshift('LIVE_COMMUNICATIONS_CONFIRM=send')
if (emails.length === 0 || emails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) missing.push('LIVE_TEST_EMAILS')
if (!phone) missing.push('LIVE_TEST_PHONE')
if (missing.length) throw new Error(`Live communication preflight failed. Configure: ${[...new Set(missing)].join(', ')}`)

const twilioFrom = normalizeAustralianPhone(required.TWILIO_SMS_FROM ?? '')
if (!twilioFrom) throw new Error('Live communication preflight failed. TWILIO_SMS_FROM is not a valid Australian number.')

const [resendCheck, twilioCheck, elevenLabsCheck] = await Promise.all([
  fetch('https://api.resend.com/domains', {headers: {Authorization: `Bearer ${required.RESEND_API_KEY}`}}),
  fetch(`https://api.twilio.com/2010-04-01/Accounts/${required.TWILIO_ACCOUNT_SID}.json`, {headers: {Authorization: `Basic ${btoa(`${required.TWILIO_ACCOUNT_SID}:${required.TWILIO_AUTH_TOKEN}`)}`}}),
  fetch('https://api.elevenlabs.io/v1/convai/phone-numbers', {headers: {'xi-api-key': required.ELEVENLABS_API_KEY ?? ''}}),
])
const phoneInventory = await elevenLabsCheck.json().catch(() => ({})) as {phone_numbers?: Array<{phone_number_id?: string; id?: string}>}
const providerProblems = [
  ...(!resendCheck.ok ? [`Resend credentials returned ${resendCheck.status}`] : []),
  ...(!twilioCheck.ok ? [`Twilio credentials returned ${twilioCheck.status}`] : []),
  ...(!elevenLabsCheck.ok ? [`ElevenLabs credentials returned ${elevenLabsCheck.status}`] : []),
  ...(elevenLabsCheck.ok && !phoneInventory.phone_numbers?.some(item => (item.phone_number_id ?? item.id) === required.ELEVENLABS_PHONE_NUMBER_ID) ? ['ELEVENLABS_PHONE_NUMBER_ID is not present in this account'] : []),
]
if (providerProblems.length) throw new Error(`Live communication provider preflight failed: ${providerProblems.join('; ')}`)

const testId = `sourcepilot-${new Date().toISOString().replace(/[:.]/g, '-')}`
const subject = `SourcePilot live email test ${testId}`
const emailText = `This is a live SourcePilot delivery test requested by the account owner. No reply or action is needed. Test ID: ${testId}`
const smsText = `SourcePilot live SMS test requested by the account owner. No action needed. Test ID: ${testId}`

const emailResults = []
for (const to of emails) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {Authorization: `Bearer ${required.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${testId}/email/${to}`},
    body: JSON.stringify({from: required.RESEND_FROM_EMAIL, to: [to], subject, text: emailText}),
  })
  const body = await response.json().catch(() => ({})) as {id?: string; message?: string}
  if (!response.ok || !body.id) throw new Error(`Email delivery request failed for ${maskEmail(to)} (${response.status}): ${body.message ?? 'No provider ID returned'}`)
  emailResults.push({recipient: maskEmail(to), accepted: true, providerId: body.id})
}

const smsForm = new URLSearchParams({To: phone, From: twilioFrom, Body: smsText})
const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${required.TWILIO_ACCOUNT_SID}/Messages.json`, {
  method: 'POST',
  headers: {Authorization: `Basic ${btoa(`${required.TWILIO_ACCOUNT_SID}:${required.TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded'},
  body: smsForm,
})
const smsBody = await smsResponse.json().catch(() => ({})) as {sid?: string; status?: string; message?: string}
if (!smsResponse.ok || !smsBody.sid) throw new Error(`SMS delivery request failed (${smsResponse.status}): ${smsBody.message ?? 'No provider ID returned'}`)

const firstMessage = 'Hi, this is Sarah, the SourcePilot AI assistant. This is the live call test you requested. Can you hear me clearly?'
const prompt = 'You are Sarah, SourcePilot’s AI assistant. This is an explicitly requested test call to the account owner. Briefly confirm that the voice connection works, answer naturally if they speak, do not collect procurement details, do not place any order, and end politely when they are satisfied or ask to stop.'
const callResponse = await fetch('https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call', {
  method: 'POST',
  headers: {'xi-api-key': required.ELEVENLABS_API_KEY ?? '', 'Content-Type': 'application/json'},
  body: JSON.stringify({
    agent_id: required.ELEVENLABS_AGENT_ID,
    agent_phone_number_id: required.ELEVENLABS_PHONE_NUMBER_ID,
    to_number: phone,
    conversation_initiation_client_data: {conversation_config_override: {agent: {first_message: firstMessage, prompt: {prompt}}}},
  }),
})
const callBody = await callResponse.json().catch(() => ({})) as {success?: boolean; message?: string; conversation_id?: string; sip_call_id?: string}
if (!callResponse.ok || !callBody.success || !callBody.conversation_id) throw new Error(`Call delivery request failed (${callResponse.status}): ${callBody.message ?? 'No conversation ID returned'}`)

console.log(JSON.stringify({
  testId,
  email: emailResults,
  sms: {recipient: maskPhone(phone), accepted: true, status: smsBody.status, providerId: smsBody.sid},
  call: {recipient: maskPhone(phone), accepted: true, conversationId: callBody.conversation_id, callId: callBody.sip_call_id},
}, null, 2))

function normalizeAustralianPhone(value: string) {
  const compact = value.replace(/[^\d+]/g, '')
  if (/^\+61[2-478]\d{8}$/.test(compact)) return compact
  if (/^0[2-478]\d{8}$/.test(compact)) return `+61${compact.slice(1)}`
  return ''
}

function maskEmail(value: string) {
  const [local, domain] = value.split('@')
  return `${local.slice(0, 2)}***@${domain}`
}

function maskPhone(value: string) {
  return `${value.slice(0, 5)}***${value.slice(-3)}`
}
