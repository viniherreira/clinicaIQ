# ClinicaIQ

SaaS B2B para clínicas odontológicas e estéticas no Brasil.

## Stack

- Monorepo: Turborepo + pnpm
- Frontend: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Auth: Clerk (multi-tenant via Organizations)
- DB: PostgreSQL + Prisma ORM (`packages/db`)
- WhatsApp: provider abstrato (`packages/whatsapp`) — mock para dev, Meta Cloud API para prod
- PDF: @react-pdf/renderer (`packages/pdf`)
- Filas: BullMQ + Redis
- Testes: Vitest (unitários), Playwright + axe-core (E2E + a11y)

## Commands

- `pnpm dev` — start all apps in dev mode
- `pnpm build` — build all packages and apps
- `pnpm lint` — lint all packages
- `pnpm typecheck` — type-check all packages
- `pnpm test` — run unit tests
- `pnpm test:e2e` — run E2E tests
- `pnpm db:generate` — generate Prisma client
- `pnpm db:push` — push schema to database
- `pnpm db:seed` — seed database

## Structure

- `apps/web` — Next.js frontend app
- `packages/db` — Prisma schema, client with multi-tenant extension, encryption
- `packages/whatsapp` — WhatsApp provider abstraction
- `packages/pdf` — PDF generation for quotes
- `packages/ui` — shared UI components

## Multi-tenancy

Every tenant-scoped table has `tenantId`. Use `getTenantClient(tenantId)` from `@clinicaiq/db` — it auto-filters all queries by tenant. Never use raw `prisma` for tenant-scoped data.

## Accessibility

WCAG 2.1 AA is a product differentiator. Every component must be keyboard-navigable, have proper ARIA attributes, and pass axe-core checks. Use `eslint-plugin-jsx-a11y` and `@axe-core/playwright`.

## LGPD

CPF and phone are encrypted at rest (AES-256-GCM). Use `encrypt`/`decrypt` from `@clinicaiq/db`. Never log or expose raw PII.
