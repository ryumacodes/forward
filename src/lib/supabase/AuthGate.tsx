import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, ShieldCheck } from '../../icons'
import { VoiceOrb } from '../../components/VoiceOrb'
import { BrandMark } from '../../components/BrandMark'
import { backendConfigError, supabase } from './client'
const UserContext = createContext<User | null>(null)
export const useOwner = () => useContext(UserContext)
export function AuthGate({children,onBack}:{children:ReactNode;onBack?:()=>void}) {
  const [user,setUser] = useState<User|null>(null)
  const [loading,setLoading] = useState(Boolean(supabase))
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  useEffect(() => {
    if(!supabase) return
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session) => {setUser(session?.user ?? null);setLoading(false)})
    return () => subscription.unsubscribe()
  },[])
  if(backendConfigError) return <div className="auth-screen"><h1>Check Supabase settings</h1><p>Set both VITE_SUPABASE_URL (HTTPS) and VITE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…). Use a publishable key, never a secret key.</p></div>
  if(!supabase) return children
  if(loading) return <div className="auth-screen" role="status">Opening your workspace…</div>
  if(user) return <UserContext.Provider value={user}><div className="session-bar"><span>{user.email}</span><button onClick={async()=>{const {error}=await supabase!.auth.signOut();if(error)setError(error.message)}}>Sign out</button>{error && <span role="alert">{error}</span>}</div><div key={user.id}>{children}</div></UserContext.Provider>
  return <main className="auth-onboarding">
    <div className="auth-onboarding-brand"><BrandMark className="landing-mark"/><strong>sourcepilot<i>.</i></strong></div>
    {onBack && <button className="auth-back" onClick={onBack}><ArrowLeft size={15}/> Back</button>}
    <section className="auth-visual">
      <div className="auth-orb"><VoiceOrb/></div>
      <span className="auth-kicker">PRIVATE BUSINESS WORKSPACE</span>
      <h1>Your procurement<br/>agent is ready.</h1>
      <p>One secure place for supplier calls, quote evidence, and approvals.</p>
      <div className="auth-trust"><span><ShieldCheck size={14}/> Verified suppliers</span><span><LockKeyhole size={14}/> Owner-controlled orders</span></div>
    </section>
    <section className="auth-panel">
      <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const values=new FormData(e.currentTarget);try {const {error}=await supabase!.auth.signInWithPassword({email:String(values.get('email')),password:String(values.get('password'))});if(error)setError(error.message)}catch{setError('Could not reach Supabase. Try again.')}finally{setBusy(false)}}}>
        <span className="auth-form-kicker">WELCOME BACK</span>
        <h2>Enter your workspace</h2>
        <p>Sign in with your business owner account.</p>
        <label>Email address<div className="auth-field"><Mail size={16}/><input name="email" type="email" autoComplete="username" placeholder="you@business.com" required/></div></label>
        <label>Password<div className="auth-field"><LockKeyhole size={16}/><input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required/></div></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={busy}>{busy?'Opening workspace…':<>Continue securely <ArrowRight size={16}/></>}</button>
        <div className="auth-note"><ShieldCheck size={14}/><span>Your account is managed by your organisation. Public registration is disabled.</span></div>
      </form>
    </section>
  </main>
}
