import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import Auth from './pages/Auth.jsx'
import Onboarding from './pages/Onboarding.jsx'
import Dashboard from './pages/Dashboard.jsx'
import { FullScreenSpinner } from './components/ui.jsx'
import './App.css'

// view: 'loading' | 'auth' | 'onboarding' | 'dashboard'
export default function App() {
  const [view, setView]   = useState('loading')
  const [owner, setOwner] = useState(null)

  async function loadOwner(userId) {
    const { data } = await supabase.from('owners').select('*').eq('id', userId).single()
    return data
  }

  async function resolveView(session) {
    if (!session) { setView('auth'); return }
    const ownerData = await loadOwner(session.user.id)
    if (!ownerData) { setView('auth'); return }
    setOwner(ownerData)
    setView(ownerData.slug ? 'dashboard' : 'onboarding')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => resolveView(session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveView(session)
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    await supabase.auth.signOut()
    setOwner(null)
    setView('auth')
  }

  if (view === 'loading') return <FullScreenSpinner />
  if (view === 'auth')    return <Auth onAuth={() => {}} />
  if (view === 'onboarding') return (
    <Onboarding owner={owner} onComplete={updated => { setOwner(updated); setView('dashboard') }} />
  )
  return <Dashboard owner={owner} onSignOut={handleSignOut} onOwnerUpdate={setOwner} />
}
