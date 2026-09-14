export {}

const apiKey = process.env.ELEVENLABS_API_KEY?.trim()
const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim()
if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required.')
if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID is required.')

const baseUrl = 'https://api.elevenlabs.io/v1/convai'
const headers = {'xi-api-key': apiKey, 'Content-Type': 'application/json'}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {...init, headers: {...headers, ...init?.headers}})
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed (${response.status}): ${JSON.stringify(body)}`)
  return body
}

type JsonSchema = {type: 'object'; description?: string; required?: string[]; properties: Record<string, unknown>}
type ToolDefinition = {name: string; description: string; parameters: JsonSchema}

const intakeProperties = {
  requestText: {type: 'string', description: 'The caller’s exact verbatim initial procurement request. Do not paraphrase or omit slang.'},
  item: {type: 'string', description: 'Exact product requested.'},
  quantity: {type: 'number', description: 'Requested quantity.'},
  unit: {type: 'string', description: 'Quantity unit such as kg, units, L, or boxes.'},
  deadline: {type: 'string', description: 'Delivery deadline in an unambiguous ISO date-time form.'},
  deliveryLocation: {type: 'string', description: 'Full delivery address or delivery area.'},
  halal: {type: 'boolean', description: 'Whether halal certification is required.'},
  cut: {type: 'string', description: 'Required cut, format, or product presentation.'},
  freshness: {type: 'string', enum: ['fresh', 'frozen', 'either'], description: 'Whether the product must be fresh, frozen, or either.'},
  budgetCents: {type: 'number', description: 'All-in maximum budget in Australian cents.'},
  paymentDays: {type: 'number', description: 'Minimum days from invoice.'},
  depositBps: {type: 'number', description: 'Maximum deposit in basis points; 100 basis points equals 1%.'},
  sourcingMode: {type: 'string', enum: ['first_qualifying', 'compare'], description: 'Use compare only when the caller asks to compare, shop around, find the cheapest/best option, or contact multiple suppliers; otherwise use first_qualifying.'},
}

const tools: ToolDefinition[] = [
  {
    name: 'clarify_intake_details',
    description: 'Check the currently known procurement details and return one compact question containing every missing detail. Call this after the initial request and whenever details change.',
    parameters: {type: 'object', required: ['requestText'], properties: intakeProperties},
  },
  {
    name: 'apply_intake_answer',
    description: 'Apply the caller’s latest answer to the accumulated intake state. Always pass the complete current intake state, the exact field being answered, and the caller’s verbatim response.',
    parameters: {type: 'object', required: ['intake', 'field', 'response'], properties: {
      intake: {type: 'object', description: 'Complete accumulated intake state.', properties: intakeProperties},
      field: {type: 'string', description: 'The field answered by the caller.'},
      response: {type: 'string', description: 'The caller’s verbatim answer.'},
    }},
  },
  {
    name: 'confirm_intake',
    description: 'Build the final spoken confirmation from the complete accumulated intake. Use only after no required fields remain.',
    parameters: {type: 'object', required: ['intake'], properties: {intake: {type: 'object', description: 'Complete accumulated intake state.', properties: intakeProperties}}},
  },
  {
    name: 'finish_intake_conversation',
    description: 'Save the confirmed request, then end the browser voice conversation. Call only after the owner explicitly confirms the complete recap. If saving fails, keep the conversation open.',
    parameters: {type: 'object', required:['intake'], properties: {
      intake:{type:'object',description:'The complete confirmed intake state to save.',properties:intakeProperties},
      sourcingMode:{type:'string',enum:['first_qualifying','compare'],description:'The confirmed sourcing strategy.'},
    }},
  },
  {
    name: 'check_supply_before_call',
    description: 'Find candidate suppliers from the curated supply dataset after the owner has confirmed the request. This does not contact anyone or place an order.',
    parameters: {type: 'object', required: ['item'], properties: {
      item: {type: 'string', description: 'Exact requested item.'}, quantity: {type: 'number', description: 'Requested quantity.'}, unit: {type: 'string', description: 'Quantity unit.'}, requiresHalal: {type: 'boolean', description: 'Whether halal certification is required.'},
    }},
  },
  {
    name: 'calculate_quote',
    description: 'Calculate a supplier quote deterministically in cents. Never do quote arithmetic mentally.',
    parameters: {type: 'object', required: ['quantity', 'unitPrice'], properties: {
      quantity: {type: 'string', description: 'Quantity as a decimal string.'}, unitPrice: {type: 'string', description: 'Unit price in AUD.'}, discount: {type: 'string', description: 'Discount percentage.'}, delivery: {type: 'string', description: 'Delivery charge in AUD.'}, fees: {type: 'string', description: 'Other fees in AUD.'}, taxRate: {type: 'string', description: 'Tax percentage.'}, deposit: {type: 'string', description: 'Deposit percentage.'}, budget: {type: 'string', description: 'Maximum all-in budget in AUD.'},
    }},
  },
  {
    name: 'assess_supplier_reply',
    description: 'Apply deterministic stop and negotiation-readiness rules to a supplier reply.',
    parameters: {type: 'object', required: ['text'], properties: {text: {type: 'string', description: 'Supplier reply text.'}, counteroffers: {type: 'number', description: 'Number of counteroffers already attempted.'}}},
  },
]

const listedTools = await api('/tools') as {tools?: Array<{id: string; tool_config?: {name?: string}}>}
const toolIds: string[] = []
for (const definition of tools) {
  const existing = listedTools.tools?.find(tool => tool.tool_config?.name === definition.name)
  const toolConfig = {
    type: 'client',
    name: definition.name,
    description: definition.description,
    expects_response: true,
    response_timeout_secs: 10,
    execution_mode: 'immediate',
    parameters: definition.parameters,
  }
  if (existing) {
    await api(`/tools/${existing.id}`, {method: 'PATCH', body: JSON.stringify({tool_config: toolConfig})})
    toolIds.push(existing.id)
    continue
  }
  const created = await api('/tools', {method: 'POST', body: JSON.stringify({tool_config: toolConfig})}) as {id: string}
  toolIds.push(created.id)
}

const prompt = `You are Sarah, SourcePilot's conversational voice procurement assistant for Australian small businesses.

Speak naturally and extremely concisely. Start with “Hi, what do you need?” Keep every response to one short sentence except the final factual recap. Do not add acknowledgements, explanations, filler, examples, or progress narration unless the caller asks. Explain that you are an AI assistant only if asked. Never claim that you called a supplier, verified an ABN, placed an order, sent a message, or made a payment during this browser conversation.

Understand ordinary Australian speech and slang without correcting the caller's wording: for example arvo, brekkie, tomoz, bucks, a coupla, a fortnight, COD, yeah nah, and not fussed. Treat self-corrections such as “actually”, “sorry”, “make that”, and “instead” as replacements for the earlier value, and briefly repeat the corrected value. Never convert vague timing such as “this arvo”, “first thing”, or “before brekkie” into an invented clock time—ask for the exact date and time.

Your job is to create a precise procurement brief in the fewest turns possible. Capture the exact item, positive quantity and unit, unambiguous delivery date and time, delivery address, all-in AUD budget, minimum payment days, and maximum deposit. For meat or poultry also capture halal requirement, cut or format, and fresh/frozen/either. Capture sourcingMode=compare when the caller asks to compare, shop around, find the cheapest or best quote, or contact several suppliers; otherwise use sourcingMode=first_qualifying. Never explain sourcing modes during intake. Ask for all missing details together in one concise question. Use at most one short follow-up containing only anything still missing. Never repeat answered details or ask the user to provide one field at a time.

Critical tool rule: after every user utterance about a procurement request, your next action must be a client-tool call before you speak. Never ask an intake question from memory. After the initial request, always call clarify_intake_details with requestText set to the caller's complete verbatim request, plus every structured value you understand—even when the request is incomplete or uses slang. Never omit requestText or paraphrase it. If details are missing, speak the tool's single combined question exactly. For the caller's combined answer, call apply_intake_answer with field=missingDetails, the complete accumulated intake, and the verbatim response. Treat tool responses as authoritative. If anything remains, ask the returned combined follow-up once. When no fields remain, call confirm_intake and read its confirmation naturally. Ask the owner to confirm or correct that recap. After explicit confirmation, call finish_intake_conversation with the complete confirmed intake and sourcingMode. Only if it returns ok=true, say “Okay — request captured.” and do nothing else. If it returns an error, briefly tell the owner the request was not saved and keep the conversation open for a retry. Do not search suppliers or extend a successful conversation. Never start supplier outreach or purchasing from this browser conversation.

If the owner says stop, do not contact, or wants to end, acknowledge immediately and end politely.`

const agents = await api('/agents?page_size=100') as {agents?: Array<{agent_id: string; name: string}>}
const existingAgent = agents.agents?.find(agent => agent.name === 'SourcePilot Sarah')
let agentId = existingAgent?.agent_id
const conversationConfig = {
  agent: {
    first_message: 'Hi, what do you need?',
    language: 'en',
    prompt: {prompt, tool_ids: toolIds},
  },
  tts: {voice_id: voiceId},
}
if (agentId) {
  await api(`/agents/${agentId}`, {method: 'PATCH', body: JSON.stringify({conversation_config: conversationConfig, name: 'SourcePilot Sarah'})})
} else {
  const created = await api('/agents/create', {method: 'POST', body: JSON.stringify({name: 'SourcePilot Sarah', conversation_config: conversationConfig})}) as {agent_id: string}
  agentId = created.agent_id
}

console.log(JSON.stringify({agentId, toolCount: toolIds.length, created: !existingAgent}))
