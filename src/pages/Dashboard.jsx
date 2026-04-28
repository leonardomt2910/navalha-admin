import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  NavalhaLogo, Eyebrow, PrimaryBtn, SecBtn, GhostBtn, IconBtn,
  Badge, Card, Modal, Toast, Spinner, Divider, PageTitle, Input,
} from '../components/ui.jsx'
import { FONT, FONT_MONO, T, ACCENT, ACCENT_DIM, INK, INK2, HAIRLINE, RADIUS, STATUS_COLOR } from '../tokens.js'

// URL base do app de agendamento do cliente
const CLIENT_APP_URL = 'https://navalha-app.pages.dev'

// ── helpers ───────────────────────────────────────────────────────────────────
function today()        { return new Date().toISOString().split('T')[0] }
function fmtDateFull(d) { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) }
function fmtMonthYear(d){ return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
function fmtPrice(c)    { return `R$ ${(c / 100).toFixed(2).replace('.', ',')}` }
function centsToStr(c)  { return (c / 100).toFixed(2).replace('.', ',') }
function strToCents(v)  { return Math.round(parseFloat(v.replace(',', '.')) * 100) || 0 }
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function getFirstDay(y, m)    { return (new Date(y, m, 1).getDay() + 6) % 7 } // 0=Seg … 6=Dom
function softSlugify(v) { return v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }
function slugify(v)     { return softSlugify(v).replace(/^-+|-+$/g, '') }
function formatPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (!d.length) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
function phoneToDisplay(raw) {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  const local = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits
  return formatPhone(local)
}

const DIAS      = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const WEEK_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] // Mon-first

const TIME_SLOTS = Array.from({ length: 35 }, (_, i) => {
  const total = 360 + i * 30
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return `${h}:${m}`
})

const NAV = [
  { key: 'bookings',     label: 'Agendamentos',  short: 'Agenda',  icon: '◈' },
  { key: 'calendar',     label: 'Calendário',    short: 'Cal',     icon: '▦' },
  { key: 'reports',      label: 'Relatórios',    short: 'Relatos', icon: '▤' },
  { key: 'client-link',  label: 'Link do cliente', short: 'Link',  icon: '⇗' },
  { key: 'settings',     label: 'Configurações', short: 'Config',  icon: '◎' },
  { key: 'plans',        label: 'Planos',        short: 'Planos',  icon: '◇' },
]

// ── hook responsivo ───────────────────────────────────────────────────────────
function useIsMobile(bp = 680) {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => {
    const fn = () => setV(window.innerWidth < bp)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [bp])
  return v
}

// ── componentes locais ────────────────────────────────────────────────────────
function RefreshBtn({ onRefresh }) {
  const [state, setState] = useState('idle') // idle | loading | done

  async function handle() {
    if (state !== 'idle') return
    setState('loading')
    await onRefresh()
    setState('done')
    setTimeout(() => setState('idle'), 2000)
  }

  const label = state === 'loading' ? 'Atualizando...' : state === 'done' ? 'Atualizado' : 'Atualizar'
  const color = state === 'done' ? '#4ade80' : state === 'loading' ? T.hint : T.muted
  const borderColor = state === 'done' ? 'rgba(74,222,128,0.4)' : HAIRLINE

  return (
    <button onClick={handle} disabled={state !== 'idle'} title="Atualizar"
      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${borderColor}`, borderRadius: RADIUS, padding: '7px 14px', color, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', cursor: state !== 'idle' ? 'default' : 'pointer', transition: 'color 0.2s, border-color 0.2s' }}>
      <span style={{ fontSize: 14, display: 'inline-block', animation: state === 'loading' ? 'spin 1s linear infinite' : 'none' }}>↻</span>
      {label}
    </button>
  )
}

function TimeSelect({ value, onChange, placeholder = '—' }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '9px 10px', background: INK, border: `1px solid ${HAIRLINE}`, borderRadius: 8, color: value ? T.primary : T.hint, fontFamily: FONT_MONO, fontSize: 13, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}>
      <option value="" disabled>{placeholder}</option>
      {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}

function Toggle({ on, onChange }) {
  return (
    <div onClick={() => onChange(!on)} style={{ width: 38, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'background 0.2s', background: on ? ACCENT : 'rgba(235,188,99,0.15)', position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: on ? INK : T.hint, transition: 'left 0.2s' }} />
    </div>
  )
}

function SettingsTabs({ active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: INK2, borderRadius: RADIUS, padding: 4, border: `1px solid ${HAIRLINE}` }}>
      {[['profile', 'Perfil'], ['services', 'Serviços'], ['hours', 'Horários']].map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)} style={{ flex: 1, padding: '8px 12px', borderRadius: RADIUS - 4, border: 'none', cursor: 'pointer', background: active === key ? ACCENT : 'transparent', color: active === key ? INK : T.muted, fontFamily: FONT, fontWeight: active === key ? 700 : 400, fontSize: 13, transition: 'all 0.15s' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

// ── seção planos ──────────────────────────────────────────────────────────────
const PLANS = [
  {
    key: 'start',
    name: 'Start',
    price: 'R$ 69',
    period: '/mês',
    target: 'Solo — 1 barbeiro que quer parar de usar caderno e WhatsApp.',
    highlight: false,
    features: [
      'Agendamento online 24h',
      'Link público de agendamento',
      'Confirmação automática via WhatsApp',
      'Lembrete pré-horário via WhatsApp',
      '1 barbeiro',
      'Relatórios básicos',
      'Suporte por chat',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 'R$ 119',
    period: '/mês',
    target: 'Até 4 barbeiros — dono que quer profissionalizar a operação.',
    highlight: true,
    features: [
      'Tudo do Start',
      'Lembrete para clientes sem cortar há 45 dias',
      'Até 4 barbeiros',
      'Relatórios completos',
      'Suporte prioritário',
    ],
  },
  {
    key: 'scale',
    name: 'Scale',
    price: 'R$ 219',
    period: '/mês',
    target: '5+ barbeiros ou redes — para quem está crescendo.',
    highlight: false,
    features: [
      'Tudo do Pro',
      'Barbeiros ilimitados',
      'Relatórios completos + exportação',
      'Suporte dedicado',
    ],
  },
]

const SUPABASE_FUNCTIONS_URL = 'https://grgfmzueciolmdjeufwz.supabase.co/functions/v1'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZ2ZtenVlY2lvbG1kamV1Znd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNjQxMzksImV4cCI6MjA5MjY0MDEzOX0.lOYdvtdkXCYlYxjvJLjNZvZAoal0JW9yjaq-zLgmuNA'

const PLAN_LABEL = { free: 'Gratuito', pro: 'Start', premium: 'Pro', scale: 'Scale' }
const PLAN_KEY_MAP = { start: 'pro', pro: 'premium', scale: 'scale' }

function CpfCnpjModal({ onConfirm, onClose }) {
  const [doc, setDoc] = useState('')

  function formatDoc(v) {
    const d = v.replace(/\D/g, '').slice(0, 14)
    if (d.length <= 11)
      return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, e) =>
        [a, b, c].filter(Boolean).join('.') + (e ? '-' + e : ''))
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, dd, e) =>
      `${a}.${b}.${c}/${dd}` + (e ? '-' + e : ''))
  }

  return (
    <Modal onClose={onClose}>
      <Card>
        <Eyebrow>Dados de cobrança</Eyebrow>
        <h3 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: T.primary, marginBottom: 8 }}>
          Informe seu CPF ou CNPJ
        </h3>
        <p style={{ fontFamily: FONT, fontSize: 13, color: T.muted, marginBottom: 24 }}>
          Obrigatório para emissão das cobranças mensais.
        </p>
        <Input
          label="CPF / CNPJ"
          placeholder="000.000.000-00 ou 00.000.000/0000-00"
          value={doc}
          onChange={e => setDoc(formatDoc(e.target.value))}
          inputMode="numeric"
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <SecBtn onClick={onClose} style={{ flex: 1 }}>Cancelar</SecBtn>
          <PrimaryBtn
            onClick={() => doc.replace(/\D/g, '').length >= 11 && onConfirm(doc)}
            style={{ flex: 1, opacity: doc.replace(/\D/g, '').length < 11 ? 0.5 : 1 }}
          >
            Continuar
          </PrimaryBtn>
        </div>
      </Card>
    </Modal>
  )
}

function PlansSection({ owner }) {
  const [loading,   setLoading]   = useState(null)
  const [docModal,  setDocModal]  = useState(null) // planKey aguardando CPF/CNPJ

  const currentPlan = owner?.plan ?? 'free'

  async function handleSubscribe(planKey) {
    // Se já tem CPF/CNPJ salvo, vai direto; senão abre modal
    if (!owner?.cpf_cnpj) {
      setDocModal(planKey)
      return
    }
    await checkout(planKey, owner.cpf_cnpj)
  }

  async function checkout(planKey, cpfCnpj) {
    setDocModal(null)
    setLoading(planKey)
    try {
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ ownerId: owner.id, planKey, cpfCnpj }),
      })
      const data = await res.json()
      if (data.paymentUrl) {
        window.open(data.paymentUrl, '_blank')
      } else {
        alert(data.error || 'Não foi possível gerar o link de pagamento.')
      }
    } catch {
      alert('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(null)
    }
  }

  const isActive = (planKey) => currentPlan === PLAN_KEY_MAP[planKey]

  return (
    <div>
      {docModal && (
        <CpfCnpjModal
          onClose={() => setDocModal(null)}
          onConfirm={cpfCnpj => checkout(docModal, cpfCnpj)}
        />
      )}

      <PageTitle>Planos</PageTitle>

      {/* plano atual */}
      {currentPlan !== 'free' && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(235,188,99,0.08)', border: `1px solid rgba(235,188,99,0.25)`, borderRadius: RADIUS, padding: '10px 16px', marginBottom: 28 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Plano atual</span>
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: T.primary }}>{PLAN_LABEL[currentPlan]}</span>
          {owner?.plan_expires_at && (
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.hint }}>
              · renova em {new Date(owner.plan_expires_at).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
      )}

      <p style={{ fontFamily: FONT, fontSize: 14, color: T.muted, marginBottom: 32, maxWidth: 560 }}>
        Escolha o plano ideal para a sua barbearia. O acesso é liberado imediatamente após o pagamento.
      </p>

      {/* cards de plano */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        {PLANS.map(plan => {
          const active = isActive(plan.key)
          const busy   = loading === plan.key
          return (
            <div key={plan.key} style={{
              background: plan.highlight ? 'rgba(235,188,99,0.06)' : INK2,
              border: `1px solid ${active ? ACCENT : plan.highlight ? ACCENT : HAIRLINE}`,
              borderRadius: RADIUS,
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}>
              {plan.highlight && !active && (
                <div style={{
                  position: 'absolute', top: -1, right: 20,
                  background: ACCENT, color: INK,
                  fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  padding: '3px 10px', borderRadius: '0 0 6px 6px',
                }}>Recomendado</div>
              )}
              {active && (
                <div style={{
                  position: 'absolute', top: -1, right: 20,
                  background: ACCENT, color: INK,
                  fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  padding: '3px 10px', borderRadius: '0 0 6px 6px',
                }}>Plano ativo</div>
              )}

              <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: plan.highlight ? ACCENT : T.hint, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>{plan.name}</p>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 6 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 32, fontWeight: 700, color: T.primary }}>{plan.price}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.hint }}>{plan.period}</span>
              </div>

              <p style={{ fontFamily: FONT, fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 24, minHeight: 48 }}>{plan.target}</p>
              <div style={{ width: '100%', height: 1, background: HAIRLINE, marginBottom: 20 }} />

              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, marginBottom: 28 }}>
                {plan.features.map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: ACCENT, marginTop: 2, flexShrink: 0 }}>—</span>
                    <span style={{ fontFamily: FONT, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => !active && handleSubscribe(plan.key)}
                disabled={active || busy}
                style={{
                  display: 'block', width: '100%', textAlign: 'center',
                  padding: '12px 0',
                  background: active ? 'transparent' : plan.highlight ? ACCENT : 'transparent',
                  border: `1px solid ${active ? ACCENT : plan.highlight ? ACCENT : HAIRLINE}`,
                  borderRadius: RADIUS,
                  color: active ? ACCENT : plan.highlight ? INK : T.primary,
                  fontFamily: FONT, fontWeight: 700, fontSize: 14,
                  cursor: active ? 'default' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {busy ? 'Aguarde...' : active ? 'Plano ativo' : 'Assinar'}
              </button>
            </div>
          )
        })}
      </div>

    </div>
  )
}

// ── seção agendamentos ─────────────────────────────────────────────────────────
function BookingsSection({ bookings, loading, updateStatus, deleteBooking, onRefresh }) {
  const isMobile = useIsMobile()
  const [filterDate,   setFilterDate]   = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [detail,       setDetail]       = useState(null)

  const filtered = bookings.filter(b => {
    const matchDate   = !filterDate || b.date === filterDate
    const matchStatus = filterStatus === 'all' || b.status === filterStatus
    return matchDate && matchStatus
  })

  const thStyle = { fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 16px', textAlign: 'left', borderBottom: `1px solid ${HAIRLINE}`, whiteSpace: 'nowrap' }
  const tdStyle = { padding: '14px 16px', fontFamily: FONT, fontSize: 13, color: T.primary, borderBottom: `1px solid ${HAIRLINE}` }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: T.primary, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>Agendamentos</h1>
        <RefreshBtn onRefresh={onRefresh} />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Data</p>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ padding: '10px 12px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, color: T.primary, fontFamily: FONT_MONO, fontSize: 13, colorScheme: 'dark', cursor: 'pointer' }} />
        </div>
        <div>
          <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Status</p>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '10px 12px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, color: T.primary, fontFamily: FONT, fontSize: 13, cursor: 'pointer' }}>
            <option value="all">Todos</option>
            <option value="confirmed">Confirmado</option>
            <option value="rejected">Cancelado</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <GhostBtn onClick={() => { setFilterDate(''); setFilterStatus('all') }}>Limpar filtros</GhostBtn>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <p style={{ fontFamily: FONT, fontSize: 14, color: T.hint, padding: '40px 0', textAlign: 'center' }}>Nenhum agendamento encontrado.</p>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, cursor: 'pointer' }} onClick={() => setDetail(b)}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 600, color: ACCENT, minWidth: 48 }}>{b.hour?.slice(0, 5)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary, marginBottom: 2 }}>{b.client_name}</p>
                <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted }}>{b.services?.name ?? '—'} · {new Date(b.date + 'T12:00:00').toLocaleDateString('pt-BR')} · {phoneToDisplay(b.client_phone)}</p>
              </div>
              <Badge status={b.status} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(235,188,99,0.04)' }}>
                <th style={thStyle}>Horário</th>
                <th style={thStyle}>Cliente</th>
                <th style={thStyle}>Serviço</th>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Telefone</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <tr key={b.id} onClick={() => setDetail(b)}
                  style={{ cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(235,188,99,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}>
                  <td style={{ ...tdStyle, fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: ACCENT }}>{b.hour?.slice(0, 5)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{b.client_name}</td>
                  <td style={{ ...tdStyle, color: T.muted }}>{b.services?.name ?? '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: FONT_MONO, fontSize: 12, color: T.muted }}>{new Date(b.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td style={{ ...tdStyle, fontFamily: FONT_MONO, fontSize: 12, color: T.muted }}>{phoneToDisplay(b.client_phone)}</td>
                  <td style={tdStyle}><Badge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <Modal onClose={() => setDetail(null)}>
          <Card>
            <Eyebrow>Detalhes do agendamento</Eyebrow>
            <h3 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: T.primary, marginBottom: 20 }}>{detail.client_name}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                ['Serviço',  detail.services?.name ?? '—'],
                ['Data',     fmtDateFull(detail.date)],
                ['Horário',  detail.hour?.slice(0, 5)],
                ['Telefone', detail.client_phone],
                ['Status',   <Badge key="s" status={detail.status} />],
                detail.notes && ['Obs.', detail.notes],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
                  <span style={{ fontFamily: FONT, fontSize: 14, color: T.primary }}>{value}</span>
                </div>
              ))}
            </div>
            <Divider />
            <div style={{ display: 'flex', gap: 8 }}>
              {detail.status !== 'rejected' && (
                <SecBtn onClick={() => { updateStatus(detail.id, 'rejected'); setDetail(null) }} style={{ flex: 1 }}>Cancelar agendamento</SecBtn>
              )}
              <IconBtn danger onClick={() => { deleteBooking(detail.id); setDetail(null) }}>Remover</IconBtn>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  )
}

// ── helpers de semana ─────────────────────────────────────────────────────────
const MES_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function getMondayOfCurrentWeek() {
  const now = new Date()
  const dow  = now.getDay() // 0=Dom…6=Sáb
  const diff = dow === 0 ? -6 : 1 - dow // distância até segunda
  const m    = new Date(now)
  m.setDate(now.getDate() + diff)
  m.setHours(12, 0, 0, 0)
  return m
}

function getWeekDays(offset) {
  const monday = getMondayOfCurrentWeek()
  monday.setDate(monday.getDate() + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── pill de agendamento (calendário semanal) ──────────────────────────────────
function BookingPill({ b, onClick }) {
  const borderColor = STATUS_COLOR[b.status] || HAIRLINE
  return (
    <div
      onClick={onClick}
      style={{
        padding: '5px 8px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${HAIRLINE}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 8,
        cursor: 'pointer',
        marginBottom: 4,
      }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: ACCENT, fontWeight: 600, lineHeight: 1.3 }}>
        {b.hour?.slice(0, 5)}
      </div>
      <div style={{ fontFamily: FONT, fontSize: 11, color: T.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
        {b.client_name}
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
        {b.services?.name ?? '—'}
      </div>
    </div>
  )
}

// ── seção calendário ──────────────────────────────────────────────────────────
function CalendarSection({ bookings, updateStatus, onRefresh }) {
  const isMobile = useIsMobile()
  const [weekOffset, setWeekOffset] = useState(0)  // 0 = semana atual
  const [selDay,     setSelDay]     = useState(null)
  const [detail,     setDetail]     = useState(null)

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])
  const todayStr = today()

  // Ao trocar de semana: seleciona hoje (se estiver na semana) ou segunda
  useEffect(() => {
    const todayInWeek = weekDays.find(d => toDateStr(d) === todayStr)
    setSelDay(todayInWeek || weekDays[0])
  }, [weekOffset]) // eslint-disable-line

  function bookingsForDate(d) {
    return bookings
      .filter(b => b.date === toDateStr(d))
      .sort((a, b) => (a.hour > b.hour ? 1 : -1))
  }

  const wStart    = weekDays[0]
  const wEnd      = weekDays[6]
  const weekLabel = `${wStart.getDate()} ${MES_ABBR[wStart.getMonth()]} – ${wEnd.getDate()} ${MES_ABBR[wEnd.getMonth()]} ${wEnd.getFullYear()}`

  const selDayStr      = selDay ? toDateStr(selDay) : null
  const selDayBookings = selDayStr
    ? bookings.filter(b => b.date === selDayStr).sort((a, b) => (a.hour > b.hour ? 1 : -1))
    : []

  // ── navegação de semana ────────────────────────────────────────────────────
  const WeekNav = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      <button
        onClick={() => setWeekOffset(w => w - 1)}
        style={{ background: 'none', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '6px 14px', color: T.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
      >←</button>

      <div style={{ flex: 1, textAlign: 'center' }}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.primary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {weekLabel}
        </p>
        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            style={{ background: 'none', border: 'none', color: ACCENT, fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.12em', cursor: 'pointer', padding: '2px 0', marginTop: 2, textDecoration: 'underline', textUnderlineOffset: 2 }}
          >SEMANA ATUAL</button>
        )}
      </div>

      <button
        onClick={() => setWeekOffset(w => w + 1)}
        style={{ background: 'none', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '6px 14px', color: T.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
      >→</button>
    </div>
  )

  return (
    <div>
      {/* cabeçalho da seção */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: T.primary, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>Calendário</h1>
        <RefreshBtn onRefresh={onRefresh} />
      </div>

      {WeekNav}

      {isMobile ? (
        /* ── MOBILE: strip de 7 dias + painel de detalhes ── */
        <>
          {/* strip horizontal de dias */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 20 }}>
            {weekDays.map((d, i) => {
              const bks     = bookingsForDate(d)
              const ds      = toDateStr(d)
              const isToday = ds === todayStr
              const isSel   = selDay && toDateStr(selDay) === ds
              const hasPending = bks.some(b => b.status === 'pending')
              return (
                <div
                  key={i}
                  onClick={() => setSelDay(d)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '8px 4px', borderRadius: RADIUS,
                    border: `1px solid ${isSel ? ACCENT : isToday ? 'rgba(235,188,99,0.3)' : 'transparent'}`,
                    background: isSel ? ACCENT_DIM : 'transparent',
                    cursor: 'pointer', transition: 'background 0.15s', userSelect: 'none',
                  }}
                >
                  <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: isSel ? ACCENT : T.hint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {WEEK_LABELS[i]}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 700, color: isSel || isToday ? ACCENT : T.primary, lineHeight: 1 }}>
                    {d.getDate()}
                  </span>
                  {bks.length > 0 ? (
                    <div style={{ fontFamily: FONT_MONO, fontSize: 8, fontWeight: 700, background: hasPending ? STATUS_COLOR.pending : STATUS_COLOR.confirmed, color: INK, borderRadius: 4, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>
                      {bks.length}
                    </div>
                  ) : (
                    <div style={{ height: 14 }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* lista do dia selecionado */}
          {selDay && (
            <div>
              <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary, marginBottom: 12, textTransform: 'capitalize' }}>
                {selDay.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                {selDayBookings.length > 0 && (
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.hint, fontWeight: 400, marginLeft: 8 }}>
                    {selDayBookings.length} agend.
                  </span>
                )}
              </p>
              {selDayBookings.length === 0 ? (
                <p style={{ fontFamily: FONT, fontSize: 14, color: T.hint, textAlign: 'center', padding: '32px 0' }}>
                  Sem agendamentos.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selDayBookings.map(b => (
                    <div
                      key={b.id}
                      onClick={() => setDetail(b)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: INK2, border: `1px solid ${HAIRLINE}`, borderLeft: `3px solid ${STATUS_COLOR[b.status] || HAIRLINE}`, borderRadius: RADIUS, cursor: 'pointer' }}
                    >
                      <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 600, color: ACCENT, minWidth: 44 }}>
                        {b.hour?.slice(0, 5)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary }}>{b.client_name}</p>
                        <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted }}>{b.services?.name ?? '—'}</p>
                      </div>
                      <Badge status={b.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* ── DESKTOP: grid de 7 colunas com scroll interno ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, alignItems: 'start' }}>
          {weekDays.map((d, i) => {
            const bks        = bookingsForDate(d)
            const ds         = toDateStr(d)
            const isToday    = ds === todayStr
            const hasPending = bks.some(b => b.status === 'pending')
            return (
              <div
                key={i}
                style={{
                  background: INK2,
                  border: `1px solid ${isToday ? 'rgba(235,188,99,0.4)' : HAIRLINE}`,
                  borderRadius: RADIUS,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 120,
                }}
              >
                {/* cabeçalho do dia */}
                <div style={{
                  padding: '10px 8px 8px',
                  borderBottom: `1px solid ${HAIRLINE}`,
                  background: isToday ? 'rgba(235,188,99,0.06)' : 'transparent',
                  textAlign: 'center',
                  flexShrink: 0,
                }}>
                  <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: isToday ? ACCENT : T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                    {WEEK_LABELS[i]}
                  </p>
                  <p style={{ fontFamily: FONT_MONO, fontSize: 20, fontWeight: 700, color: isToday ? ACCENT : T.primary, lineHeight: 1 }}>
                    {d.getDate()}
                  </p>
                  {bks.length > 0 && (
                    <div style={{ marginTop: 5, fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, color: INK, background: hasPending ? STATUS_COLOR.pending : STATUS_COLOR.confirmed, borderRadius: 4, display: 'inline-block', padding: '1px 6px' }}>
                      {bks.length}
                    </div>
                  )}
                </div>

                {/* lista de agendamentos — scroll se muitos */}
                <div style={{ padding: '8px 6px', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', flex: 1 }}>
                  {bks.length === 0 ? (
                    <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: 'rgba(245,234,208,0.18)', textAlign: 'center', padding: '14px 0' }}>—</p>
                  ) : (
                    bks.map(b => <BookingPill key={b.id} b={b} onClick={() => setDetail(b)} />)
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* modal de detalhes */}
      {detail && (
        <Modal onClose={() => setDetail(null)}>
          <Card>
            <Eyebrow>Detalhes do agendamento</Eyebrow>
            <h3 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: T.primary, marginBottom: 20 }}>
              {detail.client_name}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                ['Serviço',  detail.services?.name ?? '—'],
                ['Data',     fmtDateFull(detail.date)],
                ['Horário',  detail.hour?.slice(0, 5)],
                ['Telefone', phoneToDisplay(detail.client_phone)],
                ['Status',   <Badge key="s" status={detail.status} />],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
                  <span style={{ fontFamily: FONT, fontSize: 14, color: T.primary }}>{value}</span>
                </div>
              ))}
            </div>
            <Divider />
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {detail.status !== 'rejected' && (
                <SecBtn onClick={() => { updateStatus(detail.id, 'rejected'); setDetail(null) }} style={{ flex: 1 }}>
                  Cancelar agendamento
                </SecBtn>
              )}
              <GhostBtn onClick={() => setDetail(null)}>Fechar</GhostBtn>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  )
}

// ── seção relatórios ──────────────────────────────────────────────────────────
function ReportsSection({ bookings, onRefresh }) {
  const confirmed = bookings.filter(b => b.status === 'confirmed' || b.status === 'manual')
  const monthPfx  = today().slice(0, 7)
  const thisMonth = bookings.filter(b => b.date.startsWith(monthPfx))
  const revenue   = confirmed.filter(b => b.date.startsWith(monthPfx)).reduce((sum, b) => sum + (b.services?.price_cents ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: T.primary, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>Relatórios</h1>
        <RefreshBtn onRefresh={onRefresh} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          ['Total este mês',        thisMonth.length,                                                      'agendamentos'],
          ['Confirmados este mês',   confirmed.filter(b => b.date.startsWith(monthPfx)).length,            'agendamentos'],
          ['Faturamento estimado',   fmtPrice(revenue),                                                    'este mês (confirmados)'],
          ['Total geral',            bookings.filter(b => b.status === 'confirmed' || b.status === 'manual').length, 'agendamentos confirmados'],
        ].map(([label, value, sub]) => (
          <Card key={label}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{label}</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: 28, fontWeight: 600, color: ACCENT, marginBottom: 4 }}>{value}</p>
            <p style={{ fontFamily: FONT, fontSize: 12, color: T.muted }}>{sub}</p>
          </Card>
        ))}
      </div>
      <p style={{ fontFamily: FONT, fontSize: 13, color: T.hint }}>Relatórios detalhados em breve.</p>
    </div>
  )
}

// ── seção link do cliente ─────────────────────────────────────────────────────
function ClientLinkSection({ owner, showToast }) {
  const clientUrl = `${CLIENT_APP_URL}/${owner.slug}`

  if (!owner.slug) return (
    <div>
      <PageTitle>Link do cliente</PageTitle>
      <p style={{ fontFamily: FONT, fontSize: 13, color: T.hint }}>Configure um slug em Configurações para gerar seu link.</p>
    </div>
  )

  return (
    <div>
      <PageTitle>Link do cliente</PageTitle>
      <p style={{ fontFamily: FONT, fontSize: 14, color: T.muted, marginBottom: 24, maxWidth: 560 }}>
        Compartilhe este link para seus clientes fazerem agendamentos.
      </p>
      <div style={{ background: `${ACCENT}12`, border: `1px solid ${ACCENT}40`, borderRadius: RADIUS, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: ACCENT, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10 }}>Link de agendamento</p>
          <p style={{ fontFamily: FONT_MONO, fontSize: 14, color: T.primary, wordBreak: 'break-all', marginBottom: 0 }}>{clientUrl}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => navigator.clipboard?.writeText(clientUrl).then(() => showToast('Link copiado.'))}
            style={{ background: ACCENT, border: 'none', borderRadius: RADIUS - 4, padding: '10px 20px', color: INK, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
            Copiar
          </button>
          <a href={clientUrl} target="_blank" rel="noreferrer"
            style={{ border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS - 4, padding: '9px 16px', color: T.muted, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Abrir
          </a>
        </div>
      </div>
    </div>
  )
}

// ── seção configurações ───────────────────────────────────────────────────────
function SettingsSection({ owner, services, hoursConfig, onOwnerUpdate, onServicesChange, onHoursChange, showToast }) {
  const [tab, setTab] = useState('profile')

  // ── perfil ─────────────────────────────────────────────────────────────────
  const [profName,     setProfName]     = useState(owner.name || '')
  const [profSlug,     setProfSlug]     = useState(owner.slug || '')
  const [profWhatsapp, setProfWhatsapp] = useState(phoneToDisplay(owner.whatsapp))
  const [authEmail,    setAuthEmail]    = useState('')
  const [slugStatus,   setSlugStatus]   = useState('idle')
  const [profSaving,   setProfSaving]   = useState(false)
  const slugTimer = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthEmail(data?.user?.email || ''))
  }, [])

  useEffect(() => {
    if (!profSlug || profSlug.length < 3 || profSlug === owner.slug) {
      setSlugStatus(profSlug === owner.slug ? 'same' : 'idle'); return
    }
    setSlugStatus('checking')
    clearTimeout(slugTimer.current)
    slugTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('owners').select('id').eq('slug', profSlug).neq('id', owner.id).maybeSingle()
      setSlugStatus(data ? 'taken' : 'available')
    }, 500)
    return () => clearTimeout(slugTimer.current)
  }, [profSlug, owner.slug, owner.id])

  async function saveProfile() {
    if (!profName.trim() || slugStatus === 'taken') return
    setProfSaving(true)
    const rawPhone = profWhatsapp.replace(/\D/g, '')
    const { data, error } = await supabase.from('owners')
      .update({ name: profName.trim(), slug: slugify(profSlug), whatsapp: rawPhone })
      .eq('id', owner.id).select().single()
    setProfSaving(false)
    if (error) { showToast('Erro ao salvar perfil.', 'error'); return }
    onOwnerUpdate(data)
    showToast('Perfil atualizado.')
  }

  const clientUrl  = `${CLIENT_APP_URL}/${profSlug || owner.slug}`
  const slugHint   = { idle: 'URL pública do app de agendamento.', same: clientUrl, checking: 'Verificando...', available: `✓ Disponível — ${clientUrl}`, taken: 'Slug já em uso.' }[slugStatus]
  const slugError  = slugStatus === 'taken' ? slugHint : ''
  const profileValid = profName.trim().length >= 2 && profSlug.length >= 3 && slugStatus !== 'taken' && slugStatus !== 'checking'

  // ── serviços ───────────────────────────────────────────────────────────────
  const [localSvcs, setLocalSvcs] = useState(services)
  const [editIdx,   setEditIdx]   = useState(null)
  const [editForm,  setEditForm]  = useState({})
  const [svcSaving, setSvcSaving] = useState(false)

  useEffect(() => { setLocalSvcs(services) }, [services])

  function startEdit(idx) {
    setEditIdx(idx)
    setEditForm({ ...localSvcs[idx], priceStr: centsToStr(localSvcs[idx].price_cents) })
  }

  async function saveEdit() {
    const svc = localSvcs[editIdx]
    const updated = { name: editForm.name.trim(), price_cents: strToCents(editForm.priceStr), duration_min: editForm.duration_min }
    setSvcSaving(true)
    if (svc.id) {
      const { error } = await supabase.from('services').update(updated).eq('id', svc.id)
      if (error) { showToast('Erro ao salvar serviço.', 'error'); setSvcSaving(false); return }
    } else {
      const { data, error } = await supabase.from('services').insert({ ...updated, owner_id: owner.id, sort_order: editIdx }).select().single()
      if (error) { showToast('Erro ao salvar serviço.', 'error'); setSvcSaving(false); return }
      const next = [...localSvcs]; next[editIdx] = data; setLocalSvcs(next)
      onServicesChange(); setEditIdx(null); setSvcSaving(false); return
    }
    setSvcSaving(false); onServicesChange(); setEditIdx(null)
    showToast('Serviço salvo.')
  }

  async function removeService(idx) {
    const svc = localSvcs[idx]
    if (!confirm(`Remover "${svc.name}"?`)) return
    if (svc.id) {
      const { error } = await supabase.from('services').delete().eq('id', svc.id)
      if (error) { showToast('Erro ao remover.', 'error'); return }
    }
    setLocalSvcs(s => s.filter((_, i) => i !== idx))
    if (editIdx === idx) setEditIdx(null)
    onServicesChange(); showToast('Serviço removido.')
  }

  function addService() {
    const blank = { name: '', price_cents: 0, duration_min: 30 }
    setLocalSvcs(s => [...s, blank])
    setEditIdx(localSvcs.length)
    setEditForm({ ...blank, priceStr: '0,00' })
  }

  // ── horários ───────────────────────────────────────────────────────────────
  const [localHours,  setLocalHours]  = useState(hoursConfig)
  const [hoursSaving, setHoursSaving] = useState(false)

  useEffect(() => { setLocalHours(hoursConfig) }, [hoursConfig])

  function setHourField(wd, field, val) {
    setLocalHours(h => ({ ...h, [wd]: { ...h[wd], [field]: val } }))
  }

  function addBlockedRange(wd) {
    setLocalHours(h => ({ ...h, [wd]: { ...h[wd], blocked_ranges: [...(h[wd]?.blocked_ranges || []), { start: '', end: '' }] } }))
  }

  function removeBlockedRange(wd, idx) {
    setLocalHours(h => ({ ...h, [wd]: { ...h[wd], blocked_ranges: (h[wd]?.blocked_ranges || []).filter((_, i) => i !== idx) } }))
  }

  function updateBlockedRange(wd, idx, field, val) {
    setLocalHours(h => ({
      ...h, [wd]: {
        ...h[wd],
        blocked_ranges: (h[wd]?.blocked_ranges || []).map((r, i) => i === idx ? { ...r, [field]: val } : r),
      },
    }))
  }

  async function saveHours() {
    setHoursSaving(true)
    for (const [wd, cfg] of Object.entries(localHours)) {
      const validRanges = (cfg.blocked_ranges || []).filter(r => r.start && r.end)
      const payload = {
        open:            cfg.open,
        morning_start:   cfg.open ? cfg.morning_start   || null : null,
        morning_end:     cfg.open ? cfg.morning_end     || null : null,
        afternoon_start: cfg.open ? cfg.afternoon_start || null : null,
        afternoon_end:   cfg.open ? cfg.afternoon_end   || null : null,
        blocked_ranges:  cfg.open ? validRanges : [],
      }
      if (cfg.id) {
        await supabase.from('hours_config').update(payload).eq('id', cfg.id)
      } else {
        await supabase.from('hours_config').insert({ ...payload, owner_id: owner.id, weekday: parseInt(wd) })
      }
    }
    setHoursSaving(false); onHoursChange(); showToast('Horários salvos.')
  }

  const labelStyle = { fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageTitle>Configurações</PageTitle>
      <SettingsTabs active={tab} onChange={setTab} />

      {/* PERFIL */}
      {tab === 'profile' && (
        <div style={{ maxWidth: 480 }}>
          <Input label="Nome da barbearia" value={profName} onChange={e => setProfName(e.target.value)} placeholder="Barbearia do João" />
          <Input label="Slug (URL)" value={profSlug}
            onChange={e => setProfSlug(softSlugify(e.target.value))}
            onBlur={e => setProfSlug(slugify(e.target.value))}
            placeholder="joao-barbearia"
            hint={!slugError ? slugHint : ''} error={slugError} />
          {authEmail && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>E-mail da conta</p>
              <div style={{ padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, fontFamily: FONT, fontSize: 14, color: T.muted }}>{authEmail}</div>
            </div>
          )}
          <Input label="WhatsApp" placeholder="(XX) XXXXX-XXXX" value={profWhatsapp}
            onChange={e => setProfWhatsapp(formatPhone(e.target.value))} inputMode="numeric"
            hint="Número para receber notificações de agendamento." />
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint }}>Plano: <span style={{ color: ACCENT }}>{owner.plan}</span></p>
          </div>
          <Divider style={{ margin: '20px 0' }} />
          <PrimaryBtn disabled={!profileValid || profSaving} onClick={saveProfile}>
            {profSaving ? 'Salvando...' : 'Salvar perfil'}
          </PrimaryBtn>
        </div>
      )}

      {/* SERVIÇOS */}
      {tab === 'services' && (
        <div style={{ maxWidth: 520 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {localSvcs.map((svc, idx) => (
              <div key={idx}>
                {editIdx === idx ? (
                  <Card style={{ padding: 16 }}>
                    <Input label="Nome" placeholder="Corte" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Input label="Preço (R$)" placeholder="40,00" value={editForm.priceStr} onChange={e => setEditForm(f => ({ ...f, priceStr: e.target.value }))} />
                      <Input label="Duração (min)" type="number" placeholder="30" value={editForm.duration_min} onChange={e => setEditForm(f => ({ ...f, duration_min: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <SecBtn onClick={() => { setEditIdx(null); if (!svc.id) setLocalSvcs(s => s.filter((_, i) => i !== idx)) }} style={{ flex: 1 }}>Cancelar</SecBtn>
                      <PrimaryBtn onClick={saveEdit} disabled={!editForm.name?.trim() || svcSaving} style={{ flex: 2 }}>{svcSaving ? 'Salvando...' : 'Salvar'}</PrimaryBtn>
                    </div>
                  </Card>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary }}>{svc.name || '(sem nome)'}</p>
                      <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted, marginTop: 2 }}>{fmtPrice(svc.price_cents)} · {svc.duration_min}min</p>
                    </div>
                    <IconBtn onClick={() => startEdit(idx)}>editar</IconBtn>
                    <IconBtn onClick={() => removeService(idx)} danger>×</IconBtn>
                  </div>
                )}
              </div>
            ))}
          </div>
          <GhostBtn onClick={addService} style={{ color: ACCENT }}>+ Adicionar serviço</GhostBtn>
        </div>
      )}

      {/* HORÁRIOS */}
      {tab === 'hours' && (
        <div style={{ maxWidth: 600 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
            {DIAS.map((dia, wd) => {
              const cfg    = localHours[wd] || { open: false, morning_start: '', morning_end: '', afternoon_start: '', afternoon_end: '', blocked_ranges: [] }
              const blocks = cfg.blocked_ranges || []
              return (
                <div key={wd} style={{ background: INK2, border: `1px solid ${cfg.open ? HAIRLINE : 'transparent'}`, borderRadius: RADIUS, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                    <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: cfg.open ? T.primary : T.hint }}>{dia}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: cfg.open ? ACCENT : T.hint }}>{cfg.open ? 'Aberto' : 'Fechado'}</span>
                      <Toggle on={cfg.open} onChange={v => setHourField(wd, 'open', v)} />
                    </div>
                  </div>
                  {cfg.open && (
                    <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${HAIRLINE}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                        <div>
                          <p style={labelStyle}>Manhã</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <TimeSelect value={cfg.morning_start} onChange={v => setHourField(wd, 'morning_start', v)} placeholder="início" />
                            <span style={{ color: T.hint, fontSize: 12, flexShrink: 0 }}>→</span>
                            <TimeSelect value={cfg.morning_end} onChange={v => setHourField(wd, 'morning_end', v)} placeholder="fim" />
                          </div>
                        </div>
                        <div>
                          <p style={labelStyle}>Tarde</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <TimeSelect value={cfg.afternoon_start} onChange={v => setHourField(wd, 'afternoon_start', v)} placeholder="início" />
                            <span style={{ color: T.hint, fontSize: 12, flexShrink: 0 }}>→</span>
                            <TimeSelect value={cfg.afternoon_end} onChange={v => setHourField(wd, 'afternoon_end', v)} placeholder="fim" />
                          </div>
                        </div>
                      </div>

                      {/* bloqueios */}
                      {blocks.length > 0 && (
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${HAIRLINE}` }}>
                          <p style={{ ...labelStyle, marginBottom: 10, color: '#F87171' }}>Períodos bloqueados</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {blocks.map((range, ri) => (
                              <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1 }}>
                                  <TimeSelect value={range.start} onChange={v => updateBlockedRange(wd, ri, 'start', v)} placeholder="início" />
                                </div>
                                <span style={{ color: T.hint, fontSize: 12, flexShrink: 0 }}>→</span>
                                <div style={{ flex: 1 }}>
                                  <TimeSelect value={range.end} onChange={v => updateBlockedRange(wd, ri, 'end', v)} placeholder="fim" />
                                </div>
                                <button onClick={() => removeBlockedRange(wd, ri)}
                                  style={{ background: 'transparent', border: `1px solid rgba(248,113,113,0.3)`, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: '#F87171', fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button onClick={() => addBlockedRange(wd)}
                        style={{ marginTop: 12, background: 'transparent', border: `1px dashed rgba(248,113,113,0.4)`, borderRadius: 8, padding: '6px 14px', color: '#F87171', fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
                        + Bloquear período
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <PrimaryBtn disabled={hoursSaving} onClick={saveHours}>
            {hoursSaving ? 'Salvando...' : 'Salvar horários'}
          </PrimaryBtn>
        </div>
      )}
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function Dashboard({ owner: initialOwner, onSignOut, onOwnerUpdate }) {
  const isMobile = useIsMobile()
  const [owner,       setOwner]       = useState(initialOwner)
  const [section,     setSection]     = useState('bookings')
  const [bookings,    setBookings]    = useState([])
  const [services,    setServices]    = useState([])
  const [hoursConfig, setHoursConfig] = useState({})
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState(null)

  // ── trial ──────────────────────────────────────────────────────────────────
  const [now, setNow]           = useState(() => new Date())
  const deactivatedRef          = useRef(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const isPaidPlan   = owner.plan && owner.plan !== 'free'
  const trialEndsAt  = owner.trial_ends_at ? new Date(owner.trial_ends_at) : null
  const trialExpired = !isPaidPlan && trialEndsAt && trialEndsAt < now
  const trialActive  = !isPaidPlan && trialEndsAt && trialEndsAt >= now
  const msLeft       = trialEndsAt ? Math.max(0, trialEndsAt - now) : 0
  const trialDays    = Math.floor(msLeft / 86400000)
  const trialHours   = Math.floor((msLeft % 86400000) / 3600000)
  const trialMins    = Math.floor((msLeft % 3600000) / 60000)
  const trialSecs    = Math.floor((msLeft % 60000) / 1000)

  // desativa owner no Supabase ao expirar o trial
  useEffect(() => {
    if (trialExpired && !deactivatedRef.current) {
      deactivatedRef.current = true
      supabase.from('owners').update({ active: false }).eq('id', owner.id)
    }
  }, [trialExpired, owner.id])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function handleOwnerUpdate(updated) {
    setOwner(updated)
    onOwnerUpdate(updated)
  }

  const loadBookings = useCallback(async () => {
    const { data } = await supabase.from('bookings')
      .select('*, services(name, price_cents, duration_min)')
      .eq('owner_id', owner.id)
      .order('date', { ascending: true })
      .order('hour', { ascending: true })
    setBookings(data ?? [])
  }, [owner.id])

  const loadServices = useCallback(async () => {
    const { data } = await supabase.from('services').select('*').eq('owner_id', owner.id).order('sort_order')
    setServices(data ?? [])
  }, [owner.id])

  const loadHours = useCallback(async () => {
    const { data } = await supabase.from('hours_config').select('*').eq('owner_id', owner.id).order('weekday')
    const map = {}
    ;(data ?? []).forEach(h => { map[h.weekday] = h })
    setHoursConfig(map)
  }, [owner.id])

  useEffect(() => {
    Promise.all([loadBookings(), loadServices(), loadHours()]).finally(() => setLoading(false))
    const channel = supabase.channel('admin-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `owner_id=eq.${owner.id}` }, loadBookings)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadBookings, loadServices, loadHours])

  async function updateStatus(id, status) {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
    if (error) { showToast('Erro ao atualizar.', 'error'); return }
    showToast(status === 'rejected' ? 'Agendamento cancelado.' : 'Status atualizado.')
    loadBookings()
  }

  async function deleteBooking(id) {
    if (!confirm('Remover este agendamento?')) return
    await supabase.from('bookings').delete().eq('id', id)
    showToast('Agendamento removido.')
    loadBookings()
  }

  // ── sidebar (desktop) ─────────────────────────────────────────────────────
  const Sidebar = (
    <div style={{ width: 220, flexShrink: 0, background: INK2, borderRight: `1px solid ${HAIRLINE}`, display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'sticky', top: 0 }}>
      <div style={{ padding: '24px 20px 20px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <NavalhaLogo size={28} />
      </div>
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {NAV.map(item => {
          const active = section === item.key
          return (
            <button key={item.key} onClick={() => setSection(item.key)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: RADIUS, border: 'none', cursor: 'pointer', background: active ? ACCENT_DIM : 'transparent', color: active ? ACCENT : T.muted, fontFamily: FONT, fontWeight: active ? 600 : 400, fontSize: 14, marginBottom: 2, transition: 'background 0.15s, color 0.15s', textAlign: 'left' }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 14, width: 18, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>
      <div style={{ padding: '16px 20px', borderTop: `1px solid ${HAIRLINE}` }}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Barbearia</p>
        <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: T.primary, marginBottom: 2 }}>{owner.name}</p>
        {/* timer de trial */}
        {(trialActive || trialExpired) && (
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: RADIUS, background: trialExpired ? 'rgba(239,68,68,0.1)' : 'rgba(235,188,99,0.08)', border: `1px solid ${trialExpired ? 'rgba(239,68,68,0.3)' : HAIRLINE}` }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: trialExpired ? '#F87171' : T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              {trialExpired ? 'Trial encerrado' : 'Trial gratuito'}
            </p>
            {trialExpired ? (
              <p style={{ fontFamily: FONT, fontSize: 12, color: '#F87171', lineHeight: 1.4 }}>Assine um plano para continuar.</p>
            ) : (
              <p style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: trialDays < 2 ? '#FBBF24' : T.primary, letterSpacing: '0.04em' }}>
                {trialDays}d {String(trialHours).padStart(2,'0')}h {String(trialMins).padStart(2,'0')}m {String(trialSecs).padStart(2,'0')}s
              </p>
            )}
          </div>
        )}
        {owner.slug && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{owner.slug}</p>
            <button title="Copiar link dos clientes"
              onClick={() => navigator.clipboard?.writeText(`${CLIENT_APP_URL}/${owner.slug}`).then(() => showToast('Link copiado.'))}
              style={{ background: 'transparent', border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: '3px 8px', color: ACCENT, fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', flexShrink: 0 }}>
              copiar link
            </button>
          </div>
        )}
        <GhostBtn onClick={onSignOut} style={{ fontSize: 12, color: '#F87171' }}>Sair</GhostBtn>
      </div>
    </div>
  )

  // ── top bar (mobile) ───────────────────────────────────────────────────────
  const TopBar = isMobile && (
    <div style={{ position: 'sticky', top: 0, zIndex: 50, background: INK2, borderBottom: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
      <NavalhaLogo size={22} />
      <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary }}>
        {NAV.find(n => n.key === section)?.label ?? ''}
      </p>
    </div>
  )

  // ── bottom nav (mobile) ────────────────────────────────────────────────────
  const BottomNav = isMobile && (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: INK2, borderTop: `1px solid ${HAIRLINE}`, display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {NAV.map(item => {
        const active = section === item.key
        return (
          <button key={item.key} onClick={() => setSection(item.key)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 4px 8px', border: 'none', cursor: 'pointer', background: 'transparent', color: active ? ACCENT : T.muted, transition: 'color 0.15s' }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 17, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>{item.short}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: isMobile ? 'column' : 'row' }}>
      {!isMobile && Sidebar}
      {TopBar}
      {/* faixa de trial — mobile */}
      {isMobile && (trialActive || trialExpired) && (
        <div style={{ background: trialExpired ? 'rgba(239,68,68,0.12)' : 'rgba(235,188,99,0.08)', borderBottom: `1px solid ${trialExpired ? 'rgba(239,68,68,0.3)' : HAIRLINE}`, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: trialExpired ? '#F87171' : T.hint, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {trialExpired ? 'Trial encerrado' : 'Trial gratuito'}
          </p>
          {trialActive && (
            <p style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: trialDays < 2 ? '#FBBF24' : T.primary }}>
              {trialDays}d {String(trialHours).padStart(2,'0')}h {String(trialMins).padStart(2,'0')}m {String(trialSecs).padStart(2,'0')}s
            </p>
          )}
          {trialExpired && (
            <button onClick={() => setSection('plans')} style={{ background: 'transparent', border: `1px solid rgba(239,68,68,0.4)`, borderRadius: 6, padding: '3px 10px', color: '#F87171', fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>Ver planos</button>
          )}
        </div>
      )}
      <main style={{ flex: 1, padding: isMobile ? '20px 16px' : '32px 36px', overflowY: 'auto', paddingBottom: isMobile ? 80 : 32, position: 'relative' }}>
        {/* paywall de trial expirado */}
        {trialExpired && section !== 'plans' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,12,8,0.92)', backdropFilter: 'blur(6px)', padding: 32 }}>
            <div style={{ maxWidth: 420, textAlign: 'center' }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#F87171', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 16 }}>→ PERÍODO DE AVALIAÇÃO ENCERRADO</p>
              <h2 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: T.primary, marginBottom: 12, letterSpacing: '-0.02em' }}>Seus 14 dias gratuitos acabaram.</h2>
              <p style={{ fontFamily: FONT, fontSize: 14, color: T.muted, lineHeight: 1.6, marginBottom: 32 }}>
                O acesso ao painel e o link de agendamento dos clientes foram suspensos. Assine um plano para reativar tudo imediatamente.
              </p>
              <button onClick={() => setSection('plans')}
                style={{ background: ACCENT, border: 'none', borderRadius: RADIUS, padding: '14px 32px', color: INK, fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Ver planos
              </button>
            </div>
          </div>
        )}

        {section === 'bookings' && (
          <BookingsSection bookings={bookings} loading={loading} updateStatus={updateStatus} deleteBooking={deleteBooking} onRefresh={loadBookings} />
        )}
        {section === 'calendar' && (
          <CalendarSection bookings={bookings} updateStatus={updateStatus} onRefresh={loadBookings} />
        )}
        {section === 'reports' && (
          <ReportsSection bookings={bookings} onRefresh={loadBookings} />
        )}
        {section === 'client-link' && (
          <ClientLinkSection owner={owner} showToast={showToast} />
        )}
        {section === 'settings' && (
          <SettingsSection
            owner={owner} services={services} hoursConfig={hoursConfig}
            onOwnerUpdate={handleOwnerUpdate} onServicesChange={loadServices}
            onHoursChange={loadHours} showToast={showToast}
          />
        )}
        {section === 'plans' && <PlansSection owner={owner} />}
      </main>
      {BottomNav}
      <Toast toast={toast} onClose={() => setToast(null)} style={{ bottom: isMobile ? 72 : 24, right: isMobile ? 16 : 24, left: isMobile ? 16 : 'auto' }} />
    </div>
  )
}
