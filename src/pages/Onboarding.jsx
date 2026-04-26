import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { NavalhaLogo, Eyebrow, PrimaryBtn, SecBtn, GhostBtn, Input, Card, IconBtn } from '../components/ui.jsx'
import { FONT, FONT_MONO, T, ACCENT, HAIRLINE, INK, INK2, RADIUS } from '../tokens.js'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const DEFAULT_SERVICES = [
  { name: 'Corte', price_cents: 4000, duration_min: 30 },
  { name: 'Barba', price_cents: 2500, duration_min: 20 },
  { name: 'Corte + Barba', price_cents: 6000, duration_min: 45 },
]

const DEFAULT_HOURS = {
  0: { open: false, morning_start: '', morning_end: '', afternoon_start: '', afternoon_end: '' },
  1: { open: true, morning_start: '09:00', morning_end: '11:30', afternoon_start: '13:30', afternoon_end: '19:30' },
  2: { open: true, morning_start: '09:00', morning_end: '11:30', afternoon_start: '13:30', afternoon_end: '19:30' },
  3: { open: true, morning_start: '09:00', morning_end: '11:30', afternoon_start: '13:30', afternoon_end: '19:30' },
  4: { open: true, morning_start: '09:00', morning_end: '11:30', afternoon_start: '13:30', afternoon_end: '19:30' },
  5: { open: true, morning_start: '09:00', morning_end: '11:30', afternoon_start: '13:30', afternoon_end: '19:30' },
  6: { open: true, morning_start: '09:00', morning_end: '11:30', afternoon_start: '13:30', afternoon_end: '19:30' },
}

const TIME_SLOTS = Array.from({ length: 35 }, (_, i) => {
  const total = 360 + i * 30
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return `${h}:${m}`
})

function softSlugify(v) { return v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }
function slugify(v)     { return softSlugify(v).replace(/^-+|-+$/g, '') }
function centsToReal(cents) { return (cents / 100).toFixed(2).replace('.', ',') }
function realToCents(v) { return Math.round(parseFloat(v.replace(',', '.')) * 100) || 0 }

function formatPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (!d.length) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// ── select de horário customizado ─────────────────────────────────────────────
function TimeSelect({ value, onChange, placeholder = '—' }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '9px 10px', background: INK,
        border: `1px solid ${HAIRLINE}`, borderRadius: 8,
        color: value ? T.primary : T.hint,
        fontFamily: FONT_MONO, fontSize: 13, cursor: 'pointer',
        appearance: 'none', WebkitAppearance: 'none',
      }}
    >
      <option value="" disabled>{placeholder}</option>
      {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}

// ── toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <div onClick={() => onChange(!on)} style={{ width: 38, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'background 0.2s', background: on ? ACCENT : 'rgba(235,188,99,0.15)', position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: on ? INK : T.hint, transition: 'left 0.2s' }} />
    </div>
  )
}

export default function Onboarding({ owner, onComplete }) {
  const [step, setStep]     = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // step 1
  const [barbName, setBarbName] = useState(owner.name || '')
  const [slug, setSlug]         = useState(owner.slug || '')
  const [whatsapp, setWhatsapp] = useState(owner.whatsapp ? formatPhone(owner.whatsapp.replace(/^55/, '').slice(-11)) : '')
  const [slugStatus, setSlugStatus] = useState('idle')
  const slugTimer = useRef(null)

  // step 2
  const [services, setServices] = useState(DEFAULT_SERVICES.map(s => ({ ...s, _id: Math.random() })))
  const [editIdx, setEditIdx]   = useState(null)
  const [editForm, setEditForm] = useState({})

  // step 3
  const [hours, setHours] = useState(DEFAULT_HOURS)

  // ── validação de slug ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug || slug.length < 3) { setSlugStatus('idle'); return }
    setSlugStatus('checking')
    clearTimeout(slugTimer.current)
    slugTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('owners').select('id').eq('slug', slug).neq('id', owner.id).maybeSingle()
      setSlugStatus(data ? 'taken' : 'available')
    }, 500)
    return () => clearTimeout(slugTimer.current)
  }, [slug, owner.id])

  // ── salvar tudo ──────────────────────────────────────────────────────────────
  async function handleComplete() {
    setError('')
    setSaving(true)
    try {
      const rawPhone = whatsapp.replace(/\D/g, '')
      const { error: e1 } = await supabase.from('owners').update({
        name: barbName.trim(), slug, whatsapp: rawPhone, active: true,
      }).eq('id', owner.id)
      if (e1) throw e1

      const svcs = services.map(({ name, price_cents, duration_min }, i) => ({
        owner_id: owner.id, name, price_cents, duration_min, sort_order: i,
      }))
      const { error: e2 } = await supabase.from('services').insert(svcs)
      if (e2) throw e2

      const hrs = Object.entries(hours).map(([wd, cfg]) => ({
        owner_id: owner.id, weekday: parseInt(wd), open: cfg.open,
        morning_start:    cfg.open ? cfg.morning_start    || null : null,
        morning_end:      cfg.open ? cfg.morning_end      || null : null,
        afternoon_start:  cfg.open ? cfg.afternoon_start  || null : null,
        afternoon_end:    cfg.open ? cfg.afternoon_end    || null : null,
        blocked_ranges:   cfg.open ? (cfg.blocked_ranges || []).filter(r => r.start && r.end) : [],
      }))
      const { error: e3 } = await supabase.from('hours_config').insert(hrs)
      if (e3) throw e3

      onComplete({ ...owner, name: barbName.trim(), slug, whatsapp: rawPhone })
    } catch (err) {
      setError(err.message || 'Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // ── helpers step 2 ───────────────────────────────────────────────────────────
  function startEdit(idx) {
    setEditIdx(idx)
    setEditForm({ ...services[idx], priceDisplay: centsToReal(services[idx].price_cents) })
  }

  function saveEdit() {
    const updated = [...services]
    updated[editIdx] = { _id: editForm._id, name: editForm.name, duration_min: editForm.duration_min, price_cents: realToCents(editForm.priceDisplay) }
    setServices(updated)
    setEditIdx(null)
  }

  function addService() {
    const newSvc = { name: '', price_cents: 0, duration_min: 30, _id: Math.random() }
    setServices(s => [...s, newSvc])
    setEditIdx(services.length)
    setEditForm({ ...newSvc, priceDisplay: '0,00' })
  }

  function removeService(idx) {
    setServices(s => s.filter((_, i) => i !== idx))
    if (editIdx === idx) setEditIdx(null)
  }

  function setHourField(wd, field, val) {
    setHours(h => ({ ...h, [wd]: { ...h[wd], [field]: val } }))
  }

  function addBlockedRange(wd) {
    setHours(h => ({ ...h, [wd]: { ...h[wd], blocked_ranges: [...(h[wd]?.blocked_ranges || []), { start: '', end: '' }] } }))
  }
  function removeBlockedRange(wd, idx) {
    setHours(h => ({ ...h, [wd]: { ...h[wd], blocked_ranges: (h[wd]?.blocked_ranges || []).filter((_, i) => i !== idx) } }))
  }
  function updateBlockedRange(wd, idx, field, val) {
    setHours(h => ({ ...h, [wd]: { ...h[wd], blocked_ranges: (h[wd]?.blocked_ranges || []).map((r, i) => i === idx ? { ...r, [field]: val } : r) } }))
  }

  // ── barra de progresso ───────────────────────────────────────────────────────
  const progress = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
      {[1, 2, 3].map(n => (
        <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= step ? ACCENT : HAIRLINE, transition: 'background 0.3s' }} />
      ))}
    </div>
  )

  // ── step 1 ───────────────────────────────────────────────────────────────────
  const slugHint = {
    idle:      slug.length > 0 && slug.length < 3 ? 'Mínimo 3 caracteres.' : 'Esta será a URL pública do seu app de agendamento.',
    checking:  'Verificando disponibilidade...',
    available: `✓ Disponível — barbearia-app-gamma.vercel.app/${slug}`,
    taken:     'Este slug já está em uso. Escolha outro.',
  }[slugStatus]

  const step1Valid = barbName.trim().length >= 2 && slug.length >= 3 && slugStatus === 'available'

  const renderStep1 = (
    <>
      <Eyebrow>Passo 1 de 3</Eyebrow>
      <h2 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: T.primary, marginBottom: 24, letterSpacing: '-0.02em' }}>Dados da barbearia.</h2>
      <Input label="Nome da barbearia" placeholder="Barbearia do João" value={barbName} onChange={e => setBarbName(e.target.value)} />
      <Input
        label="Slug (URL)"
        placeholder="joao-barbearia"
        value={slug}
        onChange={e => setSlug(softSlugify(e.target.value))}
        onBlur={e => setSlug(slugify(e.target.value))}
        error={slugStatus === 'taken' ? slugHint : ''}
        hint={slugStatus !== 'taken' ? slugHint : ''}
      />
      <Input
        label="WhatsApp"
        placeholder="(XX) XXXXX-XXXX"
        value={whatsapp}
        onChange={e => setWhatsapp(formatPhone(e.target.value))}
        inputMode="numeric"
        hint="Número para receber notificações de agendamento."
      />
      <PrimaryBtn disabled={!step1Valid} onClick={() => setStep(2)}>Continuar</PrimaryBtn>
    </>
  )

  // ── step 2 ───────────────────────────────────────────────────────────────────
  const renderStep2 = (
    <>
      <Eyebrow>Passo 2 de 3</Eyebrow>
      <h2 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: T.primary, marginBottom: 24, letterSpacing: '-0.02em' }}>Configure seus serviços.</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {services.map((svc, idx) => (
          <div key={svc._id}>
            {editIdx === idx ? (
              <Card style={{ padding: 16 }}>
                <Input label="Nome" placeholder="Corte" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Input label="Preço (R$)" placeholder="40,00" value={editForm.priceDisplay} onChange={e => setEditForm(f => ({ ...f, priceDisplay: e.target.value }))} />
                  <Input label="Duração (min)" type="number" placeholder="30" value={editForm.duration_min} onChange={e => setEditForm(f => ({ ...f, duration_min: parseInt(e.target.value) || 0 }))} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <SecBtn onClick={() => setEditIdx(null)} style={{ flex: 1 }}>Cancelar</SecBtn>
                  <PrimaryBtn onClick={saveEdit} disabled={!editForm.name.trim()} style={{ flex: 2 }}>Salvar</PrimaryBtn>
                </div>
              </Card>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: T.primary }}>{svc.name || '(sem nome)'}</p>
                  <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.muted, marginTop: 2 }}>R$ {centsToReal(svc.price_cents)} · {svc.duration_min}min</p>
                </div>
                <IconBtn onClick={() => startEdit(idx)}>editar</IconBtn>
                <IconBtn onClick={() => removeService(idx)} danger>×</IconBtn>
              </div>
            )}
          </div>
        ))}
      </div>
      <GhostBtn onClick={addService} style={{ marginBottom: 24, color: ACCENT }}>+ Adicionar serviço</GhostBtn>
      <div style={{ display: 'flex', gap: 8 }}>
        <SecBtn onClick={() => setStep(1)} style={{ flex: 1 }}>Voltar</SecBtn>
        <PrimaryBtn disabled={services.length === 0 || editIdx !== null} onClick={() => setStep(3)} style={{ flex: 2 }}>Continuar</PrimaryBtn>
      </div>
    </>
  )

  // ── step 3 ───────────────────────────────────────────────────────────────────
  const renderStep3 = (
    <>
      <Eyebrow>Passo 3 de 3</Eyebrow>
      <h2 style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: T.primary, marginBottom: 8, letterSpacing: '-0.02em' }}>Configure seus horários.</h2>
      <p style={{ fontFamily: FONT, fontSize: 13, color: T.hint, marginBottom: 24 }}>Defina os horários de funcionamento e bloqueie períodos específicos.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
        {DIAS.map((dia, wd) => {
          const cfg = hours[wd]
          return (
            <div key={wd} style={{ background: INK2, border: `1px solid ${cfg.open ? HAIRLINE : 'transparent'}`, borderRadius: RADIUS, overflow: 'hidden', transition: 'border-color 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: cfg.open ? T.primary : T.hint }}>{dia}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: cfg.open ? ACCENT : T.hint, transition: 'color 0.2s' }}>
                    {cfg.open ? 'Aberto' : 'Fechado'}
                  </span>
                  <Toggle on={cfg.open} onChange={v => setHourField(wd, 'open', v)} />
                </div>
              </div>

              {cfg.open && (
                <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${HAIRLINE}` }}>
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
                  {(cfg.blocked_ranges || []).length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${HAIRLINE}` }}>
                      <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#F87171', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Períodos bloqueados</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(cfg.blocked_ranges || []).map((range, ri) => (
                          <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1 }}><TimeSelect value={range.start} onChange={v => updateBlockedRange(wd, ri, 'start', v)} placeholder="início" /></div>
                            <span style={{ color: T.hint, fontSize: 12, flexShrink: 0 }}>→</span>
                            <div style={{ flex: 1 }}><TimeSelect value={range.end} onChange={v => updateBlockedRange(wd, ri, 'end', v)} placeholder="fim" /></div>
                            <button onClick={() => removeBlockedRange(wd, ri)}
                              style={{ background: 'transparent', border: `1px solid rgba(248,113,113,0.3)`, borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: '#F87171', fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
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

      {error && <p style={{ fontFamily: FONT, fontSize: 13, color: '#F87171', marginBottom: 16 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <SecBtn onClick={() => setStep(2)} style={{ flex: 1 }}>Voltar</SecBtn>
        <PrimaryBtn disabled={saving} onClick={handleComplete} style={{ flex: 2 }}>
          {saving ? 'Salvando...' : 'Concluir configuração'}
        </PrimaryBtn>
      </div>
    </>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
          <NavalhaLogo size={36} />
        </div>
        <Card>
          {progress}
          {step === 1 && renderStep1}
          {step === 2 && renderStep2}
          {step === 3 && renderStep3}
        </Card>
      </div>
    </div>
  )
}
