// ── Brand tokens NAVALHA (Manual de Identidade Visual v1.0) ──────────────────
export const ACCENT      = "#EBBC63"
export const ACCENT_DEEP = "#D4A24E"
export const ACCENT_DIM  = "var(--accent-dim)"
export const INK         = "var(--bg)"
export const INK2        = "var(--surface)"
export const CREAM       = "#F6F1E8"
export const PAPER       = "#FBF8F2"
export const BONE        = "#EFE8DA"
export const HAIRLINE    = "var(--hairline)"
export const FONT        = "'Space Grotesk',system-ui,sans-serif"
export const FONT_MONO   = "'JetBrains Mono',ui-monospace,monospace"
export const RADIUS      = 14
export const EASE        = "cubic-bezier(0.16, 1, 0.3, 1)"

export const T = {
  primary : "var(--text-primary)",
  muted   : "var(--text-muted)",
  hint    : "var(--text-hint)",
}

export const DARK_VARS = {
  '--bg':'#110C08','--surface':'#1D1712',
  '--text-primary':'#F5EAD0','--text-muted':'rgba(245,234,208,0.6)','--text-hint':'rgba(245,234,208,0.4)',
  '--hairline':'rgba(235,188,99,0.18)','--accent-dim':'rgba(235,188,99,0.18)',
  '--glass-bg':'rgba(29,23,18,0.75)','--input-bg':'rgba(17,12,8,0.5)',
  '--bg-grad':'linear-gradient(145deg,#110C08 0%,#1D1712 55%,#110C08 100%)',
  '--section-header-bg':'rgba(17,12,8,0.45)',
  '--text-available':'rgba(245,234,208,0.25)',
  '--color-scheme':'dark',
}
export const LIGHT_VARS = {
  '--bg':'#EFE8DA','--surface':'#FBF8F2',
  '--text-primary':'#110C08','--text-muted':'rgba(17,12,8,0.55)','--text-hint':'rgba(17,12,8,0.35)',
  '--hairline':'rgba(17,12,8,0.14)','--accent-dim':'rgba(235,188,99,0.22)',
  '--glass-bg':'rgba(251,248,242,0.88)','--input-bg':'rgba(239,232,218,0.7)',
  '--bg-grad':'linear-gradient(145deg,#EFE8DA 0%,#FBF8F2 55%,#EFE8DA 100%)',
  '--section-header-bg':'rgba(17,12,8,0.06)',
  '--text-available':'rgba(17,12,8,0.3)',
  '--color-scheme':'light',
}
export function applyTheme(dark) {
  const vars = dark ? DARK_VARS : LIGHT_VARS
  Object.entries(vars).forEach(([k,v]) => document.documentElement.style.setProperty(k,v))
  localStorage.setItem('navalha.theme', dark ? 'dark' : 'light')
}
// migração: versões antigas salvavam 'dark' como padrão; reseta para claro na primeira vez
if (!localStorage.getItem('navalha.theme.v2')) {
  localStorage.setItem('navalha.theme', 'light')
  localStorage.setItem('navalha.theme.v2', '1')
}
applyTheme(localStorage.getItem('navalha.theme') === 'dark')

export const STATUS_COLOR = {
  pending   : "#EBBC63",
  confirmed : "#4ADE80",
  rejected  : "#F87171",
  manual    : "#A78BFA",
}

export const STATUS_LABEL = {
  pending   : "Pendente",
  confirmed : "Confirmado",
  rejected  : "Recusado",
  manual    : "Manual",
}
