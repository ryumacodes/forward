import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { backendConfigError, supabase } from './client'
const UserContext = createContext<User | null>(null)
export const useOwner = () => useContext(UserContext)
export function AuthGate({children}:{children:ReactNode}) {
  const [user,setUser] = useState<User|null>(null)
  const [loading,setLoading] = useState(Boolean(supabase))
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  useEffect(() => {
    if(!supabase) return
    // INITIAL_SESSION and subsequent changes share one ordered subscription.
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session) => {setUser(session?.user ?? null);setLoading(false)})
    return () => subscription.unsubscribe()
  },[])
  if(backendConfigError) return <div className="auth-screen"><h1>Check Supabase settings</h1><p>Set both VITE_SUPABASE_URL (HTTPS) and VITE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…). Use a publishable key, never a secret key.</p></div>
  if(!supabase) return children
  if(loading) return <div className="auth-screen" role="status">Opening your workspace…</div>
  if(user) return <UserContext.Provider value={user}><div className="session-bar"><span>{user.email}</span><button onClick={async()=>{const {error}=await supabase!.auth.signOut();if(error)setError(error.message)}}>Sign out</button>{error && <span role="alert">{error}</span>}</div><div key={user.id}>{children}</div></UserContext.Provider>
  return <main className="auth-screen"><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const values=new FormData(e.currentTarget);try {const {error}=await supabase!.auth.signInWithPassword({email:String(values.get('email')),password:String(values.get('password'))});if(error)setError(error.message)}catch{setError('Could not reach Supabase. Try again.')}finally{setBusy(false)}}}><span className="eyebrow">BUSINESS WORKSPACE</span><h1>Welcome back.</h1><p>Sign in with your owner account.</p><label>Email<input name="email" type="email" autoComplete="username" required/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy?'Signing in…':'Sign in'}</button><p className="voice-message">Use an account created in your Supabase project. Public account registration is not enabled in this UI.</p></form></main>
}
