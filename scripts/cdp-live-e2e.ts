export {}

const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9444'
const appUrl = process.env.CDP_APP_URL ?? 'http://127.0.0.1:4173'
const email = process.env.E2E_EMAIL?.trim()
const password = process.env.E2E_PASSWORD

type CdpMessage = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: {message?: string}
}

const targets = await fetch(`${endpoint}/json/list`).then(response => response.json()) as Array<{
  type: string
  webSocketDebuggerUrl?: string
}>
const debuggerUrl = targets.find(target => target.type === 'page')?.webSocketDebuggerUrl
if (!debuggerUrl) throw new Error(`No page target is available at ${endpoint}.`)

const socket = new WebSocket(debuggerUrl)
const pending = new Map<number, {resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void}>()
const browserErrors: string[] = []
let commandId = 0

const safeUrl = (value: string) => {
  try { const url = new URL(value); return `${url.origin}${url.pathname}` }
  catch { return value.slice(0, 200) }
}

const send = (method: string, params: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve, reject) => {
  const id = ++commandId
  pending.set(id, {resolve, reject})
  socket.send(JSON.stringify({id, method, params}))
})

socket.onmessage = message => {
  const event = JSON.parse(String(message.data)) as CdpMessage
  if (event.id != null) {
    const request = pending.get(event.id)
    if (!request) return
    pending.delete(event.id)
    if (event.error) request.reject(new Error(event.error.message ?? 'CDP command failed.'))
    else request.resolve(event.result ?? {})
    return
  }
  if (event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error') {
    const args = event.params.args as Array<{value?: unknown; description?: string}> | undefined
    const stack = event.params.stackTrace as {callFrames?: Array<{url?: string; lineNumber?: number; columnNumber?: number}>} | undefined
    const frame = stack?.callFrames?.[0]
    const location = frame?.url ? ` at ${safeUrl(frame.url)}:${(frame.lineNumber ?? 0) + 1}:${(frame.columnNumber ?? 0) + 1}` : ''
    browserErrors.push(`${(args ?? []).map(arg => String(arg.value ?? arg.description ?? '')).join(' ')}${location}`)
  }
  if (event.method === 'Runtime.exceptionThrown') {
    const details = event.params?.exceptionDetails as {text?: string; exception?: {description?: string}} | undefined
    browserErrors.push(details?.exception?.description ?? details?.text ?? 'Unhandled page exception')
  }
  if (event.method === 'Log.entryAdded') {
    const entry = event.params?.entry as {level?: string; text?: string} | undefined
    if (entry?.level === 'error') browserErrors.push(entry.text ?? 'Unknown browser log error')
  }
  if (event.method === 'Network.loadingFailed') {
    const failure = event.params as {errorText?: string; canceled?: boolean} | undefined
    if (!failure?.canceled && failure?.errorText !== 'net::ERR_ABORTED') browserErrors.push(`Network failure: ${failure?.errorText ?? 'unknown'}`)
  }
  if (event.method === 'Network.responseReceived') {
    const response = event.params?.response as {status?: number; url?: string} | undefined
    if ((response?.status ?? 0) >= 400) browserErrors.push(`HTTP ${response?.status} ${safeUrl(response?.url ?? '')}`)
  }
}

await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timed out connecting to the CDP page target.')), 5_000)
  socket.onopen = () => { clearTimeout(timeout); resolve() }
  socket.onerror = () => { clearTimeout(timeout); reject(new Error('Could not connect to the CDP page target.')) }
})

async function evaluate<T>(expression: string): Promise<T> {
  const evaluated = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})
  const exception = evaluated.exceptionDetails as {text?: string; exception?: {description?: string}} | undefined
  if (exception) throw new Error(exception.exception?.description ?? exception.text ?? 'Browser evaluation failed.')
  return (evaluated.result as {value?: T} | undefined)?.value as T
}

async function waitFor(expression: string, description: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate<boolean>(`Boolean(${expression})`)) return
    await Bun.sleep(200)
  }
  throw new Error(`Timed out waiting for ${description}.`)
}

const clickButton = async (pattern: string) => evaluate<boolean>(`(() => {
  const pattern = new RegExp(${JSON.stringify(pattern)}, 'i');
  const button = [...document.querySelectorAll('button')].find(element => {
    const accessibleName = element.getAttribute('aria-label') ?? element.innerText.trim();
    return pattern.test(accessibleName);
  });
  if (!button) return false;
  button.click();
  return true;
})()`)

const fillLabel = async (labelText: string, value: string) => evaluate<boolean>(`(() => {
  const label = [...document.querySelectorAll('label')].find(element => element.textContent?.includes(${JSON.stringify(labelText)}));
  const input = label?.querySelector('input') ?? (label?.htmlFor ? document.getElementById(label.htmlFor) : null);
  if (!(input instanceof HTMLInputElement)) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.dispatchEvent(new Event('change', {bubbles: true}));
  return true;
})()`)

try {
  await Promise.all([send('Page.enable'), send('Runtime.enable')])
  await send('Page.navigate', {url: 'about:blank'})
  await waitFor(`document.readyState === 'complete'`, 'the clean CDP page')
  browserErrors.length = 0
  await Promise.all([send('Log.enable'), send('Network.enable')])
  await send('Browser.grantPermissions', {origin: appUrl, permissions: ['audioCapture']})
  await send('Page.navigate', {url: appUrl})
  await waitFor(`document.readyState === 'complete'`, 'the app document')
  if (!await clickButton('enter workspace')) throw new Error('The Enter workspace button was not found.')
  await waitFor(`/Voice procurement|Enter your workspace/.test(document.body.innerText)`, 'the workspace or login screen')

  const loginRequired = await evaluate<boolean>(`document.body.innerText.includes('Enter your workspace')`)
  if (loginRequired) {
    if (!email || !password) throw new Error('Set E2E_EMAIL and E2E_PASSWORD to an explicitly authorised test account.')
    if (!await fillLabel('Email address', email)) throw new Error('The login email field was not found.')
    if (!await fillLabel('Password', password)) throw new Error('The login password field was not found.')
    if (!await clickButton('continue securely')) throw new Error('The login submit button was not found.')
  }

  await waitFor(`document.body.innerText.includes('Voice procurement')`, 'the voice procurement workspace')
  if (!await clickButton('Talk to Sarah|Start talking')) throw new Error('The Talk to Sarah button was not found.')
  await waitFor(`document.body.innerText.includes('Start conversation')`, 'the Sarah dialog')
  if (!await clickButton('^Start conversation$')) throw new Error('The Start conversation button was not found.')
  await waitFor(`document.body.innerText.includes('ElevenLabs conversation · listening')`, 'a live ElevenLabs conversation', 30_000)
  await Bun.sleep(5_000)
  const liveState = 'listening'
  if (!await clickButton('End conversation')) throw new Error('The End conversation button was not found.')
  await waitFor(`document.body.innerText.includes('ElevenLabs conversation · idle')`, 'the stopped voice session', 15_000)

  const errors = [...new Set(browserErrors)]
  console.log(JSON.stringify({workspaceEntered: true, loginRequired, voiceConnected: true, liveState, consoleErrors: errors}, null, 2))
  if (errors.length) throw new Error(`CDP browser errors:\n${errors.join('\n')}`)
} catch (error) {
  if (browserErrors.length) console.error(JSON.stringify({consoleErrors: [...new Set(browserErrors)]}, null, 2))
  throw error
} finally {
  for (const request of pending.values()) request.reject(new Error('CDP connection closed.'))
  socket.close()
}
