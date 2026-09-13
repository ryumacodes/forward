import { checkSupplies, type SupplyRequest } from './engine'
import { negotiationClientTools } from '../negotiation/agentTools'

export const supplyCheckClientTools = {
  ...negotiationClientTools,
  check_supply_before_call: (parameters: Partial<SupplyRequest>) => {
    const item = typeof parameters?.item === 'string' ? parameters.item.trim() : ''
    if (!item || item.length > 200) return JSON.stringify({error:'A supplier item is required (up to 200 characters).'})
    const quantity = parameters.quantity === undefined || parameters.quantity === null ? undefined : Number(parameters.quantity)
    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) return JSON.stringify({error:'Quantity must be a positive number.'})
    const unit = typeof parameters.unit === 'string' ? parameters.unit.trim().slice(0, 20) : undefined
    const requiresHalal = parameters.requiresHalal === true
    const results = checkSupplies({item, quantity, unit, requiresHalal})
    if (results.length === 0) return JSON.stringify({ok:true, results:[], note: requiresHalal ? 'No matching halal supplier found — say so honestly and offer to keep looking.' : 'No matching supplier found.'})
    return JSON.stringify({ok:true, results: results.map(result => ({
      supplier: result.lead.displayName,
      phone: result.lead.phone,
      website: result.lead.website,
      halal: result.lead.halal ?? false,
      matchScore: result.matchScore,
      supplyPages: result.supplyPages.map(page => page.url),
      callBrief: result.callBrief,
    }))})
  },
}