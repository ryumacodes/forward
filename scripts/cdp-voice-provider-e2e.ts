export {}

const endpoint = process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9444'
const agentId = process.env.VITE_ELEVENLABS_AGENT_ID?.trim()
if (!agentId) throw new Error('VITE_ELEVENLABS_AGENT_ID is required.')

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
const consoleErrors: string[] = []
let commandId = 0

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
    consoleErrors.push((args ?? []).map(arg => String(arg.value ?? arg.description ?? '')).join(' '))
  }
  if (event.method === 'Log.entryAdded') {
    const entry = event.params?.entry as {level?: string; text?: string} | undefined
    if (entry?.level === 'error') consoleErrors.push(entry.text ?? 'Unknown browser log error')
  }
}

await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timed out connecting to the CDP page target.')), 5_000)
  socket.onopen = () => {
    clearTimeout(timeout)
    resolve()
  }
  socket.onerror = () => {
    clearTimeout(timeout)
    reject(new Error('Could not connect to the CDP page target.'))
  }
})

try {
  await Promise.all([send('Page.enable'), send('Runtime.enable')])
  await send('Page.navigate', {url: 'about:blank'})
  const pageDeadline = Date.now() + 5_000
  while (Date.now() < pageDeadline) {
    const state = await send('Runtime.evaluate', {expression: 'document.readyState', returnByValue: true})
    if ((state.result as {value?: string} | undefined)?.value === 'complete') break
    await Bun.sleep(100)
  }
  consoleErrors.length = 0
  await Promise.all([send('Log.enable'), send('Network.enable')])
  const expression = `
    new Promise((resolve, reject) => {
      const socket = new WebSocket('wss://api.elevenlabs.io/v1/convai/conversation?agent_id=' + encodeURIComponent(${JSON.stringify(agentId)}));
      const eventTypes = [];
      let initialResponse = '';
      let followUpResponse = '';
      let audioChunks = 0;
      let toolAudioChunks = 0;
      let userMessageSent = false;
      const toolCalls = [];
      const finishWhenComplete = () => {
        if (!followUpResponse || toolCalls.length === 0 || audioChunks <= toolAudioChunks) return;
        clearTimeout(timeout);
        socket.close();
        resolve({connected: true, eventTypes: [...new Set(eventTypes)], initialResponse, followUpResponse, audioChunks, toolCalls});
      };
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('Voice provider timed out. Events: ' + eventTypes.join(', ')));
      }, 45000);
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('ElevenLabs WebSocket connection failed.'));
      };
      socket.onopen = () => socket.send(JSON.stringify({type: 'conversation_initiation_client_data'}));
      socket.onmessage = message => {
        const event = JSON.parse(String(message.data));
        if (event.type) eventTypes.push(event.type);
        if (event.type === 'ping' && event.ping_event?.event_id != null) {
          setTimeout(() => socket.send(JSON.stringify({type: 'pong', event_id: event.ping_event.event_id})), event.ping_event.ping_ms ?? 0);
        }
        if (event.type === 'agent_response') {
          const text = event.agent_response_event?.agent_response ?? '';
          if (!initialResponse) initialResponse = text;
          else if (toolCalls.length > 0) followUpResponse = text;
          if (!userMessageSent) {
            userMessageSent = true;
            socket.send(JSON.stringify({type: 'user_message', text: 'I need 30 kilograms of chicken.'}));
          }
          finishWhenComplete();
        }
        if (event.type === 'audio') {
          audioChunks += 1;
          finishWhenComplete();
        }
        if (event.type === 'client_tool_call') {
          const call = event.client_tool_call;
          toolCalls.push({name: call?.tool_name, parameters: call?.parameters});
          toolAudioChunks = audioChunks;
          const result = call?.tool_name === 'clarify_intake_details'
            ? JSON.stringify({ok: true, allClear: false, askNext: {field: 'halal', prompt: 'Is halal certification important for the chicken?', options: ['Halal required', 'No halal requirement']}, remaining: 2})
            : JSON.stringify({error: 'Unexpected tool in this test.'});
          socket.send(JSON.stringify({type: 'client_tool_result', tool_call_id: call?.tool_call_id, result, is_error: call?.tool_name !== 'clarify_intake_details'}));
        }
      };
    })
  `
  const evaluated = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})
  const exception = evaluated.exceptionDetails as {text?: string; exception?: {description?: string}} | undefined
  if (exception) throw new Error(exception.exception?.description ?? exception.text ?? 'Voice provider evaluation failed.')
  const result = (evaluated.result as {value?: {
    connected: boolean
    eventTypes: string[]
    initialResponse: string
    followUpResponse: string
    audioChunks: number
    toolCalls: Array<{name?: string; parameters?: Record<string, unknown>}>
  }} | undefined)?.value
  if (!result) throw new Error('CDP did not return a voice provider result.')

  console.log(JSON.stringify({...result, consoleErrors}, null, 2))
  if (!result.initialResponse.toLowerCase().includes('sarah')) throw new Error(`Unexpected first response: ${result.initialResponse}`)
  if (!result.toolCalls.some(call => call.name === 'clarify_intake_details')) throw new Error(`The agent did not invoke clarify_intake_details: ${JSON.stringify(result.toolCalls)}`)
  if (!/halal|certification/i.test(result.followUpResponse)) throw new Error(`The agent did not ask the expected follow-up: ${result.followUpResponse}`)
  if (consoleErrors.length) throw new Error(`CDP console errors:\n${consoleErrors.join('\n')}`)
} finally {
  for (const request of pending.values()) request.reject(new Error('CDP connection closed.'))
  socket.close()
}
