import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  NavalhaLogo, Eyebrow, PrimaryBtn, SecBtn, GhostBtn, IconBtn,
  Badge, Card, Modal, Toast, Spinner, Divider, PageTitle, Input, Field,
} from '../components/ui.jsx'
import { FONT, FONT_MONO, T, ACCENT, ACCENT_DIM, INK, INK2, HAIRLINE, RADIUS, STATUS_COLOR } from '../tokens.js'

// URL base do app de agendamento do cliente
const CLIENT_APP_URL = 'https://barbearia-app-gamma.vercel.app'

// ── helpers ───────────────────────────────────────────────────────────────────
function today()      { return new Date().toISOString().split('T')[0] }
function fmtDateFull(d) { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) }
function fmtMonthYear(d){ return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
function fmtPrice(c)  { return `R$ ${(c / 100).toFixed(2).replace('.', ',')}` }
function centsToStr(c){ return (c / 100).toFixed(2).replace('.', ',') }
function strToCents(v){ return Math.round(parseFloat(v.replace(',', '.')) * 100) || 0 }
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay() }
function slugify(v)   { return v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') }
function formatPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (!d.length) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
function phoneToDisplay(raw) {
  if (!raw) return ''
  // remove DDI 55 se vier com 13 dígitos
  const digits = raw.replace(/\D/g, '')
  const local = digits.length === 13 && digits.startsWith('55') ? digits.slice(2) : digits
  return formatPhone(local)
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const TIME_SLOTS = Array.from({ length: 35 }, (_, i) => {
  const total = 360 + i * 30
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return `${h}:${m}`
})

// ── nav ───────────────────────────────────────────────────────────────────────
const NAV = [
  { key: 'bookings',  label: 'Agendamentos', icon: '◈' },
  { key: 'calendar',  label: 'Calendário',   icon: '▦' },
  { key: 'reports',   label: 'Relatórios',   icon: '▤' },
  { key: 'settings',  label: 'Configurações', icon: '◎' },
]

// ── componentes locais ────────────────────────────────────────────────────────
function TimeSelect({ value, onChange, placeholder = '—' }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '9px 10px', background: INK, border: `1px solid ${HAIRLINE}`, borderRadius: 8, color: value ? T.primary : T.hint, fontFamily: FONT_MONO, fontSize: 13, cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}>
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
    <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: INK2, borderRadius: RADIUS, padding: 4, border: `1px solid ${HAIRLINE}`, width: 'fit-content' }}>
      {[['profile', 'Perfil'], ['services', 'Serviços'], ['hours', 'Horários']].map(([key, label]) => (
        <button key={key} onClick={() => onChange(key)} style={{ padding: '8px 18px', borderRadius: RADIUS - 4, border: 'none', cursor: 'pointer', background: active === key ? ACCENT : 'transparent', color: active === key ? INK : T.muted, fontFamily: FONT, fontWeight: active === key ? 700 : 400, fontSize: 13, transition: 'all 0.15s' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

// ── seção configurações (componente externo para não remontar) ─────────────────
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
    if (!profSlug || profSlug.length < 3 || profSlug === owner.slug) { setSlugStatus(profSlug === owner.slug ? 'same' : 'idle'); return }
    setSlugStatus('checking')
    clearTimeout(slugTimer.current)
    slugTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('owners').select('id').eq('slug', profSlug).neq('id', owner.id).maybeSingle()
      setSlugStatus(data ? 'taken' : 'available')
    }, 500)
    return () => clearTimeout(slugTimer.current)
  }, [profSlug, owner.slug, owner.id])

  async function saveProfile() {
    if (!profName.trim()) return
    if (slugStatus === 'taken') return
    setProfSaving(true)
    const rawPhone = profWhatsapp.replace(/\D/g, '')
    const { data, error } = await supabase.from('owners')
      .update({ name: profName.trim(), slug: profSlug, whatsapp: rawPhone })
      .eq('id', owner.id)
      .select()
      .single()
    setProfSaving(false)
    if (error) { showToast('Erro ao salvar perfil.', 'error'); return }
    onOwnerUpdate(data)
    showToast('Perfil atualizado.')
  }

  const clientUrl = `${CLIENT_APP_URL}/${profSlug || owner.slug}`
  const slugHint = { idle: 'URL pública do app de agendamento.', same: clientUrl, checking: 'Verificando...', available: `✓ Disponível — ${clientUrl}`, taken: 'Slug já em uso.' }[slugStatus]
  const slugError = slugStatus === 'taken' ? slugHint : ''
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
      onServicesChange()
      setEditIdx(null); setSvcSaving(false); return
    }
    setSvcSaving(false)
    onServicesChange()
    setEditIdx(null)
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
    onServicesChange()
    showToast('Serviço removido.')
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
        open: cfg.open,
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
    setHoursSaving(false)
    onHoursChange()
    showToast('Horários salvos.')
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageTitle>Configurações</PageTitle>
      <SettingsTabs active={tab} onChange={setTab} />

      {/* PERFIL */}
      {tab === 'profile' && (
        <div style={{ maxWidth: 480 }}>
          {/* card: link do cliente */}
          <div style={{ background: `${ACCENT}12`, border: `1px solid ${ACCENT}40`, borderRadius: RADIUS, padding: '16px 18px', marginBottom: 24 }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: ACCENT, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Link dos clientes</p>
            <p style={{ fontFamily: FONT, fontSize: 12, color: T.muted, marginBottom: 10 }}>Compartilhe este link para seus clientes fazerem agendamentos.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.primary, wordBreak: 'break-all', flex: 1 }}>{clientUrl}</span>
              <button
                onClick={() => navigator.clipboard?.writeText(clientUrl).then(() => showToast('Link copiado.'))}
                style={{ background: ACCENT, border: 'none', borderRadius: RADIUS - 4, padding: '7px 14px', color: INK, fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Copiar
              </button>
              <a href={clientUrl} target="_blank" rel="noreferrer"
                style={{ background: 'transparent', border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS - 4, padding: '6px 12px', color: T.muted, fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none' }}
              >
                Abrir
              </a>
            </div>
          </div>

          <Input label="Nome da barbearia" value={profName} onChange={e => setProfName(e.target.value)} placeholder="Barbearia do João" />
          <Input
            label="Slug (URL)"
            value={profSlug}
            onChange={e => setProfSlug(slugify(e.target.value))}
            placeholder="joao-barbearia"
            hint={!slugError ? slugHint : ''}
            error={slugError}
          />
          {authEmail && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>E-mail da conta</p>
              <div style={{ padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, fontFamily: FONT, fontSize: 14, color: T.muted }}>
                {authEmail}
              </div>
            </div>
          )}
          <Input
            label="WhatsApp"
            placeholder="(XX) XXXXX-XXXX"
            value={profWhatsapp}
            onChange={e => setProfWhatsapp(formatPhone(e.target.value))}
            inputMode="numeric"
            hint="Número para receber notificações de agendamento."
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
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
        <div style={{ maxWidth: 560 }}>
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
                    <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${HAIRLINE}` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                        <div>
                          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Manhã</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <TimeSelect value={cfg.morning_start} onChange={v => setHourField(wd, 'morning_start', v)} placeholder="início" />
                            <span style={{ color: T.hint, fontSize: 12, flexShrink: 0 }}>→</span>
                            <TimeSelect value={cfg.morning_end} onChange={v => setHourField(wd, 'morning_end', v)} placeholder="fim" />
                          </div>
                        </div>
                        <div>
                          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Tarde</p>
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
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function Dashboard({ owner: initialOwner, onSignOut, onOwnerUpdate }) {
  const [owner,       setOwner]       = useState(initialOwner)
  const [section,     setSection]     = useState('bookings')
  const [bookings,    setBookings]    = useState([])
  const [services,    setServices]    = useState([])
  const [hoursConfig, setHoursConfig] = useState({})
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function handleOwnerUpdate(updated) {
    setOwner(updated)
    onOwnerUpdate(updated)
  }

  // ── carregar dados ─────────────────────────────────────────────────────────
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

  // ── ações de booking ───────────────────────────────────────────────────────
  async function updateStatus(id, status) {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
    if (error) { showToast('Erro ao atualizar status.', 'error'); return }
    showToast(status === 'confirmed' ? 'Agendamento confirmado.' : 'Agendamento recusado.')
    loadBookings()
  }

  async function deleteBooking(id) {
    if (!confirm('Remover este agendamento?')) return
    await supabase.from('bookings').delete().eq('id', id)
    showToast('Agendamento removido.')
    loadBookings()
  }

  // ── sidebar ────────────────────────────────────────────────────────────────
  const Sidebar = (
    <div style={{ width: 220, flexShrink: 0, background: INK2, borderRight: `1px solid ${HAIRLINE}`, display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'sticky', top: 0 }}>
      <div style={{ padding: '24px 20px 20px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <NavalhaLogo size={28} />
      </div>
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {NAV.map(item => {
          const active = section === item.key
          return (
            <button key={item.key} onClick={() => setSection(item.key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: RADIUS, border: 'none', cursor: 'pointer', background: active ? ACCENT_DIM : 'transparent', color: active ? ACCENT : T.muted, fontFamily: FONT, fontWeight: active ? 600 : 400, fontSize: 14, marginBottom: 2, transition: 'background 0.15s, color 0.15s', textAlign: 'left' }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 14, width: 18, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>
      <div style={{ padding: '16px 20px', borderTop: `1px solid ${HAIRLINE}` }}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Barbearia</p>
        <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: T.primary, marginBottom: 2 }}>{owner.name}</p>
        {owner.slug && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{owner.slug}</p>
            <button
              title="Copiar link dos clientes"
              onClick={() => navigator.clipboard?.writeText(`${CLIENT_APP_URL}/${owner.slug}`).then(() => showToast('Link copiado.'))}
              style={{ background: 'transparent', border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: '3px 8px', color: ACCENT, fontFamily: FONT_MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', flexShrink: 0 }}
            >
              copiar link
            </button>
          </div>
        )}
        <GhostBtn onClick={onSignOut} style={{ fontSize: 12, color: '#F87171' }}>Sair</GhostBtn>
      </div>
    </div>
  )

  // ── seção: agendamentos ────────────────────────────────────────────────────
  function BookingsSection() {
    const [filterDate,   setFilterDate]   = useState(today())
    const [filterStatus, setFilterStatus] = useState('all')
    const [detail,       setDetail]       = useState(null)

    const filtered = bookings.filter(b => {
      const matchDate   = !filterDate || b.date === filterDate
      const matchStatus = filterStatus === 'all' || b.status === filterStatus
      return matchDate && matchStatus
    })

    return (
      <div>
        <PageTitle>Agendamentos</PageTitle>
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Data</p>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ padding: '10px 12px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, color: T.primary, fontFamily: FONT_MONO, fontSize: 13, colorScheme: 'dark', cursor: 'pointer' }} />
          </div>
          <div>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.hint, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Status</p>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '10px 12px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, color: T.primary, fontFamily: FONT, fontSize: 13, cursor: 'pointer' }}>
              <option value="all">Todos</option>
              <option value="pending">Pendente</option>
              <option value="confirmed">Confirmado</option>
              <option value="rejected">Recusado</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <GhostBtn onClick={() => { setFilterDate(''); setFilterStatus('all') }}>Limpar filtros</GhostBtn>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <p style={{ fontFamily: FONT, fontSize: 14, color: T.hint, padding: '40px 0', textAlign: 'center' }}>Nenhum agendamento encontrado.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS, cursor: 'pointer' }} onClick={() => setDetail(b)}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 600, color: ACCENT, minWidth: 48 }}>{b.hour?.slice(0, 5)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary, marginBottom: 2 }}>{b.client_name}</p>
                  <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted }}>{b.services?.name ?? '—'} · {new Date(b.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                </div>
                <Badge status={b.status} />
                {b.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <IconBtn onClick={() => updateStatus(b.id, 'confirmed')}>✓ Confirmar</IconBtn>
                    <IconBtn onClick={() => updateStatus(b.id, 'rejected')} danger>✕ Recusar</IconBtn>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {detail && (
          <Modal onClose={() => setDetail(null)}>
            <Card>
              <Eyebrow>Agendamento · {detail.code}</Eyebrow>
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
                {detail.status === 'pending' && <>
                  <SecBtn onClick={() => { updateStatus(detail.id, 'rejected'); setDetail(null) }} style={{ flex: 1 }}>Recusar</SecBtn>
                  <PrimaryBtn onClick={() => { updateStatus(detail.id, 'confirmed'); setDetail(null) }} style={{ flex: 2 }}>Confirmar</PrimaryBtn>
                </>}
                {detail.status !== 'pending' && (
                  <IconBtn danger onClick={() => { deleteBooking(detail.id); setDetail(null) }}>Remover agendamento</IconBtn>
                )}
              </div>
            </Card>
          </Modal>
        )}
      </div>
    )
  }

  // ── seção: calendário ──────────────────────────────────────────────────────
  function CalendarSection() {
    const now = new Date()
    const [calYear,  setCalYear]  = useState(now.getFullYear())
    const [calMonth, setCalMonth] = useState(now.getMonth())
    const [selDay,   setSelDay]   = useState(null)

    const daysInMonth = getDaysInMonth(calYear, calMonth)
    const firstDay    = getFirstDay(calYear, calMonth)
    const monthDate   = new Date(calYear, calMonth, 1)

    function prevMonth() { if (calMonth===0){setCalYear(y=>y-1);setCalMonth(11)}else setCalMonth(m=>m-1); setSelDay(null) }
    function nextMonth() { if (calMonth===11){setCalYear(y=>y+1);setCalMonth(0)}else setCalMonth(m=>m+1); setSelDay(null) }

    function bookingsForDate(day) {
      const d = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      return bookings.filter(b => b.date === d)
    }

    const selectedStr  = selDay ? `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(selDay).padStart(2,'0')}` : null
    const dayBookings  = selectedStr ? bookings.filter(b => b.date === selectedStr) : []

    return (
      <div>
        <PageTitle>Calendário</PageTitle>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 360px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <button onClick={prevMonth} style={{ background: 'none', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '6px 12px', color: T.muted, cursor: 'pointer' }}>←</button>
              <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: T.primary, textTransform: 'capitalize' }}>{fmtMonthYear(monthDate)}</p>
              <button onClick={nextMonth} style={{ background: 'none', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '6px 12px', color: T.muted, cursor: 'pointer' }}>→</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
              {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
                <div key={d} style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.hint, textAlign: 'center', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const bks = bookingsForDate(day)
                const isToday   = dateStr === today()
                const isSel     = selDay === day
                const hasPending = bks.some(b => b.status === 'pending')
                return (
                  <div key={day} onClick={() => setSelDay(day === selDay ? null : day)} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 10, cursor: 'pointer', border: `1px solid ${isSel ? ACCENT : isToday ? 'rgba(235,188,99,0.3)' : 'transparent'}`, background: isSel ? ACCENT_DIM : 'transparent', transition: 'background 0.15s' }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: isSel ? ACCENT : isToday ? ACCENT : T.primary }}>{day}</span>
                    {bks.length > 0 && <div style={{ width: 6, height: 6, borderRadius: '50%', background: hasPending ? STATUS_COLOR.pending : STATUS_COLOR.confirmed, marginTop: 2 }} />}
                  </div>
                )
              })}
            </div>
          </div>

          {selDay && (
            <div style={{ flex: '1 1 300px' }}>
              <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: T.primary, marginBottom: 16, textTransform: 'capitalize' }}>{fmtDateFull(selectedStr)}</p>
              {dayBookings.length === 0 ? (
                <p style={{ fontFamily: FONT, fontSize: 14, color: T.hint }}>Sem agendamentos neste dia.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayBookings.map(b => (
                    <div key={b.id} style={{ padding: '12px 16px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 14, color: ACCENT }}>{b.hour?.slice(0, 5)}</span>
                        <Badge status={b.status} />
                      </div>
                      <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary }}>{b.client_name}</p>
                      <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted, marginTop: 2 }}>{b.services?.name ?? '—'}</p>
                      {b.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          <IconBtn onClick={() => updateStatus(b.id, 'confirmed')}>✓</IconBtn>
                          <IconBtn onClick={() => updateStatus(b.id, 'rejected')} danger>✕</IconBtn>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── seção: relatórios ──────────────────────────────────────────────────────
  function ReportsSection() {
    const confirmed = bookings.filter(b => b.status === 'confirmed' || b.status === 'manual')
    const pending   = bookings.filter(b => b.status === 'pending')
    const monthPfx  = today().slice(0, 7)
    const thisMonth = bookings.filter(b => b.date.startsWith(monthPfx))
    const revenue   = confirmed.filter(b => b.date.startsWith(monthPfx)).reduce((sum, b) => sum + (b.services?.price_cents ?? 0), 0)

    return (
      <div>
        <PageTitle>Relatórios</PageTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          {[
            ['Total este mês', thisMonth.length, 'agendamentos'],
            ['Confirmados este mês', confirmed.filter(b => b.date.startsWith(monthPfx)).length, 'agendamentos'],
            ['Pendentes', pending.length, 'aguardando confirmação'],
            ['Faturamento estimado', fmtPrice(revenue), 'este mês (confirmados)'],
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

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {Sidebar}
      <main style={{ flex: 1, padding: '32px 36px', overflowY: 'auto', maxWidth: 900 }}>
        {section === 'bookings'  && <BookingsSection />}
        {section === 'calendar'  && <CalendarSection />}
        {section === 'reports'   && <ReportsSection />}
        {section === 'settings'  && (
          <SettingsSection
            owner={owner}
            services={services}
            hoursConfig={hoursConfig}
            onOwnerUpdate={handleOwnerUpdate}
            onServicesChange={loadServices}
            onHoursChange={loadHours}
            showToast={showToast}
          />
        )}
      </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
