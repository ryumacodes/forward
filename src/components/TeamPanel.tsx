import { useState } from 'react'
import { Check, Phone, Plus, ShieldCheck, Users } from '../icons'
import type { OrgMember } from '../lib/supabase/workspace'

type TeamPanelProps = {
  members: OrgMember[]
  currentUserId?: string
  canManage: boolean
  onAddMember: (email: string) => Promise<string>
  onSavePhone: (phone: string) => Promise<void>
  onError: (message: string) => void
}

const roleLabel: Record<OrgMember['role'], string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

export function TeamPanel({ members, currentUserId, canManage, onAddMember, onSavePhone, onError }: TeamPanelProps) {
  const [invite, setInvite] = useState('')
  const [inviting, setInviting] = useState(false)
  const [phone, setPhone] = useState(() => members.find(member => member.userId === currentUserId)?.phone ?? '')
  const [savingPhone, setSavingPhone] = useState(false)
  const mine = members.find(member => member.userId === currentUserId)
  const sorted = [...members].sort((a, b) => (a.userId === currentUserId ? -1 : b.userId === currentUserId ? 1 : roleLabel[a.role].localeCompare(roleLabel[b.role])))

  async function addMember() {
    const email = invite.trim()
    if (!email || inviting) return
    setInviting(true)
    const message = await onAddMember(email)
    setInviting(false)
    if (message) { onError(message); return }
    setInvite('')
  }

  async function savePhone() {
    if (savingPhone) return
    setSavingPhone(true)
    try {
      await onSavePhone(phone)
      setPhone(phone.trim())
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save your phone number.')
    } finally {
      setSavingPhone(false)
    }
  }

  return <div className="team-block" role="group" aria-label="Organisation team">
    <div className="team-heading"><Users size={14}/><strong>Your team</strong><span>{members.length} {members.length === 1 ? 'person' : 'people'}</span></div>
    <div className="team-roster">{sorted.map(member => {
      const initials = (member.fullName || member.email || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
      return <div className="team-member" key={member.userId}><span className="team-avatar">{initials}</span><span className="team-member-name"><strong>{member.userId === currentUserId ? 'You' : member.fullName || member.email}</strong><small>{member.fullName && member.email && member.userId !== currentUserId ? member.email : roleLabel[member.role]}</small></span><em>{roleLabel[member.role]}</em></div>
    })}</div>
    <div className="team-phone"><Phone size={13}/><span><small>Sarah reaches you on</small><strong>{mine?.fullName || 'your'}</strong></span><input aria-label="Your phone number for Sarah" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+61… " inputMode="tel"/><button onClick={savePhone} disabled={savingPhone || phone === (mine?.phone ?? '')}>{savingPhone ? 'Saving…' : <Check size={13}/>}</button></div>
    {canManage && <div className="team-invite"><ShieldCheck size={13}/><span><small>Add someone by email</small><strong>They need a SourcePilot account</strong></span><input aria-label="Email of new team member" value={invite} onChange={event => setInvite(event.target.value)} placeholder="teammate@business.com" type="email" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addMember() } }}/><button onClick={addMember} disabled={inviting || !invite.trim()}>{inviting ? 'Adding…' : <Plus size={13}/>}</button></div>}
    <p className="team-note"><ShieldCheck size={12}/> Sarah only calls back the person who started a request.</p>
  </div>
}