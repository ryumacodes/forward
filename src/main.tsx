import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthGate } from './lib/supabase/AuthGate'
import { LandingPage } from './components/LandingPage'
import './styles.css'
import './mobile.css'
import './requests.css'
import './intake.css'
import './registry.css'
import './landing.css'
import './polish.css'
function Root() {
  const [started,setStarted] = useState(false)
  if (!started) return <LandingPage onStart={() => setStarted(true)}/>
  return <AuthGate onBack={() => setStarted(false)}><App/></AuthGate>
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root/></React.StrictMode>)
