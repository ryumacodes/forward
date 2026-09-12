import { calculateQuote, type QuoteInput } from './calculator'
import { assessConversation } from './signals'
/** Configure matching client tools on the ElevenLabs agent; these tools never place orders. */
export const negotiationClientTools = {
  calculate_quote: (parameters: QuoteInput) => {
    try { return JSON.stringify({ok:true,...calculateQuote(parameters)},(_,value) => typeof value === 'bigint' ? value.toString() : value) }
    catch(error) { return JSON.stringify({ok:false,error:error instanceof Error ? error.message : 'Invalid quote inputs'}) }
  },
  assess_supplier_reply: (parameters: {text: string; counteroffers?: number}) => {
    if (typeof parameters?.text !== 'string' || parameters.text.length > 10000 || (parameters.counteroffers !== undefined && (!Number.isInteger(parameters.counteroffers) || parameters.counteroffers < 0))) return JSON.stringify({error:'Invalid conversation inputs'})
    return JSON.stringify({...assessConversation(parameters.text,parameters.counteroffers),method:'tentative text cues',instruction:'Respect stop requests and price boundaries. Never use cues to pressure the supplier.'})
  },
}
