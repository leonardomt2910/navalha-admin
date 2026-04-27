# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# NAVALHA ADMIN

Painel administrativo SaaS para donos de barbearia. React + Vite, autenticação Supabase, deploy Vercel em `https://navalha-admin.vercel.app`. Cada dono de barbearia tem sua própria conta (multi-tenant via `owner_id`).

## Stack

- **React 19** + **Vite 8** (JS, não TS) — `npm run dev`, `npm run build`, `npm run lint`
- **Sem suíte de testes** — verificação via `lint` + manual no browser
- **@supabase/supabase-js 2** — auth (email/password) + todas as tabelas
- **Sem router** — navegação por estado: `view` (`"auth"` | `"onboarding"` | `"dashboard"`) em `App.jsx`
- Estilos: objetos JS inline + tokens em `src/tokens.js`. Sem CSS-in-JS lib, sem framework de UI
- Mobile-first: `useIsMobile(bp=680)` hook em `Dashboard.jsx` controla sidebar vs bottom nav

## Estrutura

```
src/
  App.jsx           ← roteamento de views (auth / onboarding / dashboard)
  tokens.js         ← brand tokens (cores, fontes, radius)
  lib/supabase.js   ← instância do cliente Supabase
  components/
    ui.jsx          ← componentes base: NavalhaLogo, PrimaryBtn, SecBtn, GhostBtn,
                       IconBtn, Input, Select, Badge, Card, Modal, Toast, Spinner,
                       Eyebrow, PageTitle, Divider, Field
  pages/
    Auth.jsx        ← login + cadastro (Supabase Auth)
    Onboarding.jsx  ← wizard 3 steps após primeiro login (nome, slug, WhatsApp, CPF/CNPJ)
    Dashboard.jsx   ← painel principal (~1000 linhas): todas as seções
```

## Dashboard — seções

Controlado pelo estado `section` em `Dashboard.jsx`. NAV array define as abas:

| key | Seção | Descrição |
|---|---|---|
| `bookings` | Agendamentos | Lista filtrável por data e status |
| `calendar` | Calendário | Grade mensal com painel lateral do dia |
| `reports` | Relatórios | Métricas básicas do mês; relatórios avançados "em breve" |
| `settings` | Configurações | Sub-abas: Perfil · Serviços · Horários |
| `plans` | Planos | Cards de plano + checkout Asaas |

## Onboarding

Wizard 3 steps após primeiro login. Campos obrigatórios no Step 1:
- Nome da barbearia (≥ 2 chars)
- Slug único (≥ 3 chars, validado async contra `owners.slug`)
- CPF ou CNPJ (formatado, 11 ou 14 dígitos — obrigatório para integração Asaas)
- WhatsApp (salvo como dígitos puros, ex: `5551999990000`)

Ao completar, salva em `owners` e marca `active: true`.

## Backend — Supabase

- URL: `https://grgfmzueciolmdjeufwz.supabase.co`
- Chave anon hardcoded em `src/lib/supabase.js` — proteção via RLS
- Tabelas principais: `owners`, `bookings`, `services`, `hours_config`
- `owners` campos relevantes: `name`, `slug`, `email`, `whatsapp`, `cpf_cnpj`, `plan` (`free`|`pro`|`premium`), `plan_expires_at`, `asaas_customer_id`, `asaas_subscription_id`, `addon_reativacao`

### Edge Functions (em `barbearia-app/supabase/functions/`)

| Função | Trigger | Descrição |
|---|---|---|
| `notify-booking` | DB Webhook — `bookings` INSERT | WhatsApp para admin (novo agendamento) + cliente (confirmação) |
| `send-reminders` | pg_cron a cada 30 min | Lembrete WhatsApp 1h antes para clientes |
| `create-checkout` | POST do painel admin | Cria cliente + assinatura no Asaas, retorna `paymentUrl` |
| `handle-payment` | Webhook Asaas | Atualiza `plan`/`plan_expires_at` ao confirmar pagamento |

## Planos e Pagamentos (Asaas)

- **Essencial** R$ 69/mês → `plan = 'pro'`
- **Profissional** R$ 129/mês → `plan = 'premium'`
- **Add-on Reativação Inteligente** R$ 39/mês → `addon_reativacao = true`
- Asaas requer CPF/CNPJ tanto no cliente quanto na assinatura — por isso é coletado no onboarding
- Ao criar assinatura: se `asaas_customer_id` já existe, faz PUT para atualizar CPF antes de criar subscription (evita erro "CPF/CNPJ obrigatório")
- `notificationDisabled: false` — Asaas envia SMS/email ao owner com o link de pagamento automaticamente (comportamento esperado)
- **Sandbox**: `ASAAS_API_URL=https://sandbox.asaas.com/api/v3`. Para produção: `https://api.asaas.com/v3`
- Webhook Asaas usa header `asaas-access-token` verificado contra `ASAAS_WEBHOOK_TOKEN`

## WhatsApp (Z-API)

- Instância única da plataforma — um número Navalha envia para todos os admins/clientes
- Requer 3 variáveis de ambiente: `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`
- `Client-Token` header é obrigatório mesmo com segurança "Inativa" no painel Z-API
- Falha silenciosa — erro no WhatsApp não bloqueia o fluxo principal

## Responsividade mobile

- `useIsMobile(bp=680)` definido em `Dashboard.jsx`, chamado nos componentes que precisam
- Abaixo de 680px: sidebar some, aparece top bar + bottom navigation bar fixo no rodapé
- Bottom nav usa `env(safe-area-inset-bottom)` para iPhone com home indicator
- Toast no mobile: `bottom: 72px` (acima do bottom nav), largura full com `left: 16 / right: 16`
- Calendário: `width: 100%` no mobile em vez de 320px fixo
- Conteúdo principal: `padding: 20px 16px` mobile vs `32px 36px` desktop; `paddingBottom: 80px` para não sobrepor bottom nav

## Identidade visual

Mesma linguagem do `barbearia-app`. Tokens em `src/tokens.js`:
- **Fontes**: Space Grotesk (`FONT`) + JetBrains Mono (`FONT_MONO`). Nunca substituir
- **Cores**: `ACCENT #EBBC63` só em CTA/seleção/eyebrow. `INK #110C08`, `INK2 #1D1712`, `HAIRLINE rgba(235,188,99,0.18)`
- **Border radius**: `RADIUS = 14` uniforme
- Sem shadows, sem emojis, sem animações decorativas

## Convenções

- Comentários em português, separadores `// ── Seção ──────────`
- `cpf_cnpj` salvo como dígitos puros (sem pontuação) no banco
- `whatsapp` salvo como dígitos puros: `5551999990000` (com DDI 55)
- Telefone exibido via `phoneToDisplay()` — converte dígitos para formato `(XX) XXXXX-XXXX`
- Slug: `softSlugify` durante digitação, `slugify` no blur (remove hífens nas bordas)

## O que NÃO fazer

- Não introduzir TypeScript, router ou lib de UI sem pedido
- Não trocar fontes, cores ou geometria de logo — viola o manual de marca
- Não setar `ASAAS_API_KEY` em produção com aspas simples no bash (o `$` no início da chave é expandido pelo shell — usar aspas simples: `'$aact_...'`)
- Não recriar webhook Asaas antes de configurar o `ASAAS_WEBHOOK_TOKEN` — o Asaas envia evento de teste imediatamente e retorna 401, pausando a fila
