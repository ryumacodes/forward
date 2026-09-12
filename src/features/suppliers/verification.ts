export type ImportedSupplier = {
  id: string; name: string; abn: string; phone: string; importedAt: string;
  status: 'Awaiting registry check'; authorised: false;
}
export function checkAbn(value: string) {
  if (!/^[\d\s]+$/.test(value)) return false
  const digits = value.replace(/\s/g, '')
  if (!/^\d{11}$/.test(digits) || digits[0] === '0') return false
  return [...digits].reduce((total, digit, i) => total + (Number(digit) - (i === 0 ? 1 : 0)) * [10,1,3,5,7,9,11,13,15,17,19][i], 0) % 89 === 0
}
export function prepareSupplier(name: string, abn: string, phone: string, existing: ImportedSupplier[]): ImportedSupplier {
  const normalisedAbn = abn.replace(/\s/g, '')
  if (!name.trim()) throw new Error('Enter the supplier’s business name.')
  if (!checkAbn(abn)) throw new Error('This ABN does not pass the 11-digit checksum. Check it with the supplier.')
  if (!/^\+?[\d\s()-]{8,22}$/.test(phone) || phone.replace(/\D/g,'').length < 8) throw new Error('Enter a valid contact phone number.')
  if (existing.some(s => s.abn === normalisedAbn)) throw new Error('This ABN is already in your import queue.')
  return {id: crypto.randomUUID(), name:name.trim(), abn:normalisedAbn, phone:phone.trim(), importedAt:new Date().toISOString(), status:'Awaiting registry check', authorised:false}
}
export type RegistryEvidence = {active: boolean; legalName: string; checkedAt: string; source: 'ABR'; nameMatched: boolean; contactConfirmed: boolean}
export function eligibleForAuthorisation(evidence?: RegistryEvidence, now = Date.now()) {
  if (!evidence) return false
  const age = now - Date.parse(evidence.checkedAt)
  return evidence.source === 'ABR' && evidence.active && !!evidence.legalName.trim() && evidence.nameMatched && evidence.contactConfirmed && age >= 0 && age <= 86400000
}
