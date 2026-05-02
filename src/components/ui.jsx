import { ACCENT, ACCENT_DEEP, ACCENT_DIM, INK, INK2, T, FONT, FONT_MONO, RADIUS, HAIRLINE, STATUS_COLOR, STATUS_LABEL } from '../tokens.js'

// ── Logo ──────────────────────────────────────────────────────────────────────
export function NavalhaMark({ size = 32, color = ACCENT }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="0.7" y="0.7" width="46.6" height="46.6" rx="2" fill="none" stroke={color} strokeWidth="1.4"/>
      <path d="M8 40 L24 8 L32 22 L40 8" stroke={color} strokeWidth="2.6" fill="none" strokeLinecap="square" strokeLinejoin="miter"/>
    </svg>
  )
}

export function NavalhaLogo() {
  return (
    <svg viewBox="0 0 324 120" style={{ width: '100%', maxWidth: 220, height: 'auto' }}>
      <g transform="translate(0,36)">
        <rect x="0.7" y="0.7" width="46.6" height="46.6" rx="2" fill="none" stroke={ACCENT} strokeWidth="1.4"/>
        <path d="M8 40 L24 8 L32 22 L40 8" stroke={ACCENT} strokeWidth="2.6" fill="none" strokeLinecap="square" strokeLinejoin="miter"/>
      </g>
      <text x="64" y="62" fontFamily="'Space Grotesk', sans-serif" fontSize="28" fontWeight="700" letterSpacing="6" fill={T.primary}>NAVALHA</text>
      <text x="64" y="84" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="500" letterSpacing="3.5" fill={T.hint} opacity="0.7">ADMIN PANEL</text>
    </svg>
  )
}

// ── Tipografia ────────────────────────────────────────────────────────────────
export function Eyebrow({ children }) {
  return (
    <p style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>
      {children}
    </p>
  )
}

export function PageTitle({ children }) {
  return (
    <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: T.primary, letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 24px' }}>
      {children}
    </h1>
  )
}

// ── Botões ────────────────────────────────────────────────────────────────────
export function PrimaryBtn({ children, onClick, disabled, type = 'button', style = {} }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '14px 20px', background: disabled ? 'rgba(235,188,99,0.3)' : ACCENT,
        color: disabled ? 'rgba(17,12,8,0.5)' : INK, border: 'none', borderRadius: RADIUS,
        fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.15s', ...style,
      }}
    >
      {children}
    </button>
  )
}

export function SecBtn({ children, onClick, disabled, type = 'button', style = {} }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '13px 20px', background: 'transparent',
        color: disabled ? T.hint : T.primary, border: `1px solid ${disabled ? HAIRLINE : 'rgba(245,234,208,0.25)'}`,
        borderRadius: RADIUS, fontFamily: FONT, fontWeight: 600, fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'border-color 0.15s', ...style,
      }}
    >
      {children}
    </button>
  )
}

export function GhostBtn({ children, onClick, style = {} }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none', border: 'none', color: T.muted, fontFamily: FONT,
        fontSize: 13, cursor: 'pointer', padding: '4px 0', ...style,
      }}
    >
      {children}
    </button>
  )
}

export function IconBtn({ children, onClick, title, danger = false }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        background: 'none', border: `1px solid ${danger ? 'rgba(248,113,113,0.3)' : HAIRLINE}`,
        color: danger ? '#F87171' : T.muted, borderRadius: 8, padding: '6px 10px',
        cursor: 'pointer', fontSize: 12, fontFamily: FONT_MONO, lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

// ── Inputs ────────────────────────────────────────────────────────────────────
export function Field({ label, hint, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ display: 'block', fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: error ? '#F87171' : T.hint, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6 }}>{label}</label>}
      {children}
      {hint && !error && <p style={{ fontFamily: FONT, fontSize: 12, color: T.hint, marginTop: 4 }}>{hint}</p>}
      {error && <p style={{ fontFamily: FONT, fontSize: 12, color: '#F87171', marginTop: 4 }}>{error}</p>}
    </div>
  )
}

const inputBase = (error) => ({
  width: '100%', padding: '12px 14px', background: INK2,
  border: `1px solid ${error ? '#F87171' : HAIRLINE}`, borderRadius: RADIUS,
  color: T.primary, fontFamily: FONT, fontSize: 14, outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
})

export function Input({ label, hint, error, ...props }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <input {...props} style={{ ...inputBase(!!error), ...props.style }} />
    </Field>
  )
}

export function Select({ label, hint, error, children, ...props }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <select {...props} style={{ ...inputBase(!!error), cursor: 'pointer', ...props.style }}>
        {children}
      </select>
    </Field>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ status }) {
  const color = STATUS_COLOR[status] ?? T.muted
  return (
    <span style={{
      fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color,
      background: color + '22', border: `1px solid ${color}44`,
      borderRadius: 6, padding: '3px 8px', textTransform: 'uppercase', letterSpacing: '0.1em',
    }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: INK2, border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS,
        padding: '20px 24px', cursor: onClick ? 'pointer' : 'default', ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ children, onClose, width = 480 }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,12,8,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: width, maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ toast, onClose, style = {} }) {
  if (!toast) return null
  const isError = toast.type === 'error'
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
      background: isError ? '#F87171' : ACCENT, color: INK,
      borderRadius: RADIUS, padding: '12px 18px', fontFamily: FONT, fontWeight: 600, fontSize: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 12,
      ...style,
    }}>
      {toast.msg}
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: INK, fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 24, color = ACCENT }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `2px solid ${color}33`, borderTop: `2px solid ${color}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}

export function FullScreenSpinner() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: INK }}>
      <Spinner size={36} />
    </div>
  )
}

// ── Divisor ───────────────────────────────────────────────────────────────────
export function Divider({ style = {} }) {
  return <div style={{ height: 1, background: HAIRLINE, margin: '20px 0', ...style }} />
}
