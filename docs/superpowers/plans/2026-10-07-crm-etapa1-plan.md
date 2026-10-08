# Plano de implementação — CRM etapa 1 (leads, funil, tags e tarefas)

Spec: [`docs/superpowers/specs/2026-10-07-crm-etapa1-leads-funil-design.md`](../specs/2026-10-07-crm-etapa1-leads-funil-design.md)
Branch: `feat/crm-etapa1`

## Regras para todas as tarefas

- Uma tarefa = um commit. `pnpm lint`, `pnpm typecheck` e `pnpm test` passando ao fim de cada uma.
- A suíte `e2e/regressao/` passa ao fim de toda tarefa que mexe em código
  existente (2, 3, 4, 11, 12, 13).
- Dado da clínica sempre via `getTenantClient(tenantId)`. Telefone sempre com
  `encrypt`/`decrypt`. Nada de telefone ou nome em log.
- Regras em `apps/web/crm/`, telas em `apps/web/app/(crm)/crm/`. Agenda e
  orçamentos só importam `apps/web/crm/notify.ts`.
- Comentários e textos de tela em português, no tom do código atual.
- Banco de desenvolvimento: Postgres local (`clinicaiq_dev`). Nada roda contra produção.

---

## Fase 0 — Rede de proteção

### 1. E2E autenticado e suíte de regressão ✅

Feito em `8ec5548` e `27fa423`: clínica de teste semeada, login pela conta
`+clerk_test` via `@clerk/testing`, regressão de agenda (agendar, falta,
cancelar) e orçamentos (criar, aprovar, aceite pelo link público). Verde duas
vezes seguidas.

---

## Fase 1 — Dados e acesso

### 2. Schema

`packages/db/prisma/schema.prisma`:

- Enums `StageRole` (`NEW`, `SCHEDULED`, `NEGOTIATION`, `WON`, `LOST`),
  `LeadSource`, `LeadActivityType`, `TaskOrigin`.
- Modelos `Lead`, `PipelineStage`, `LeadTask`, `LeadTag`, `LeadTagOnLead`,
  `LostReason`, `LeadActivity` — todos com `tenantId` (a extensão de
  `packages/db/src/client.ts` filtra todo modelo por ele; nenhum entra em
  `MODELS_WITHOUT_TENANT`).
- `Lead.patientId` **sem** `@unique` (vários negócios por pessoa).
- `Subscription.crmEnabled Boolean @default(false)`.
- Relações reversas em `Tenant`, `User`, `Patient`, `Procedure` (só Prisma).
- `pnpm db:generate` e `pnpm db:push` no banco local; conferir que o push só cria.
- Teste de isolamento em `packages/db/src/tenant-isolation.test.ts`, que roda
  só com `DATABASE_URL` definido: uma clínica não lê nem altera `Lead`,
  `LeadTask` e `LeadTagOnLead` de outra.

### 3. Permissões e módulo

- `lib/permissions.ts`: `crm` (OWNER, ADMIN, RECEPTIONIST) e `crm_config`
  (OWNER, ADMIN), com rótulos.
- `lib/access.ts`: `getTenantAccess` lê `crmEnabled` e expõe `modules: { clinic: true, crm }`.
- `crm/guard.ts`: `requireCrm(capability)` → `{ tenantId, userId, db }`.
- Testes de permissões e do guard.

### 4. Seletor Clínica | CRM e layout

- `components/app-sidebar.tsx`: `CLINIC_NAV` e `CRM_NAV` (Funil, Leads,
  Tarefas, Configurações do CRM); recebe `space` e `modules`.
- `components/module-switcher.tsx`: dois links com `aria-current`, cookie `ciq_space`.
- `components/app-shell.tsx`: miolo extraído de `(app)/layout.tsx`, sem mudar a tela.
- `app/(crm)/layout.tsx`: `<AppShell space="crm">`, barra sem `modules.crm`.
- Menu mobile, se separado, recebe o mesmo.
- Pronto quando: sem `crmEnabled` o menu é idêntico ao de hoje; regressão verde.

---

## Fase 2 — Regras do CRM (sem tela)

Funções puras sempre que der, para teste sem banco.

### 5. Funil padrão e etapas

- `crm/defaults.ts`: etapas (Novo, Em conversa, Avaliação agendada, Em
  negociação, Fechou, Perdeu) e motivos de perda.
- `crm/pipeline.ts`: `ensureDefaultPipeline` (idempotente), `canDeleteStage`,
  `boardStages` (sem `WON`/`LOST`), `fallbackStageAfterCancel` ("Em conversa"
  ou `NEW`).
- Testes.

### 6. Leads e tarefas

- `crm/phone.ts`: normaliza (reusa `lib/phone.ts`) e `phoneHash` (exportar
  `hashForTenant` de `packages/db/src/encryption.ts`, com teste lá).
- `crm/leads.ts`: `createLead`, `updateLead`, `moveLead` (posição,
  `stageEnteredAt`, ganho/perda/reabertura, histórico), `setTags`, `addNote`, `softDelete`.
- `crm/tasks.ts`: `createTask`, `completeTask`, `taskStatus(lead, tasks, now)`
  → `none | overdue | upcoming(dueAt)`.
- `crm/duplicates.ts`: `findOpenLeadByPhone` (hash) e `findPatientByPhone`.
- Testes: perda sem motivo falha, reabrir limpa datas, posição, duplicado só
  entre abertos, situação de tarefa.

### 7. Automação

- `crm/automation.ts`: `planForEvent(ctx, event)` pura. Recebe etapas, o lead
  aberto mais recente, se há agendamento futuro e se há orçamento em aberto;
  devolve `{ moveTo?, reopen?, wonValueCents?, tasks[], activity }`. Implementa
  a tabela de regras da spec (avançar só para frente, voltar só de
  `SCHEDULED` em cancelamento/falta, nunca perder, reabrir só pelo orçamento
  que ganhou).
- `crm/notify.ts`: `notifyCrm(tenantId, event)` — checa `crmEnabled`, monta o
  contexto, aplica o plano numa transação, nunca lança.
- `crm/live.ts`: `liveInfoForLeads(db, leads)` — próxima avaliação e orçamento
  em aberto por `patientId`, numa consulta por tipo (sem N+1).
- Testes: tabela de casos de `planForEvent`; `notifyCrm` com banco falhando;
  sem módulo não consulta.

---

## Fase 3 — Telas

`requireCrm` em tudo, server actions com `zod` e `refOutsideTenant`,
componentes de `packages/ui`/shadcn já usados no app.

### 8. Funil (quadro)

- `app/(crm)/crm/page.tsx`: etapas, leads abertos, situação de tarefa e
  informação ao vivo; filtros rápidos e busca.
- `_components/board.tsx`, `column.tsx` (cabeçalho com cor, contagem, soma,
  adicionar rápido), `lead-card.tsx` (menu "Mover para…"), `drop-bar.tsx`
  (Ganho | Perdido | Excluir ao arrastar), `lost-reason-modal.tsx`,
  `new-lead-modal.tsx` (com aviso de duplicado).
- `@dnd-kit/core` com `KeyboardSensor`, anúncios em português e `aria-live`.

### 9. Ficha do lead

- `app/(crm)/crm/leads/[id]/page.tsx`: duas metades. Esquerda: dados, tags,
  barra de etapas, ações. Direita: histórico + caixa Tarefa | Nota; bloco
  "Outros negócios".

### 10. Lista e Tarefas

- `app/(crm)/crm/leads/page.tsx`: tabela com filtros (inclui ganhos/perdidos).
- `app/(crm)/crm/tarefas/page.tsx`: Atrasadas / Hoje / Próximas, filtro por
  responsável, concluir na lista.

### 11. Converter e agendar

- "Converter em paciente" com "Vincular a este paciente" ou `patient-form.tsx`
  preenchido (prop opcional `initialValues`, sem mudar o uso atual).
- "Agendar avaliação" → `/agenda?novo=1&paciente=<id>`;
  `agenda/_components/agenda-shell.tsx` abre o modal com o paciente. Sem os
  parâmetros, nada muda.
- Ficha do paciente: bloco "Negócios no CRM" (só com `crm`).

### 12. Ligar a automação

Uma linha `after(() => notifyCrm(...))` depois de salvar, em:

- `(app)/agenda/actions.ts`: `createAppointment`, `updateAppointment`,
  `moveAppointment`, `updateAppointmentStatus` (CANCELLED / MISSED / ATTENDED),
  `cancelAppointment`, `deleteAppointment` (ler o `patientId` antes de apagar).
- `(app)/orcamentos/actions.ts`: `createQuote`, `acceptQuote`, `reopenQuote`,
  `deleteQuote` (ler o `patientId` antes de apagar).
- `orcamento/[token]/actions.ts`: aceite e recusa pelo link.
- Pronto quando: regressão verde e o diff nesses arquivos é só import + chamadas.

### 13. Configurações do CRM

- `app/(crm)/crm/configuracoes/page.tsx` (`crm_config`): Etapas, Tags, Motivos de perda.
- Script `packages/db/prisma/crm-enable.ts <tenantId>` para ligar o módulo.

---

## Fase 4 — Fechamento

### 14. E2E do CRM e acessibilidade

- `e2e/crm/fluxo.spec.ts`: o caminho completo da spec (lead → tarefa →
  converter → agendar → cancelar volta → reagendar → orçamento → aprovar → Fechou).
- `e2e/crm/teclado.spec.ts`: "Mover para…", inclusive Perdido com motivo.
- `e2e/crm/acesso.spec.ts`: sem módulo e papel sem permissão.
- axe-core em `/crm`, `/crm/leads`, `/crm/leads/[id]`, `/crm/tarefas`,
  `/crm/configuracoes` e na agenda com o seletor.
- A semeadura liga `crmEnabled` na clínica de teste.

### 15. Documentação

- `CLAUDE.md`: corrigir "BullMQ + Redis" (é outbox no Postgres + gateway no
  Fly), seção do CRM e do ambiente local (Postgres local, `e2e/README.md`).
- `ROADMAP.md`: estado real e etapas 1–5 do CRM.

---

## Ordem

```
1 ✅ → 2 → 3 → 4 ─┐
       └→ 5 → 6 → 7 ─┼→ 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15
```

## Riscos

| Risco | Cobertura |
|---|---|
| Extrair o layout quebrar a agenda (4) | regressão E2E + tela idêntica sem `crmEnabled` |
| Automação atrasar ou derrubar a agenda | `after()` + `notifyCrm` que nunca lança + teste com banco falhando |
| Card mostrar data ou valor errado | informação lida ao vivo da agenda e dos orçamentos |
| Card puxado para trás indevidamente | voltar só de `SCHEDULED` e só sem outro agendamento futuro; testes de tabela |
| Modelos novos sem filtro de clínica | todos com `tenantId` + teste de isolamento |
| Quadro inacessível | "Mover para…" como caminho principal + axe-core + E2E por teclado |
| `db push` mexer em tabela existente | conferir a saída; só tabelas novas e uma coluna com padrão |
