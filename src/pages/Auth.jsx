import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { NavalhaLogo, Eyebrow, PrimaryBtn, GhostBtn, Input, Card } from '../components/ui.jsx'
import { FONT, T, ACCENT } from '../tokens.js'

export default function Auth({ onAuth }) {
  const [mode, setMode]         = useState('login') // 'login' | 'signup'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [signupDone, setSignupDone] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) { setError(err.message); return }
    onAuth(data.session)
  }

  async function handleSignup(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('As senhas não coincidem.'); return }
    if (password.length < 6)  { setError('A senha precisa ter ao menos 6 caracteres.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSignupDone(true)
  }

  function toggleMode() {
    setMode(m => m === 'login' ? 'signup' : 'login')
    setError('')
    setSignupDone(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
          <NavalhaLogo size={36} />
        </div>

        <Card>
          <Eyebrow>{mode === 'login' ? 'Acesso' : 'Criar conta'}</Eyebrow>
          <h2 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: T.primary, marginBottom: 24, letterSpacing: '-0.02em' }}>
            {mode === 'login' ? 'Entre no painel.' : 'Comece agora.'}
          </h2>

          {signupDone ? (
            <div>
              <p style={{ fontFamily: FONT, fontSize: 14, color: T.muted, lineHeight: 1.6, marginBottom: 20 }}>
                Conta criada. Verifique seu e-mail para confirmar o cadastro e depois faça login.
              </p>
              <GhostBtn onClick={toggleMode}>← Ir para o login</GhostBtn>
            </div>
          ) : (
            <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>
              <Input
                label="E-mail"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Input
                label="Senha"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode === 'signup' && (
                <Input
                  label="Confirmar senha"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              )}
              {error && (
                <p style={{ fontFamily: FONT, fontSize: 13, color: '#F87171', marginBottom: 16 }}>{error}</p>
              )}
              <PrimaryBtn type="submit" disabled={loading}>
                {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
              </PrimaryBtn>
            </form>
          )}

          {!signupDone && (
            <p style={{ fontFamily: FONT, fontSize: 13, color: T.hint, textAlign: 'center', marginTop: 20 }}>
              {mode === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?'}{' '}
              <button
                onClick={toggleMode}
                style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: 0 }}
              >
                {mode === 'login' ? 'Criar conta' : 'Entrar'}
              </button>
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
