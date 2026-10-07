# Plano de implementação — CRM etapa 1 (leads, funil e tags)

Spec: [`docs/superpowers/specs/2026-10-07-crm-etapa1-leads-funil-design.md`](../specs/2026-10-07-crm-etapa1-leads-funil-design.md)
Branch: `feat/crm-etapa1`

## Regras para todas as tarefas

- Uma tarefa = um commit. `pnpm lint`, `pnpm typecheck` e `pnpm test` passando ao fim de cada uma.
- A partir da tarefa 2, a suíte `e2e/regressao/` (criada na tarefa 1) passa ao
  fim de toda tarefa que mexa em código existente (tarefas 3, 4, 10, 11 e 12).
- Dado da clínica sempre via `getTenantClient(tenantId)`. Telefone sempre com
  `encrypt`/`decrypt`. Nada de telefone ou nome em log.
- Código do CRM mora em `apps/web/crm/` (regras) e `apps/web/app/(crm)/crm/`
  (telas). A agenda e os orçamentos só importam `apps/web/crm/notify.ts`.
- Comentários e textos de tela em português, no mesmo tom do código atual.

---

## Fase 0 — Rede de proteção

### 1. E2E autenticado e suíte de regressão

Hoje não há E2E com login. Esta tarefa cria a rede antes de qualquer código do CRM.

- Instalar `@clerk/testing` em `apps/web` e configurar `clerkSetup()` num
  `e2e/global.setup.ts`, usando o modo de teste do Clerk (testing token) com
  uma conta de teste da instância de desenvolvimento.
- Criar `packages/db/prisma/seed-e2e.ts`: uma clínica de teste idempotente
  (tenant, usuário OWNER ligado ao usuário de teste do Clerk, um profissional
  com horário, um procedimento e assinatura em cortesia). As credenciais vêm de
  `.env.test` (`E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD`), com exemplo
  em `.env.test.example`. Nenhum valor vai para o repositório.
- `playwright.config.ts`: projeto `setup` que faz login e salva
  `storageState`, e o projeto `chromium` dependendo dele.
- `e2e/regressao/agenda.spec.ts`: criar paciente, criar agendamento, mudar
  status para "faltou" e cancelar.
- `e2e/regressao/orcamentos.spec.ts`: criar orçamento, marcar como enviado,
  marcar como aceito, e aceitar outro pelo link público `/orcamento/[token]`.
- **Pronto quando:** a suíte passa na `main` sem nenhuma mudança de produto.

> Esta tarefa precisa de uma conta de teste no Clerk de desenvolvimento, que o
> dono do projeto cria. O plano não cria contas.

---

## Fase 1 — Dados e acesso

### 2. Schema

`packages/db/prisma/schema.prisma`:

- Enums `StageRole`, `LeadSource` e `LeadActivityType`.
- Modelos `Lead`, `PipelineStage`, `LeadTag`, `LeadTagOnLead`, `LostReason` e
  `LeadActivity`, com campos e índices da spec.
- `Subscription.crmEnabled Boolean @default(false)`.
- Relações reversas em `Tenant`, `User`, `Patient` e `Procedure`. São só de
  Prisma e não mudam colunas.
- A extensão de `packages/db/src/client.ts` filtra **todo** modelo por
  `tenantId`, menos os de `MODELS_WITHOUT_TENANT`. Por isso, todos os seis
  modelos novos têm `tenantId`, inclusive a tabela de ligação `LeadTagOnLead`,
  e nenhum entra na lista de exceções.
- Teste em `packages/db/src/client.test.ts` (ou no existente): `getTenantClient`
  de uma clínica não lê nem altera `Lead`/`LeadTagOnLead` de outra.
- `pnpm db:generate` e `pnpm db:push` no banco local.
- **Pronto quando:** typecheck passa e `db push` só cria tabelas e colunas, sem
  alterar nenhuma existente (conferir a saída do push).

### 3. Permissões e módulo

- `apps/web/lib/permissions.ts`: capacidades `crm` (OWNER, ADMIN,
  RECEPTIONIST) e `crm_config` (OWNER, ADMIN), com os rótulos em `LABEL`.
  PROFESSIONAL não recebe nenhuma das duas.
- `apps/web/lib/access.ts`: `getTenantAccess` passa a ler `crmEnabled` e expõe
  `modules: { clinic: true, crm: boolean }`. Nesta etapa a clínica sempre tem
  `clinic: true`; o plano "só CRM" é da etapa 5.
- `apps/web/crm/guard.ts`: `requireCrm(capability: 'crm' | 'crm_config')`,
  que combina `requireCapability` com a checagem do módulo e devolve
  `{ tenantId, userId, db }`.
- Testes: `permissions.test.ts` cobre os novos papéis; `crm/guard.test.ts`
  cobre clínica sem módulo, papel sem capacidade e caminho feliz.

### 4. Seletor Clínica | CRM e layout do CRM

- `components/app-sidebar.tsx`: `NAV` vira `CLINIC_NAV`, e entra `CRM_NAV`
  (Funil, Leads, Configurações do CRM). O componente recebe `space: 'clinic' | 'crm'`
  e `modules`. O texto "Gestão clínica" vira `ModuleSwitcher` quando os dois
  módulos estão ligados.
- `components/module-switcher.tsx`: dois links (`/dashboard` e `/crm`) com
  `aria-current` e nome acessível "Trocar de módulo". Grava o cookie
  `ciq_space` só como preferência.
- Extrair o miolo de `app/(app)/layout.tsx` para `components/app-shell.tsx`
  (busca de tenant, usuário, acesso, cabeçalho, banner). `(app)/layout.tsx`
  passa a ser `<AppShell space="clinic">`. **Sem mudar o que aparece na tela.**
- `app/(crm)/layout.tsx`: `<AppShell space="crm">`, que barra com a tela de
  "módulo não contratado" quando `modules.crm` é falso.
- Conferir o menu mobile, se houver um separado do `AppSidebar`, e aplicar o mesmo.
- **Pronto quando:** sem `crmEnabled` o menu fica idêntico ao de hoje, com
  `crmEnabled` o seletor aparece, e a regressão passa.

---

## Fase 2 — Regras do CRM (sem tela)

Tudo em `apps/web/crm/`, com funções puras sempre que der, para teste unitário sem banco.

### 5. Funil padrão e etapas

- `crm/defaults.ts`: etapas e motivos de perda padrão.
- `crm/pipeline.ts`:
  - `ensureDefaultPipeline(db, tenantId)`: idempotente, cria só o que falta.
  - `canDeleteStage(stage, leadCount, target?)`: devolve um erro em português ou ok.
  - `orderStages(stages)`: as etapas da clínica na ordem, com `WON` e `LOST` por último.
- Testes: idempotência (rodar duas vezes não duplica), bloqueio de `role` de
  sistema e destino obrigatório quando a etapa tem leads.

### 6. Leads

- `crm/phone.ts`: normaliza (reusa `lib/phone.ts`) e gera o `phoneHash` (HMAC
  com a chave da clínica de `packages/db/src/encryption.ts`; exportar de lá um
  `hashForTenant` se ainda não houver).
- `crm/leads.ts`: `createLead`, `updateLead`, `moveLead` (reposiciona a coluna
  de destino, preenche ou limpa `wonAt`/`lostAt`, exige motivo para `LOST`,
  registra `LeadActivity`), `setTags`, `addNote`, `softDelete`.
- `crm/duplicates.ts`: `findLeadByPhone` (pelo hash) e `findPatientByPhone`
  (decifra os telefones dos pacientes da clínica, como a busca de pacientes já faz).
- Testes: perda sem motivo falha, reabrir limpa as datas, posição na coluna e
  duplicados.

### 7. Automação

- `crm/automation.ts`: `applyEvent(stages, lead, event)` é pura e devolve
  `{ moveTo?, activity, wonValueCents? }`. Ela implementa "só para frente",
  ignora lead fechado ou perdido e trata `MISSED` como só registro.
- `crm/notify.ts`: `notifyCrm(tenantId, event)`.
  - Lê `crmEnabled`; se for falso, sai.
  - Acha o lead aberto pelo `patientId`, aplica `applyEvent` e grava numa transação.
  - Envolve tudo em try/catch e loga só o tipo do evento e os ids. Nunca lança erro.
- Testes: tabela de casos de `applyEvent`; `notifyCrm` com o banco mockado
  falhando não lança erro; sem módulo, não consulta lead.

---

## Fase 3 — Telas

Todas as telas usam `requireCrm`, server actions em `app/(crm)/crm/**/actions.ts`
com `zod` e `refOutsideTenant`, e os componentes de `packages/ui`/shadcn já usados no app.

### 8. Funil (kanban) e novo lead

- `app/(crm)/crm/page.tsx`: chama `ensureDefaultPipeline` e carrega etapas e
  leads com os filtros (responsável, tag, origem, busca). `WON`/`LOST` mostram
  só os últimos 30 dias.
- `_components/board.tsx`: colunas como regiões rotuladas ("Etapa Novo, 12 leads"),
  com contagem e soma de valor. Arrastar com `@dnd-kit/core`, usando
  `KeyboardSensor` e `announcements` em português.
- `_components/lead-card.tsx`: o card focável, com o menu "Mover para…".
  Mover para Perdeu abre o modal de motivo.
- `_components/new-lead-modal.tsx`: aviso de duplicado (abrir o lead existente,
  ou criar já vinculado ao paciente).
- Região `aria-live` para anunciar os movimentos.

### 9. Lista e detalhe

- `app/(crm)/crm/leads/page.tsx`: tabela com os mesmos filtros e colunas ordenáveis.
- `app/(crm)/crm/leads/[id]/page.tsx`: dados editáveis, tags (com criar na
  hora), responsável, valor, anotação, histórico e as ações Marcar como
  perdido / Reabrir.

### 10. Converter e agendar

- No detalhe: "Converter em paciente" checa primeiro `findPatientByPhone`. Se
  achar, oferece "Vincular a este paciente". Se não, abre o
  `patient-form.tsx` existente com nome, telefone e e-mail já preenchidos.
  - Se o formulário não aceitar valores iniciais, adicionar uma prop opcional
    `initialValues`, sem mudar o comportamento atual.
  - Ao salvar, grava `Lead.patientId` e registra `CONVERTED`.
- "Agendar avaliação": converte se preciso e navega para `/agenda?novo=1&paciente=<id>`.
- `agenda/_components/agenda-shell.tsx`: com `novo=1&paciente=<id>`, abre o
  modal de novo agendamento com o paciente escolhido. Sem os parâmetros, nada muda.
- Ficha do paciente (`pacientes/[id]/page.tsx`): link "Ver no funil" quando
  existe um lead com aquele `patientId` e a pessoa tem `crm`.

### 11. Ligar a automação na agenda e nos orçamentos

Uma linha de `after(() => notifyCrm(...))` em cada ponto, depois de salvar:

- `(app)/agenda/actions.ts` → `createAppointment` (`appointment.created`).
  Já usa `after`, então entra junto.
- `(app)/agenda/actions.ts` → `updateAppointmentStatus` quando o status novo é
  `MISSED` (`appointment.missed`).
- `(app)/orcamentos/actions.ts` → as duas ações que gravam `status: 'SENT'`
  (`quote.sent`) e a que grava `status: 'ACCEPTED'` (`quote.accepted`).
- `orcamento/[token]/actions.ts` → aceite pelo link público (`quote.accepted`).
- **Pronto quando:** a regressão passa e o diff nesses arquivos é só o import
  e as chamadas.

### 12. Configurações do CRM

- `app/(crm)/crm/configuracoes/page.tsx`, com `requireCrm('crm_config')` e abas:
  - **Etapas:** criar, renomear, cor da paleta, reordenar (arrastar e botões
    subir/descer) e apagar escolhendo o destino.
  - **Tags:** criar, renomear, cor e apagar.
  - **Motivos de perda:** criar, renomear, desativar e reordenar.
- Ligação manual do módulo: um script `packages/db/prisma/crm-enable.ts <tenantId>`
  liga `crmEnabled`, no mesmo estilo de como a cortesia é concedida hoje.

---

## Fase 4 — Fechamento

### 13. E2E do CRM e acessibilidade

- `e2e/crm/fluxo.spec.ts`: criar lead → mover com "Mover para…" pelo teclado →
  converter → agendar avaliação → o card está em "Avaliação agendada" →
  marcar o orçamento como aceito → o card está em "Fechou".
- `e2e/crm/acesso.spec.ts`: sem `crmEnabled` o seletor não aparece e `/crm`
  mostra "módulo não contratado"; recepção não abre `/crm/configuracoes`.
- `e2e/a11y.spec.ts`: axe-core em `/crm`, `/crm/leads`, `/crm/leads/[id]` e
  `/crm/configuracoes`, e também em `/agenda` e `/dashboard` com o seletor visível.
- Regressão completa passando.

### 14. Documentação

- `CLAUDE.md`: corrigir "Filas: BullMQ + Redis" (o projeto usa outbox no
  Postgres e o gateway no Fly) e acrescentar a seção do CRM (pastas, `notifyCrm`,
  regra de que a agenda não importa nada do CRM além dele).
- `ROADMAP.md`: atualizar com o que já existe e com as etapas 1–5 do CRM.

---

## Ordem e paralelismo

```
1 → 2 → 3 → 4 ─┐
       └→ 5 → 6 → 7 ─┼→ 8 → 9 → 10 → 11 → 12 → 13 → 14
```

As tarefas 5–7 (só regras e testes) podem andar em paralelo com a 4.

## Riscos e como cada um é coberto

| Risco | Cobertura |
|---|---|
| Quebrar a agenda ao extrair o layout (tarefa 4) | regressão E2E + layout visualmente idêntico sem `crmEnabled` |
| Automação atrasar ou derrubar a agenda | `after()` + `notifyCrm` que nunca lança erro + teste unitário com o banco falhando |
| Modelos novos sem filtro de clínica | todos com `tenantId` (a extensão filtra por padrão) + teste de que uma clínica não lê lead de outra |
| Kanban inacessível | "Mover para…" como caminho principal + axe-core + E2E pelo teclado |
| `db push` mexer em tabela existente | conferir a saída na tarefa 2; só tabelas e uma coluna nova com valor padrão |
