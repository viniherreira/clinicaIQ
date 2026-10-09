# ClinicaIQ

SaaS B2B para clínicas odontológicas e estéticas no Brasil. Dois módulos: a
gestão da clínica (agenda, pacientes, orçamentos, financeiro) e o CRM de
captação (funil de leads no estilo Kommo).

## Stack

- Monorepo: Turborepo + pnpm
- Frontend: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Auth: Clerk. Não usa Organizations: a clínica é ligada ao usuário (`Tenant.clerkOrgId = user_<id>`, `User.clerkUserId`)
- DB: PostgreSQL + Prisma ORM (`packages/db`), schema aplicado com `db push` (sem migrations)
- WhatsApp: provider abstrato (`packages/whatsapp`). Em produção, o gateway de QR code (`apps/whatsapp-gateway`, Baileys, no Fly.io em São Paulo); mock em dev; Meta Cloud API preparada para o CRM
- Envio de mensagens: outbox no Postgres (`WhatsAppMessage` com `attempts`/`nextAttemptAt`), reprocessado pelo gateway. Não há BullMQ nem Redis
- Cobrança: Asaas
- PDF: @react-pdf/renderer (`packages/pdf`)
- Testes: Vitest (unitários), Playwright + axe-core (E2E + a11y)

## Commands

- `pnpm dev` — start all apps in dev mode
- `pnpm build` — build all packages and apps
- `pnpm lint` — lint all packages
- `pnpm typecheck` — type-check all packages
- `pnpm test` — run unit tests (os `*.db.test.ts` rodam contra o banco quando há `DATABASE_URL`)
- `pnpm test:e2e` — run E2E tests (ver `apps/web/e2e/README.md`)
- `pnpm db:generate` — generate Prisma client
- `pnpm db:push` — push schema to database
- `pnpm db:seed` — seed database
- `pnpm --filter @clinicaiq/db exec tsx prisma/crm-enable.ts <slug>` — liga o CRM de uma clínica (`--off` desliga)

## Ambiente local

- Banco de desenvolvimento: Postgres instalado na máquina (`clinicaiq_dev`). Nunca rode testes nem `db:push` de branch contra o banco de produção.
- Clerk: instância Development (`pk_test`/`sk_test`). Conta de teste com `+clerk_test` no e-mail.
- Variáveis em `apps/web/.env.local`, `packages/db/.env` e `apps/web/.env.test` (fora do git). Passo a passo em `apps/web/e2e/README.md`.

## Structure

- `apps/web` — Next.js frontend app
  - `app/(app)` — gestão da clínica
  - `app/(crm)` — telas do CRM (`/crm`, `/crm/leads`, `/crm/tarefas`, `/crm/configuracoes`)
  - `crm/` — regras do CRM (funil, leads, tarefas, automação), sem telas
  - `e2e/regressao` — regressão da agenda e dos orçamentos; `e2e/crm` — CRM
- `apps/whatsapp-gateway` — gateway de WhatsApp por QR code
- `packages/db` — Prisma schema, client with multi-tenant extension, encryption
- `packages/whatsapp` — WhatsApp provider abstraction
- `packages/pdf` — PDF generation for quotes
- `packages/ui` — shared UI components

## Multi-tenancy

Every tenant-scoped table has `tenantId`. Use `getTenantClient(tenantId)` from `@clinicaiq/db` — it auto-filters all queries by tenant. Never use raw `prisma` for tenant-scoped data.

A extensão filtra **todo** modelo, menos os de `MODELS_WITHOUT_TENANT`. Tabela nova, inclusive de ligação, precisa ter `tenantId`.

## CRM

- **O CRM é um adicional pago** do sistema de agenda: R$ 39 por usuário/mês (`Plan.crmSeatPriceCents`), 14 dias grátis uma vez, cortesia inclui. Uma cobrança só no Asaas (plano + CRM) — `crm/billing.ts` (regras puras) e `crm/addon.ts` (ligar, desligar, acesso, `syncBillingValue`). Qualquer mudança que afete o valor chama `syncBillingValue`; a rotina diária também.
- Entrar no CRM exige três coisas: CRM ligado na clínica (`Subscription.crmEnabled`), perfil com `crm` (dono, admin, recepção; `crm_config` para dono e admin) e a chave da pessoa (`User.crmSeat`). Páginas usam `requireCrm`, actions usam `guardCrmAction` (`apps/web/crm/guard.ts`).
- O lead é um negócio, não a pessoa: a mesma pessoa pode ter vários. `Lead.patientId` liga ao paciente depois da conversão.
- **A agenda e os orçamentos nunca dependem do CRM.** A única ligação é `after(() => notifyCrm(tenantId, evento))` depois de salvar (`apps/web/crm/notify.ts`), que não faz nada sem o módulo e nunca lança. Não importe nada mais de `crm/` em código da clínica.
- As regras de automação ficam em `crm/automation.ts` (puras, testadas por tabela): avançar só para frente, voltar só no cancelamento ou falta, nunca perder sozinho.
- O que o card mostra da clínica (próxima avaliação, orçamento em aberto) é lido ao vivo (`crm/live.ts`), nunca copiado para o CRM.
- Horários: agendamentos são "hora de parede em UTC" (`lib/tz.ts`); tarefas do CRM são instantes reais. Conversões em `crm/clock.ts`.
- Spec e plano: `docs/superpowers/specs/2026-10-07-crm-etapa1-leads-funil-design.md` e `docs/superpowers/plans/2026-10-07-crm-etapa1-plan.md`.

## Accessibility

WCAG 2.1 AA is a product differentiator. Every component must be keyboard-navigable, have proper ARIA attributes, and pass axe-core checks. Use `eslint-plugin-jsx-a11y` and `@axe-core/playwright`.

## LGPD

CPF and phone are encrypted at rest (AES-256-GCM). Use `encrypt`/`decrypt` from `@clinicaiq/db`. Never log or expose raw PII.

Para achar registros pelo telefone sem decifrar a tabela, use o índice cego `hashForTenant` (como `Lead.phoneHash`). No CRM, o telefone aparece mascarado; ver o número inteiro grava `LEAD_PHONE_VIEWED` na auditoria.
