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
      {[['profile', 'Perfil'], ['services', 'Serviços'], ['hours', 'Horários'], ['team', 'Equipe']].map(([key, label]) => (
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
    monthlyCents: 6900,
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
    monthlyCents: 11900,
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
    monthlyCents: 21900,
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

// Ciclos de cobrança. Pago à vista — o owner ganha 6 ou 12 meses de uso.
const CYCLES = [
  { key: 'monthly',  label: 'Mensal',     months: 1,  discount: 0    },
  { key: 'semester', label: 'Semestral',  months: 6,  discount: 0.15 },
  { key: 'yearly',   label: 'Anual',      months: 12, discount: 0.25 },
]

// Calcula valores de um plano para um ciclo. Centavos pra evitar drift.
function priceFor(plan, cycle) {
  const fullCents       = plan.monthlyCents * cycle.months
  const totalCents      = Math.round(fullCents * (1 - cycle.discount))
  const perMonthCents   = Math.round(totalCents / cycle.months)
  const savingsCents    = fullCents - totalCents
  return { fullCents, totalCents, perMonthCents, savingsCents }
}

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
  const [docModal,  setDocModal]  = useState(null) // { planKey, cycleKey } aguardando CPF/CNPJ
  const [cycleKey,  setCycleKey]  = useState('monthly') // mensal como padrão

  const currentPlan = owner?.plan ?? 'free'
  const cycle       = CYCLES.find(c => c.key === cycleKey)

  async function handleSubscribe(planKey) {
    if (!owner?.cpf_cnpj) {
      setDocModal({ planKey, cycleKey })
      return
    }
    await checkout(planKey, cycleKey, owner.cpf_cnpj)
  }

  async function checkout(planKey, cycle, cpfCnpj) {
    setDocModal(null)
    setLoading(planKey)
    try {
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ ownerId: owner.id, planKey, cycle, cpfCnpj }),
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
          onConfirm={cpfCnpj => checkout(docModal.planKey, docModal.cycleKey, cpfCnpj)}
        />
      )}

      <PageTitle>Planos</PageTitle>

      {/* plano atual */}
      {currentPlan !== 'free' && (() => {
        const expiresAt    = owner?.plan_expires_at ? new Date(owner.plan_expires_at) : null
        const expired      = expiresAt && expiresAt < new Date()
        const daysLeft     = expiresAt ? Math.ceil((expiresAt - new Date()) / 86400000) : null
        const expiringSoon = !expired && daysLeft !== null && daysLeft <= 7
        const autoRenew    = Boolean(owner?.asaas_subscription_id)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28, maxWidth: 480 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: expired ? 'rgba(239,68,68,0.08)' : 'rgba(235,188,99,0.08)', border: `1px solid ${expired ? 'rgba(239,68,68,0.3)' : 'rgba(235,188,99,0.25)'}`, borderRadius: RADIUS, padding: '10px 16px' }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: expired ? '#F87171' : ACCENT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {expired ? 'Plano expirado' : 'Plano ativo'}
              </span>
              <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: T.primary }}>{PLAN_LABEL[currentPlan]}</span>
              {expiresAt && !expired && (
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: expiringSoon ? '#FBBF24' : T.hint }}>
                  · expira em {expiresAt.toLocaleDateString('pt-BR')}{expiringSoon ? ` (${daysLeft}d)` : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: autoRenew ? ACCENT : T.hint, letterSpacing: '0.06em' }}>
                {autoRenew ? '→ Renovação automática mensal' : '→ Cobrança única — renovação manual necessária ao expirar'}
              </span>
            </div>
          </div>
        )
      })()}

      <p style={{ fontFamily: FONT, fontSize: 14, color: T.muted, marginBottom: 24, maxWidth: 560 }}>
        Escolha o plano ideal para a sua barbearia. O acesso é liberado imediatamente após o pagamento.
      </p>

      {/* seletor de ciclo de cobrança */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
          Ciclo de cobrança
        </p>
        <div style={{ display: 'inline-flex', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, padding: 4, gap: 4 }}>
          {CYCLES.map(c => {
            const sel = c.key === cycleKey
            const isBest = c.key === 'yearly'
            return (
              <div key={c.key} style={{ position: 'relative' }}>
                {/* selo "Melhor preço" flutuando acima do botão anual */}
                {isBest && (
                  <div style={{
                    position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                    background: ACCENT, color: INK,
                    fontFamily: FONT_MONO, fontSize: 8, fontWeight: 700,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: '4px 4px 0 0',
                    whiteSpace: 'nowrap',
                  }}>Melhor preço</div>
                )}
                <button
                  onClick={() => setCycleKey(c.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 16px',
                    background: sel ? ACCENT : 'transparent',
                    border: isBest && !sel ? `1px solid rgba(235,188,99,0.35)` : 'none',
                    borderRadius: RADIUS - 4,
                    color: sel ? INK : T.primary,
                    fontFamily: FONT, fontWeight: 700, fontSize: 13,
                    cursor: 'pointer',
                    transition: 'background 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  {c.label}
                  {c.discount > 0 && (
                    <span style={{
                      fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: '2px 6px', borderRadius: 4,
                      background: sel ? 'rgba(17,12,8,0.18)' : 'rgba(235,188,99,0.15)',
                      color: sel ? INK : ACCENT,
                    }}>
                      −{Math.round(c.discount * 100)}%
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
        {cycle.discount > 0 && (
          <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: ACCENT, marginTop: 10, letterSpacing: '0.04em' }}>
            → Pagamento único · acesso por {cycle.months} meses
          </p>
        )}
      </div>

      {/* cards de plano */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        {PLANS.map(plan => {
          const active            = isActive(plan.key)
          const busy              = loading === plan.key
          const { perMonthCents, totalCents, savingsCents } = priceFor(plan, cycle)
          const showDiscount      = cycle.discount > 0
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

              {/* preço — mensal equivalente em destaque */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 32, fontWeight: 700, color: T.primary }}>
                  {fmtPrice(perMonthCents)}
                </span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.hint }}>/mês</span>
              </div>

              {/* preço original riscado quando há desconto */}
              {showDiscount ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, minHeight: 18 }}>
                  <span style={{
                    fontFamily: FONT_MONO, fontSize: 12,
                    color: T.hint,
                    textDecoration: 'line-through',
                    textDecorationColor: 'rgba(235,188,99,0.5)',
                  }}>
                    {fmtPrice(plan.monthlyCents)}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: ACCENT, letterSpacing: '0.04em' }}>
                    economize {fmtPrice(savingsCents)}
                  </span>
                </div>
              ) : (
                <div style={{ minHeight: 18, marginBottom: 10 }} />
              )}

              {/* total à vista (somente para ciclos com desconto) */}
              {showDiscount && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'rgba(235,188,99,0.08)',
                  border: `1px solid rgba(235,188,99,0.25)`,
                  borderRadius: RADIUS - 4,
                  padding: '8px 12px',
                  marginBottom: 16,
                }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    {cycle.months} meses à vista
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: T.primary }}>
                    {fmtPrice(totalCents)}
                  </span>
                </div>
              )}

              <p style={{ fontFamily: FONT, fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 20, minHeight: 48 }}>{plan.target}</p>
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
                {busy
                  ? 'Aguarde...'
                  : active
                    ? 'Plano ativo'
                    : showDiscount
                      ? `Assinar ${cycle.months} meses · ${fmtPrice(totalCents)}`
                      : 'Assinar'}
              </button>
            </div>
          )
        })}
      </div>

    </div>
  )
}

// ── seção agendamentos ─────────────────────────────────────────────────────────
function BookingsSection({ bookings, loading, updateStatus, deleteBooking, onRefresh, professionals }) {
  const isMobile = useIsMobile()
  const [filterDate,       setFilterDate]       = useState('')
  const [filterStatus,     setFilterStatus]     = useState('all')
  const [filterProfessional, setFilterProfessional] = useState('all')
  const [detail,           setDetail]           = useState(null)

  const filtered = bookings.filter(b => {
    const matchDate   = !filterDate || b.date === filterDate
    const matchStatus = filterStatus === 'all' || b.status === filterStatus
    const matchPro    = filterProfessional === 'all' || b.professional_id === filterProfessional
    return matchDate && matchStatus && matchPro
  })

  const thStyle = { fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 16px', textAlign: 'left', borderBottom: `1px solid ${HAIRLINE}`, whiteSpace: 'nowrap' }
  const tdStyle = { padding: '14px 16px', fontFamily: FONT, fontSize: 13, color: T.primary, borderBottom: `1px solid ${HAIRLINE}` }

  function proName(b) {
    if (!b.professional_id) return null
    return professionals?.find(p => p.id === b.professional_id)?.name ?? null
  }

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
        {professionals.length > 0 && (
          <div>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Profissional</p>
            <select value={filterProfessional} onChange={e => setFilterProfessional(e.target.value)} style={{ padding: '10px 12px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, color: T.primary, fontFamily: FONT, fontSize: 13, cursor: 'pointer', minWidth: 160 }}>
              <option value="all">Todos</option>
              {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <GhostBtn onClick={() => { setFilterDate(''); setFilterStatus('all'); setFilterProfessional('all') }}>Limpar filtros</GhostBtn>
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
                <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted }}>{b.services?.name ?? '—'}{proName(b) ? ` · ${proName(b)}` : ''} · {new Date(b.date + 'T12:00:00').toLocaleDateString('pt-BR')} · {phoneToDisplay(b.client_phone)}</p>
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
                {professionals?.length > 1 && <th style={thStyle}>Profissional</th>}
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
                  {professionals?.length > 1 && <td style={{ ...tdStyle, color: T.muted }}>{proName(b) ?? '—'}</td>}
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
                ['Serviço',       detail.services?.name ?? '—'],
                proName(detail) ? ['Profissional', proName(detail)] : null,
                ['Data',          fmtDateFull(detail.date)],
                ['Horário',       detail.hour?.slice(0, 5)],
                ['Telefone',      detail.client_phone],
                ['Status',        <Badge key="s" status={detail.status} />],
                detail.notes ? ['Obs.', detail.notes] : null,
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

// ── slot row (calendário de slots) ───────────────────────────────────────────
function SlotRow({ hour, status, isBlocking, onClick }) {
  const { type, booking } = status
  let bg         = 'transparent'
  let borderLeft = '3px solid transparent'
  let mainLabel  = ''
  let mainColor  = T.hint

  if (type === 'booked') {
    bg         = INK2
    borderLeft = `3px solid ${STATUS_COLOR[booking.status] || HAIRLINE}`
    mainLabel  = booking.client_name
    mainColor  = T.primary
  } else if (type === 'blocked') {
    bg         = 'rgba(239,68,68,0.04)'
    borderLeft = '3px solid rgba(239,68,68,0.45)'
    mainLabel  = 'Bloqueado'
    mainColor  = '#F87171'
  } else {
    mainLabel  = 'Disponível'
    mainColor  = 'rgba(245,234,208,0.25)'
  }

  return (
    <div
      onClick={!isBlocking ? onClick : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        background: bg, border: `1px solid ${type === 'free' ? 'transparent' : HAIRLINE}`,
        borderLeft, borderRadius: RADIUS,
        cursor: isBlocking ? 'default' : 'pointer',
        opacity: isBlocking ? 0.5 : 1, transition: 'opacity 0.15s',
      }}
    >
      <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 600, color: ACCENT, minWidth: 44, flexShrink: 0 }}>
        {hour}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT, fontWeight: type === 'booked' ? 600 : 400, fontSize: 14, color: mainColor }}>
          {mainLabel}
        </p>
        {type === 'booked' && booking.services?.name && (
          <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted, marginTop: 1 }}>
            {booking.services.name}
          </p>
        )}
      </div>
      {type === 'booked' ? (
        <Badge status={booking.status} />
      ) : (
        <span style={{
          fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.08em',
          color: type === 'blocked' ? '#F87171' : T.hint,
          border: `1px solid ${type === 'blocked' ? 'rgba(239,68,68,0.3)' : HAIRLINE}`,
          borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {isBlocking ? '...' : type === 'blocked' ? 'Desbloquear' : 'Bloquear'}
        </span>
      )}
    </div>
  )
}

// ── célula de slot (calendário multi-profissional) ───────────────────────────
function ProSlotCell({ status, isBlocking, onClick }) {
  const { type, booking } = status
  const [hovered, setHovered] = useState(false)
  const isBooked  = type === 'booked'
  const isBlocked = type === 'blocked'

  return (
    <div
      onClick={isBlocking ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 10px',
        minHeight: 54,
        cursor: isBlocking ? 'default' : 'pointer',
        opacity: isBlocking ? 0.5 : 1,
        transition: 'background 0.12s',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        borderRadius: 6,
        background: isBooked
          ? INK2
          : isBlocked
            ? 'rgba(239,68,68,0.06)'
            : hovered ? 'rgba(235,188,99,0.03)' : 'transparent',
        borderLeft: isBooked
          ? `3px solid ${STATUS_COLOR[booking.status] || HAIRLINE}`
          : isBlocked
            ? '3px solid rgba(239,68,68,0.4)'
            : hovered ? `3px solid ${ACCENT_DIM}` : '3px solid transparent',
      }}
    >
      {isBooked && (
        <>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: T.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            {booking.client_name}
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2, lineHeight: 1.3 }}>
            {booking.services?.name ?? '—'}
          </div>
          <div style={{ marginTop: 4 }}><Badge status={booking.status} /></div>
        </>
      )}
      {isBlocked && (
        <>
          <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#F87171', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {isBlocking ? '...' : 'Bloqueado'}
          </span>
          {!isBlocking && hovered && (
            <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: 'rgba(248,113,113,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
              Desbloquear
            </span>
          )}
        </>
      )}
      {!isBooked && !isBlocked && hovered && !isBlocking && (
        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Bloquear
        </span>
      )}
    </div>
  )
}

// ── modal de recorte de avatar ────────────────────────────────────────────────
function AvatarCropModal({ file, onConfirm, onCancel }) {
  const canvasRef  = useRef(null)
  const imgRef     = useRef(null)
  const dragStart  = useRef(null)
  const [zoom,     setZoom]     = useState(1)
  const [offset,   setOffset]   = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [ready,    setReady]    = useState(false)

  const SIZE = 280

  useEffect(() => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { imgRef.current = img; setReady(true) }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => { if (ready) draw() }, [ready, zoom, offset])

  function draw() {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')
    const img = imgRef.current
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.save()
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    const scale = Math.max(SIZE / img.width, SIZE / img.height) * zoom
    const w = img.width * scale
    const h = img.height * scale
    const x = (SIZE - w) / 2 + offset.x
    const y = (SIZE - h) / 2 + offset.y
    ctx.drawImage(img, x, y, w, h)
    ctx.restore()
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2)
    ctx.stroke()
  }

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const src = e.touches?.[0] ?? e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  function onDown(e)  {
    setDragging(true)
    const p = getPos(e)
    dragStart.current = { x: p.x - offset.x, y: p.y - offset.y }
  }
  function onMove(e)  {
    if (!dragging) return
    const p = getPos(e)
    setOffset({ x: p.x - dragStart.current.x, y: p.y - dragStart.current.y })
  }
  function onUp()     { setDragging(false) }

  function confirm() {
    const img = imgRef.current
    const OUT = 400
    const out = document.createElement('canvas')
    out.width = out.height = OUT
    const ctx = out.getContext('2d')
    ctx.beginPath()
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2)
    ctx.clip()
    const scale = Math.max(SIZE / img.width, SIZE / img.height) * zoom
    const w = img.width  * scale
    const h = img.height * scale
    const x = (SIZE - w) / 2 + offset.x
    const y = (SIZE - h) / 2 + offset.y
    const r = OUT / SIZE
    ctx.drawImage(img, x * r, y * r, w * r, h * r)
    out.toBlob(blob => onConfirm(blob), 'image/jpeg', 0.9)
  }

  return (
    <Modal onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Recortar foto
        </p>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          style={{ cursor: dragging ? 'grabbing' : 'grab', borderRadius: '50%', touchAction: 'none', maxWidth: '100%' }}
          onMouseDown={onDown}  onMouseMove={onMove}  onMouseUp={onUp}  onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove}  onTouchEnd={onUp}
        />
        <div style={{ width: '100%' }}>
          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
            Zoom
          </p>
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: ACCENT }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <SecBtn onClick={onCancel} style={{ flex: 1 }}>Cancelar</SecBtn>
          <PrimaryBtn onClick={confirm} disabled={!ready} style={{ flex: 2 }}>Confirmar</PrimaryBtn>
        </div>
      </div>
    </Modal>
  )
}

// ── modal de agendamento manual ───────────────────────────────────────────────
function ManualBookingModal({ owner, services, professionals, defaultDate, onClose, onSaved, showToast }) {
  const [form, setForm] = useState({
    date:            defaultDate || today(),
    hour:            '',
    client_name:     '',
    client_phone:    '',
    service_id:      services[0]?.id || '',
    professional_id: '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.date || !form.hour || !form.client_name.trim() || !form.service_id) {
      showToast('Preencha data, horário, nome e serviço.', 'error')
      return
    }
    setSaving(true)
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const { error } = await supabase.from('bookings').insert({
      owner_id:        owner.id,
      date:            form.date,
      hour:            form.hour + ':00',
      client_name:     form.client_name.trim(),
      client_phone:    form.client_phone.replace(/\D/g, '') || null,
      service_id:      form.service_id || null,
      professional_id: form.professional_id || null,
      status:          'manual',
      code,
    })
    setSaving(false)
    if (error) { showToast(`Erro ao salvar: ${error.message}`, 'error'); return }
    showToast('Agendamento manual criado.')
    onSaved()
  }

  const fieldStyle = {
    width: '100%', padding: '9px 12px',
    background: INK, border: `1px solid ${HAIRLINE}`, borderRadius: 8,
    color: T.primary, fontFamily: FONT, fontSize: 14, boxSizing: 'border-box',
  }
  const labelStyle = {
    fontFamily: FONT_MONO, fontSize: 10, color: T.hint,
    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, display: 'block',
  }

  return (
    <Modal onClose={onClose}>
      <Card style={{ maxWidth: 440 }}>
        <Eyebrow>Calendário</Eyebrow>
        <h3 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: T.primary, marginBottom: 20 }}>
          Novo agendamento manual
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Data *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Horário *</label>
              <select value={form.hour} onChange={e => set('hour', e.target.value)}
                style={{ ...fieldStyle, appearance: 'none', WebkitAppearance: 'none' }}>
                <option value="">—</option>
                {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Nome do cliente *</label>
            <input value={form.client_name} onChange={e => set('client_name', e.target.value)}
              placeholder="Nome completo" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>WhatsApp</label>
            <input value={form.client_phone} onChange={e => set('client_phone', formatPhone(e.target.value))}
              placeholder="(00) 00000-0000" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Serviço *</label>
            <select value={form.service_id} onChange={e => set('service_id', e.target.value)}
              style={{ ...fieldStyle, appearance: 'none', WebkitAppearance: 'none' }}>
              <option value="">—</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name} — {fmtPrice(s.price_cents)}</option>)}
            </select>
          </div>
          {professionals.length > 0 && (
            <div>
              <label style={labelStyle}>Profissional</label>
              <select value={form.professional_id} onChange={e => set('professional_id', e.target.value)}
                style={{ ...fieldStyle, appearance: 'none', WebkitAppearance: 'none' }}>
                <option value="">—</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <Divider style={{ margin: '20px 0' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaryBtn onClick={save} disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Salvando...' : 'Confirmar agendamento'}
          </PrimaryBtn>
          <GhostBtn onClick={onClose}>Cancelar</GhostBtn>
        </div>
      </Card>
    </Modal>
  )
}

// ── seção calendário ──────────────────────────────────────────────────────────
function CalendarSection({ bookings, updateStatus, onRefresh, hoursConfig, blockedSlots, onBlockedSlotsChange, services, professionals, owner, showToast }) {
  const [weekOffset,  setWeekOffset]        = useState(0)
  const [selDay,      setSelDay]            = useState(null)
  const [detail,      setDetail]            = useState(null)
  const [blocking,    setBlocking]          = useState(null) // hora que está sendo (des)bloqueada
  const [showManual,  setShowManual]        = useState(false)

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])
  const todayStr = today()

  // seleciona hoje (se estiver na semana) ou a segunda-feira
  useEffect(() => {
    const todayInWeek = weekDays.find(d => toDateStr(d) === todayStr)
    setSelDay(todayInWeek || weekDays[0])
  }, [weekOffset]) // eslint-disable-line

  const wStart    = weekDays[0]
  const wEnd      = weekDays[6]
  const weekLabel = `${wStart.getDate()} ${MES_ABBR[wStart.getMonth()]} – ${wEnd.getDate()} ${MES_ABBR[wEnd.getMonth()]} ${wEnd.getFullYear()}`
  const selDayStr = selDay ? toDateStr(selDay) : null

  // gera slots de 30min a partir da config de horários do dia
  function getSlotsForDate(d) {
    if (!d) return []
    const cfg = hoursConfig[d.getDay()]
    if (!cfg || !cfg.open) return []
    const slots = []
    function addRange(start, end) {
      if (!start || !end) return
      const [sh, sm] = start.split(':').map(Number)
      const [eh, em] = end.split(':').map(Number)
      let t = sh * 60 + sm
      const endT = eh * 60 + em
      while (t < endT) {
        slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
        t += 30
      }
    }
    addRange(cfg.morning_start, cfg.morning_end)
    addRange(cfg.afternoon_start, cfg.afternoon_end)
    return slots
  }

  const selSlots        = useMemo(() => getSlotsForDate(selDay),  [selDay, hoursConfig]) // eslint-disable-line
  const selSlotsGrouped = useMemo(() => getSlotsGrouped(selDay),  [selDay, hoursConfig]) // eslint-disable-line

  // usado no modo sem profissionais (lista única)
  function slotStatus(hour) {
    if (!selDayStr) return { type: 'free' }
    const booking = bookings.find(b => b.date === selDayStr && b.hour?.slice(0, 5) === hour)
    if (booking) return { type: 'booked', booking }
    const slot = blockedSlots.find(s => s.date === selDayStr && s.hour?.slice(0, 5) === hour)
    if (slot) return { type: 'blocked', slot }
    return { type: 'free' }
  }

  // usado no grid multi-profissional: booking e bloqueio individuais por profissional
  function slotStatusForPro(hour, proId) {
    if (!selDayStr) return { type: 'free' }
    const booking = bookings.find(b =>
      b.date === selDayStr &&
      b.hour?.slice(0, 5) === hour &&
      b.professional_id === proId
    )
    if (booking) return { type: 'booked', booking }
    const slot = blockedSlots.find(s =>
      s.date === selDayStr &&
      s.hour?.slice(0, 5) === hour &&
      (s.professional_id === proId || s.professional_id === null)
    )
    if (slot) return { type: 'blocked', slot }
    return { type: 'free' }
  }

  // retorna {morning, afternoon} separados para os separadores visuais
  function getSlotsGrouped(d) {
    if (!d) return { morning: [], afternoon: [] }
    const cfg = hoursConfig[d.getDay()]
    if (!cfg || !cfg.open) return { morning: [], afternoon: [] }
    function makeRange(start, end) {
      if (!start || !end) return []
      const slots = []
      const [sh, sm] = start.split(':').map(Number)
      const [eh, em] = end.split(':').map(Number)
      let t = sh * 60 + sm
      const endT = eh * 60 + em
      while (t < endT) {
        slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
        t += 30
      }
      return slots
    }
    return {
      morning:   makeRange(cfg.morning_start, cfg.morning_end),
      afternoon: makeRange(cfg.afternoon_start, cfg.afternoon_end),
    }
  }

  // proId = null em modo sem profissionais (bloqueio global)
  async function toggleBlock(hour, proId = null) {
    if (!selDay || blocking) return
    const blockKey = proId ? `${hour}:${proId}` : hour
    const existingBlock = blockedSlots.find(s =>
      s.date === selDayStr &&
      s.hour?.slice(0, 5) === hour &&
      s.professional_id === proId
    )
    setBlocking(blockKey)
    try {
      if (existingBlock) {
        const { error } = await supabase.from('blocked_slots').delete().eq('id', existingBlock.id)
        if (error) { showToast(`Erro ao desbloquear: ${error.message}`, 'error'); return }
      } else {
        const { error } = await supabase.from('blocked_slots').insert({
          owner_id:        owner.id,
          date:            selDayStr,
          hour:            hour + ':00',
          professional_id: proId,
        })
        if (error) { showToast(`Erro ao bloquear: ${error.message}`, 'error'); return }
      }
      await onBlockedSlotsChange()
    } finally {
      setBlocking(null)
    }
  }

  // ── nav de semana ─────────────────────────────────────────────────────────
  const WeekNav = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <button onClick={() => setWeekOffset(w => w - 1)}
        style={{ background: 'none', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '6px 14px', color: T.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>←</button>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.primary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{weekLabel}</p>
        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)}
            style={{ background: 'none', border: 'none', color: ACCENT, fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.12em', cursor: 'pointer', padding: '2px 0', marginTop: 2, textDecoration: 'underline', textUnderlineOffset: 2 }}>
            SEMANA ATUAL
          </button>
        )}
      </div>
      <button onClick={() => setWeekOffset(w => w + 1)}
        style={{ background: 'none', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '6px 14px', color: T.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>→</button>
    </div>
  )

  // ── strip de dias ─────────────────────────────────────────────────────────
  const WeekStrip = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 24 }}>
      {weekDays.map((d, i) => {
        const ds         = toDateStr(d)
        const isToday    = ds === todayStr
        const isSel      = selDay && toDateStr(selDay) === ds
        const cnt        = bookings.filter(b => b.date === ds).length
        const hasPending = bookings.some(b => b.date === ds && b.status === 'pending')
        return (
          <div key={i} onClick={() => setSelDay(d)}
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
            {cnt > 0 ? (
              <div style={{ fontFamily: FONT_MONO, fontSize: 8, fontWeight: 700, background: hasPending ? STATUS_COLOR.pending : STATUS_COLOR.confirmed, color: INK, borderRadius: 4, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>
                {cnt}
              </div>
            ) : (
              <div style={{ height: 14 }} />
            )}
          </div>
        )
      })}
    </div>
  )

  // slots do dia selecionado
  const selDayCfg  = selDay ? hoursConfig[selDay.getDay()] : null
  const dayIsOpen  = selDayCfg?.open

  return (
    <div>
      {/* cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: T.primary, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>Calendário</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowManual(true)}
            style={{ background: ACCENT, border: 'none', borderRadius: RADIUS, padding: '9px 16px', color: INK, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Agendamento manual
          </button>
          <RefreshBtn onRefresh={async () => { await onRefresh(); await onBlockedSlotsChange() }} />
        </div>
      </div>

      {WeekNav}
      {WeekStrip}

      {/* slots do dia */}
      {selDay && (
        <div>
          <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary, marginBottom: 16, textTransform: 'capitalize' }}>
            {selDay.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>

          {!dayIsOpen ? (
            <p style={{ fontFamily: FONT, fontSize: 14, color: T.hint, textAlign: 'center', padding: '32px 0' }}>
              Dia fechado.
            </p>
          ) : selSlots.length === 0 ? (
            <p style={{ fontFamily: FONT, fontSize: 14, color: T.hint, textAlign: 'center', padding: '32px 0' }}>
              Nenhum horário configurado.
            </p>
          ) : professionals.length > 0 ? (

            /* ── grid multi-profissional ─────────────────────────────────── */
            <div style={{ overflowX: 'auto', borderRadius: RADIUS, border: `1px solid ${HAIRLINE}` }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 56 + professionals.length * 168 }}>
                <thead>
                  <tr>
                    {/* canto superior esquerdo */}
                    <th style={{ width: 56, padding: 0, position: 'sticky', left: 0, zIndex: 2, background: INK2, borderBottom: `1px solid ${HAIRLINE}` }} />
                    {professionals.map(pro => (
                      <th key={pro.id} style={{ minWidth: 168, padding: '12px 14px', textAlign: 'left', fontWeight: 'unset', background: INK2, borderBottom: `1px solid ${HAIRLINE}`, borderLeft: `1px solid ${HAIRLINE}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: ACCENT_DIM, border: `1px solid rgba(235,188,99,0.35)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: ACCENT, flexShrink: 0 }}>
                            {pro.name.slice(0, 1).toUpperCase()}
                          </div>
                          <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: T.primary }}>
                            {pro.name}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* bloco manhã */}
                  {selSlotsGrouped.morning.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={professionals.length + 1} style={{ padding: '5px 14px', fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.12em', background: 'rgba(17,12,8,0.5)', borderTop: `1px solid ${HAIRLINE}` }}>
                          Manhã
                        </td>
                      </tr>
                      {selSlotsGrouped.morning.map(hour => (
                        <tr key={hour}>
                          <td style={{ position: 'sticky', left: 0, zIndex: 1, width: 56, background: INK2, borderTop: `1px solid ${HAIRLINE}`, padding: '0 10px', textAlign: 'right', fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: ACCENT, whiteSpace: 'nowrap' }}>
                            {hour}
                          </td>
                          {professionals.map(pro => {
                            const st      = slotStatusForPro(hour, pro.id)
                            const bKey    = `${hour}:${pro.id}`
                            return (
                              <td key={pro.id} style={{ padding: 3, borderTop: `1px solid ${HAIRLINE}`, borderLeft: `1px solid ${HAIRLINE}`, verticalAlign: 'top', minWidth: 168 }}>
                                <ProSlotCell status={st} isBlocking={blocking === bKey} onClick={() => st.type === 'booked' ? setDetail(st.booking) : toggleBlock(hour, pro.id)} />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </>
                  )}

                  {/* bloco tarde */}
                  {selSlotsGrouped.afternoon.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={professionals.length + 1} style={{ padding: '5px 14px', fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.12em', background: 'rgba(17,12,8,0.5)', borderTop: `1px solid ${HAIRLINE}` }}>
                          Tarde
                        </td>
                      </tr>
                      {selSlotsGrouped.afternoon.map(hour => (
                        <tr key={hour}>
                          <td style={{ position: 'sticky', left: 0, zIndex: 1, width: 56, background: INK2, borderTop: `1px solid ${HAIRLINE}`, padding: '0 10px', textAlign: 'right', fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: ACCENT, whiteSpace: 'nowrap' }}>
                            {hour}
                          </td>
                          {professionals.map(pro => {
                            const st      = slotStatusForPro(hour, pro.id)
                            const bKey    = `${hour}:${pro.id}`
                            return (
                              <td key={pro.id} style={{ padding: 3, borderTop: `1px solid ${HAIRLINE}`, borderLeft: `1px solid ${HAIRLINE}`, verticalAlign: 'top', minWidth: 168 }}>
                                <ProSlotCell status={st} isBlocking={blocking === bKey} onClick={() => st.type === 'booked' ? setDetail(st.booking) : toggleBlock(hour, pro.id)} />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>

          ) : (
            /* ── lista única (sem profissionais cadastrados) ─────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {selSlots.map(hour => {
                const st = slotStatus(hour)
                return (
                  <SlotRow
                    key={hour}
                    hour={hour}
                    status={st}
                    isBlocking={blocking === hour}
                    onClick={() => st.type === 'booked' ? setDetail(st.booking) : toggleBlock(hour)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* modal de detalhes de agendamento */}
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

      {/* modal de agendamento manual */}
      {showManual && (
        <ManualBookingModal
          owner={owner}
          services={services}
          professionals={professionals}
          defaultDate={selDayStr}
          onClose={() => setShowManual(false)}
          onSaved={async () => { setShowManual(false); await onRefresh() }}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ── seção relatórios ──────────────────────────────────────────────────────────
function ReportsSection({ bookings, onRefresh, professionals }) {
  const currentMonth = today().slice(0, 7)
  const [selMonth,            setSelMonth]            = useState(currentMonth)
  const [filterProfessional,  setFilterProfessional]  = useState('all')

  // meses disponíveis a partir dos bookings (únicos, decrescente)
  const availableMonths = useMemo(() => {
    const set = new Set(bookings.map(b => b.date.slice(0, 7)))
    set.add(currentMonth)
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [bookings, currentMonth])

  function fmtMonthLabel(ym) {
    const [y, m] = ym.split('-')
    const name = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  // agendamento só entra no relatório se data+hora já passou
  function alreadyOccurred(b) {
    const now = new Date()
    const slotDate = b.date
    const todayStr = now.toISOString().split('T')[0]
    if (slotDate < todayStr) return true
    if (slotDate > todayStr) return false
    // mesmo dia: compara a hora
    const [h, m] = (b.hour ?? '23:59').split(':').map(Number)
    const slot = new Date(now); slot.setHours(h, m, 0, 0)
    return slot <= now
  }

  const proFilter = b => filterProfessional === 'all' ? true : (b.professional_id === filterProfessional || b.professional_id === null)
  const inMonth   = bookings.filter(b => b.date.startsWith(selMonth) && proFilter(b))
  const confirmed = inMonth.filter(b => (b.status === 'confirmed' || b.status === 'manual') && alreadyOccurred(b))
  const cancelled = inMonth.filter(b => b.status === 'rejected')
  const pending   = inMonth.filter(b => b.status === 'pending' || ((b.status === 'confirmed' || b.status === 'manual') && !alreadyOccurred(b)))
  const revenue   = confirmed.reduce((sum, b) => sum + (b.services?.price_cents ?? 0), 0)

  const totalConfirmed = bookings.filter(b => (b.status === 'confirmed' || b.status === 'manual') && alreadyOccurred(b) && proFilter(b)).length

  const cardStyle = { background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, padding: '20px 22px' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: T.primary, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>Relatórios</h1>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Mês</p>
            <select value={selMonth} onChange={e => setSelMonth(e.target.value)}
              style={{ padding: '9px 14px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, color: T.primary, fontFamily: FONT_MONO, fontSize: 12, cursor: 'pointer', minWidth: 180 }}>
              {availableMonths.map(ym => (
                <option key={ym} value={ym}>{fmtMonthLabel(ym)}</option>
              ))}
            </select>
          </div>
          {professionals.length > 0 && (
            <div>
              <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Profissional</p>
              <select value={filterProfessional} onChange={e => setFilterProfessional(e.target.value)} style={{ padding: '9px 14px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, color: T.primary, fontFamily: FONT_MONO, fontSize: 12, cursor: 'pointer', minWidth: 160 }}>
                <option value="all">Todos</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <RefreshBtn onRefresh={onRefresh} />
        </div>
      </div>

      {/* métricas do mês selecionado */}
      <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>
        → {fmtMonthLabel(selMonth)}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 32 }}>
        {[
          { label: 'Total de agendamentos', value: inMonth.length,    sub: 'no mês' },
          { label: 'Confirmados',           value: confirmed.length,  sub: 'concluídos ou manuais' },
          { label: 'Cancelados',            value: cancelled.length,  sub: 'rejeitados' },
          { label: 'Pendentes / Futuros',   value: pending.length,    sub: 'ainda não realizados' },
          { label: 'Faturamento estimado',  value: fmtPrice(revenue), sub: 'confirmados + manuais', accent: true },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} style={{ ...cardStyle, ...(accent ? { border: `1px solid ${ACCENT}40`, background: `${ACCENT}08` } : {}) }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: accent ? ACCENT : T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{label}</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: 30, fontWeight: 700, color: accent ? ACCENT : T.primary, marginBottom: 4, letterSpacing: '-0.02em' }}>{value}</p>
            <p style={{ fontFamily: FONT, fontSize: 12, color: T.muted }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* totais gerais */}
      <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>→ Total geral</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {[
          { label: 'Agendamentos confirmados', value: totalConfirmed, sub: 'todos os tempos' },
          { label: 'Faturamento total',        value: fmtPrice(bookings.filter(b => b.status === 'confirmed' || b.status === 'manual').reduce((s, b) => s + (b.services?.price_cents ?? 0), 0)), sub: 'todos os tempos' },
        ].map(({ label, value, sub }) => (
          <div key={label} style={cardStyle}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{label}</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: 30, fontWeight: 700, color: T.primary, marginBottom: 4, letterSpacing: '-0.02em' }}>{value}</p>
            <p style={{ fontFamily: FONT, fontSize: 12, color: T.muted }}>{sub}</p>
          </div>
        ))}
      </div>
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
function SettingsSection({ owner, services, hoursConfig, professionals, onOwnerUpdate, onServicesChange, onHoursChange, onProfessionalsChange, showToast }) {
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
    if (error) { showToast(`Erro ao salvar perfil: ${error.message}`, 'error'); return }
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
      if (error) { showToast(`Erro ao salvar serviço: ${error.message}`, 'error'); setSvcSaving(false); return }
    } else {
      const { data, error } = await supabase.from('services').insert({ ...updated, owner_id: owner.id, sort_order: editIdx }).select().single()
      if (error) { showToast(`Erro ao salvar serviço: ${error.message}`, 'error'); setSvcSaving(false); return }
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
      if (error) { showToast(`Erro ao remover: ${error.message}`, 'error'); return }
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

  async function saveHours() {
    setHoursSaving(true)
    for (const [wd, cfg] of Object.entries(localHours)) {
      const payload = {
        open:            cfg.open,
        morning_start:   cfg.open ? cfg.morning_start   || null : null,
        morning_end:     cfg.open ? cfg.morning_end     || null : null,
        afternoon_start: cfg.open ? cfg.afternoon_start || null : null,
        afternoon_end:   cfg.open ? cfg.afternoon_end   || null : null,
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

  // ── equipe ─────────────────────────────────────────────────────────────────
  const [localPros,          setLocalPros]          = useState(professionals ?? [])
  const [proEditIdx,         setProEditIdx]         = useState(null)
  const [proEditName,        setProEditName]        = useState('')
  const [proSaving,          setProSaving]          = useState(false)
  const [proEditAvatarFile,    setProEditAvatarFile]    = useState(null)
  const [proEditAvatarPreview, setProEditAvatarPreview] = useState(null)
  const [cropFile,             setCropFile]             = useState(null)
  const proAvatarInputRef = useRef(null)

  useEffect(() => { setLocalPros(professionals ?? []) }, [professionals])

  function handleAvatarSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCropFile(file)
    e.target.value = ''
  }

  function handleCropConfirm(blob) {
    if (proEditAvatarPreview) URL.revokeObjectURL(proEditAvatarPreview)
    const preview = URL.createObjectURL(blob)
    setProEditAvatarFile(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
    setProEditAvatarPreview(preview)
    setCropFile(null)
  }

  function handleCropCancel() { setCropFile(null) }

  function openProEdit(idx, pro) {
    if (proEditAvatarPreview) URL.revokeObjectURL(proEditAvatarPreview)
    setProEditAvatarFile(null)
    setProEditAvatarPreview(null)
    setCropFile(null)
    setProEditIdx(idx)
    setProEditName(pro.name)
  }

  function cancelProEdit(idx, pro) {
    setProEditIdx(null)
    if (!pro.id) setLocalPros(p => p.filter((_, i) => i !== idx))
    if (proEditAvatarPreview) URL.revokeObjectURL(proEditAvatarPreview)
    setProEditAvatarFile(null)
    setProEditAvatarPreview(null)
    setCropFile(null)
  }

  async function savePro() {
    if (!proEditName.trim()) return
    setProSaving(true)
    const existing = localPros[proEditIdx]
    try {
      // 1. criar se novo, para obter o id antes do upload
      let proId = existing?.id
      if (!proId) {
        const { data, error } = await supabase.from('professionals')
          .insert({ owner_id: owner.id, name: proEditName.trim(), sort_order: localPros.length, active: true })
          .select().single()
        if (error) throw error
        proId = data.id
      }

      // 2. upload de avatar se um arquivo foi selecionado
      let avatarUrl = existing?.avatar_url ?? null
      if (proEditAvatarFile) {
        const ext = (proEditAvatarFile.type.split('/')[1] || 'jpg').replace(/\+.*/, '')
        const path = `${owner.id}/${proId}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('avatars').upload(path, proEditAvatarFile, { upsert: true })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatarUrl = urlData.publicUrl
      }

      // 3. salvar nome + avatar_url
      const { error: updErr } = await supabase.from('professionals')
        .update({ name: proEditName.trim(), avatar_url: avatarUrl })
        .eq('id', proId)
      if (updErr) throw updErr

      if (proEditAvatarPreview) URL.revokeObjectURL(proEditAvatarPreview)
      setProEditAvatarFile(null)
      setProEditAvatarPreview(null)
      setProEditIdx(null)
      onProfessionalsChange()
      showToast('Profissional salvo.')
    } catch (err) {
      showToast(`Erro ao salvar: ${err.message}`, 'error')
    } finally {
      setProSaving(false)
    }
  }

  async function toggleProActive(pro) {
    await supabase.from('professionals').update({ active: !pro.active }).eq('id', pro.id)
    onProfessionalsChange()
    showToast(pro.active ? 'Profissional desativado.' : 'Profissional ativado.')
  }

  async function removePro(pro) {
    if (!confirm(`Remover "${pro.name}"?`)) return
    if (pro.id) {
      const { error } = await supabase.from('professionals').delete().eq('id', pro.id)
      if (error) { showToast(`Erro ao remover: ${error.message}`, 'error'); return }
    }
    setLocalPros(p => p.filter(x => x.id !== pro.id))
    if (proEditIdx !== null) setProEditIdx(null)
    onProfessionalsChange(); showToast('Profissional removido.')
  }

  function addPro() {
    const blank = { name: '', active: true }
    setLocalPros(p => [...p, blank])
    setProEditIdx(localPros.length)
    setProEditName('')
  }

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
              const cfg = localHours[wd] || { open: false, morning_start: '', morning_end: '', afternoon_start: '', afternoon_end: '' }
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

      {/* EQUIPE */}
      {tab === 'team' && (
        <div style={{ maxWidth: 480 }}>
          <p style={{ fontFamily: FONT, fontSize: 13, color: T.muted, marginBottom: 20 }}>
            Gerencie os profissionais da sua barbearia. Clientes poderão escolher com quem querem ser atendidos.
          </p>
          {/* input de arquivo oculto */}
          <input
            ref={proAvatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarSelect}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {localPros.map((pro, idx) => (
              <div key={pro.id ?? idx}>
                {proEditIdx === idx ? (
                  <Card style={{ padding: 16 }}>
                    {/* avatar upload */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
                      <div
                        onClick={() => proAvatarInputRef.current?.click()}
                        style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: ACCENT_DIM, border: `2px solid ${proEditAvatarPreview || pro.avatar_url ? ACCENT : HAIRLINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                      >
                        {(proEditAvatarPreview || pro.avatar_url) ? (
                          <img src={proEditAvatarPreview || pro.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontFamily: FONT_MONO, fontSize: 24, fontWeight: 700, color: ACCENT }}>
                            {(proEditName || '?').slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, marginTop: 8, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        {proEditAvatarPreview || pro.avatar_url ? 'Clique para trocar' : 'Adicionar foto'}
                      </p>
                    </div>

                    <Input label="Nome" placeholder="João" value={proEditName} onChange={e => setProEditName(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <SecBtn onClick={() => cancelProEdit(idx, pro)} style={{ flex: 1 }}>Cancelar</SecBtn>
                      <PrimaryBtn onClick={savePro} disabled={!proEditName.trim() || proSaving} style={{ flex: 2 }}>{proSaving ? 'Salvando...' : 'Salvar'}</PrimaryBtn>
                    </div>
                  </Card>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, opacity: pro.active === false ? 0.5 : 1 }}>
                    {/* avatar */}
                    <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: ACCENT_DIM, border: `1px solid rgba(235,188,99,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {pro.avatar_url ? (
                        <img src={pro.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: ACCENT }}>
                          {(pro.name || '?').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary }}>{pro.name || '(sem nome)'}</p>
                      {pro.id && <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, marginTop: 2 }}>{pro.active !== false ? 'Ativo' : 'Inativo'}</p>}
                    </div>
                    {pro.id && <IconBtn onClick={() => toggleProActive(pro)}>{pro.active !== false ? 'desativar' : 'ativar'}</IconBtn>}
                    <IconBtn onClick={() => openProEdit(idx, pro)}>editar</IconBtn>
                    <IconBtn onClick={() => removePro(pro)} danger>×</IconBtn>
                  </div>
                )}
              </div>
            ))}
          </div>
          <GhostBtn onClick={addPro} style={{ color: ACCENT }}>+ Adicionar profissional</GhostBtn>
        </div>
      )}

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function Dashboard({ owner: initialOwner, onSignOut, onOwnerUpdate }) {
  const isMobile = useIsMobile()
  const [owner,         setOwner]         = useState(initialOwner)
  const [section,       setSection]       = useState('bookings')
  const [bookings,      setBookings]      = useState([])
  const [services,      setServices]      = useState([])
  const [hoursConfig,   setHoursConfig]   = useState({})
  const [professionals, setProfessionals] = useState([])
  const [blockedSlots,  setBlockedSlots]  = useState([])
  const [loading,       setLoading]       = useState(true)
  const [toast,         setToast]         = useState(null)

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

  // ── expiração de plano pago ───────────────────────────────────────────────
  const planExpiresAt    = isPaidPlan && owner.plan_expires_at ? new Date(owner.plan_expires_at) : null
  const planExpired      = Boolean(planExpiresAt && planExpiresAt < now)
  const planMsLeft       = planExpiresAt ? Math.max(0, planExpiresAt - now) : 0
  const planDaysLeft     = Math.ceil(planMsLeft / 86400000)
  const planExpiringSoon = Boolean(planExpiresAt && planExpiresAt >= now && planDaysLeft <= 7)
  // owner tem asaas_subscription_id → plano mensal com renovação automática
  // sem subscription_id → cobrança única (semestral/anual) → renovação manual
  const autoRenews       = Boolean(owner.asaas_subscription_id)

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
    setBookings((data ?? []).map(b => ({ ...b, professional_id: b.professional_id ?? null })))
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

  const loadProfessionals = useCallback(async () => {
    const { data } = await supabase.from('professionals').select('*').eq('owner_id', owner.id).order('sort_order')
    setProfessionals(data ?? [])
  }, [owner.id])

  const loadBlockedSlots = useCallback(async () => {
    const { data } = await supabase.from('blocked_slots').select('*').eq('owner_id', owner.id)
    setBlockedSlots(data ?? [])
  }, [owner.id])

  useEffect(() => {
    Promise.all([loadBookings(), loadServices(), loadHours(), loadProfessionals(), loadBlockedSlots()]).finally(() => setLoading(false))
    const channel = supabase.channel('admin-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `owner_id=eq.${owner.id}` }, loadBookings)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadBookings, loadServices, loadHours, loadBlockedSlots])

  async function updateStatus(id, status) {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
    if (error) { showToast(`Erro ao atualizar: ${error.message}`, 'error'); return }
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
        {/* aviso de expiração de plano pago */}
        {(planExpired || planExpiringSoon) && (
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: RADIUS, background: planExpired ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.08)', border: `1px solid ${planExpired ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.35)'}` }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: planExpired ? '#F87171' : '#FBBF24', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              {planExpired ? 'Plano expirado' : `Expira em ${planDaysLeft}d`}
            </p>
            {planExpired ? (
              <p style={{ fontFamily: FONT, fontSize: 12, color: '#F87171', lineHeight: 1.4 }}>Renove para reativar o app.</p>
            ) : (
              <p style={{ fontFamily: FONT, fontSize: 12, color: '#FBBF24', lineHeight: 1.4 }}>
                {autoRenews ? 'Renovação automática agendada.' : 'Renove antes de expirar.'}
              </p>
            )}
            {!autoRenews && (
              <button onClick={() => setSection('plans')} style={{ marginTop: 8, background: 'transparent', border: `1px solid ${planExpired ? 'rgba(239,68,68,0.4)' : 'rgba(251,191,36,0.4)'}`, borderRadius: 6, padding: '3px 10px', color: planExpired ? '#F87171' : '#FBBF24', fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', width: '100%' }}>
                Renovar plano
              </button>
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
      {/* faixa de expiração de plano pago — mobile */}
      {isMobile && (planExpired || planExpiringSoon) && (
        <div style={{ background: planExpired ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.08)', borderBottom: `1px solid ${planExpired ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.35)'}`, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: planExpired ? '#F87171' : '#FBBF24', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {planExpired ? 'Plano expirado' : `Plano expira em ${planDaysLeft} dia${planDaysLeft !== 1 ? 's' : ''}`}
          </p>
          {!autoRenews && (
            <button onClick={() => setSection('plans')} style={{ background: 'transparent', border: `1px solid ${planExpired ? 'rgba(239,68,68,0.4)' : 'rgba(251,191,36,0.4)'}`, borderRadius: 6, padding: '3px 10px', color: planExpired ? '#F87171' : '#FBBF24', fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', flexShrink: 0 }}>
              {planExpired ? 'Renovar' : 'Renovar agora'}
            </button>
          )}
          {autoRenews && !planExpired && (
            <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#FBBF24' }}>Renovação automática</p>
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
        {/* paywall de plano pago expirado */}
        {planExpired && section !== 'plans' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,12,8,0.92)', backdropFilter: 'blur(6px)', padding: 32 }}>
            <div style={{ maxWidth: 420, textAlign: 'center' }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#F87171', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 16 }}>→ PLANO EXPIRADO</p>
              <h2 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: T.primary, marginBottom: 12, letterSpacing: '-0.02em' }}>Seu plano encerrou.</h2>
              <p style={{ fontFamily: FONT, fontSize: 14, color: T.muted, lineHeight: 1.6, marginBottom: 32 }}>
                O link de agendamento dos clientes foi suspenso. Renove o plano para reativar tudo imediatamente.
              </p>
              <button onClick={() => setSection('plans')}
                style={{ background: ACCENT, border: 'none', borderRadius: RADIUS, padding: '14px 32px', color: INK, fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Renovar plano
              </button>
            </div>
          </div>
        )}

        {section === 'bookings' && (
          <BookingsSection bookings={bookings} loading={loading} updateStatus={updateStatus} deleteBooking={deleteBooking} onRefresh={loadBookings} professionals={professionals} />
        )}
        {section === 'calendar' && (
          <CalendarSection
            bookings={bookings} updateStatus={updateStatus} onRefresh={loadBookings}
            hoursConfig={hoursConfig} blockedSlots={blockedSlots} onBlockedSlotsChange={loadBlockedSlots}
            services={services} professionals={professionals} owner={owner} showToast={showToast}
          />
        )}
        {section === 'reports' && (
          <ReportsSection bookings={bookings} onRefresh={loadBookings} professionals={professionals} />
        )}
        {section === 'client-link' && (
          <ClientLinkSection owner={owner} showToast={showToast} />
        )}
        {section === 'settings' && (
          <SettingsSection
            owner={owner} services={services} hoursConfig={hoursConfig}
            professionals={professionals}
            onOwnerUpdate={handleOwnerUpdate} onServicesChange={loadServices}
            onHoursChange={loadHours} onProfessionalsChange={loadProfessionals}
            showToast={showToast}
          />
        )}
        {section === 'plans' && <PlansSection owner={owner} />}
      </main>
      {BottomNav}
      <Toast toast={toast} onClose={() => setToast(null)} style={{ bottom: isMobile ? 72 : 24, right: isMobile ? 16 : 24, left: isMobile ? 16 : 'auto' }} />
    </div>
  )
}
