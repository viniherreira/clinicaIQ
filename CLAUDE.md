# DreamClin (antes ClinicaIQ)

O nome do produto é **DreamClin** (dreamclin.com); o repositório e os pacotes (`@clinicaiq/*`) mantêm o nome antigo, que ninguém vê. SaaS B2B para clínicas odontológicas e estéticas no Brasil. Dois módulos: a
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
  - `app/(crm)` — telas do CRM (`/crm/painel`, `/crm`, `/crm/conversas`, `/crm/leads`, `/crm/tarefas`, `/crm/automacoes` (bots, modelos, transmissões, por etapa), `/crm/whatsapp`, `/crm/configuracoes`)
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

## Agenda e gestão (referência: Clínica nas Nuvens)

- **Visual:** menu branco com busca, grupos que abrem e fecham e opção de recolher (`components/clinic-sidebar.tsx`, grupos em `CLINIC_NAV`), topo com o caminho e a busca de paciente (`app-header.tsx`), fundo `bg-canvas` nas telas. Cor azul mantida.
- **O dia do paciente** (`lib/appointment-flow.ts`, puro e testado): agendado → confirmado → na sala de espera → em atendimento → atendido. "Chegou" e "em atendimento" são horas (`Appointment.arrivedAt`/`startedAt`/`finishedAt`), não situações novas — confirmação, relatórios e CRM não mudam. `advanceAppointment` grava.
- **Janela de detalhes do agendamento** (`agenda/_components/appointment-detail-modal.tsx`): ficha resumida do paciente, abas Detalhes/Financeiro/Histórico, rótulo, opções e o próximo passo do dia. Faltou e cancelar fecham a janela; cancelar pede o motivo ali mesmo.
- **Sala de espera** na lateral da agenda (`waiting-room.tsx`), **visão por mês** (`month-grid.tsx`, `view=month`) e **rótulos** coloridos (`AppointmentLabel`, cores em `lib/label-colors.ts`, cadastro em Configurações → Atendimento).
- **Agendamento online** (`/agendar/[slug]`, público): regras em `Tenant.settings.onlineBooking` (`lib/availability.ts`: `readOnlineBooking`, `freeSlots`), painel em Configurações → Atendimento. Confere tudo de novo no servidor e numa transação; paciente novo vira cadastro (mesmo nome + telefone reaproveita); máximo 2 horários futuros pelo site por pessoa; campo-isca contra robô.
- **Orçamento** (`orcamentos/_components`): busca de procedimento por nome/código com teclado (`procedure-picker.tsx`), odontograma FDI que escreve "Dentes 11 e 21" e a quantidade (`tooth-picker.tsx`, `lib/teeth.ts`), duplicar item e prévia das parcelas. **Plano de pagamento** (`lib/payment-schedule.ts`, puro e testado): entrada no dia da aprovação (ou da criação, antes dela) e parcelas mês a mês com os valores de `paymentPlan`; o recebido cobre as parcelas em ordem (paga/parcial/em aberto/atrasada). **Registrar pagamento** em janela (`payment-dialog.tsx`): parcela já escolhida, forma num toque, dia (`paidOn`, meio-dia de Brasília se não for hoje), recibo ao salvar; o servidor recusa mais do que falta.
- **Comissões:** `Professional.commissionPercent` sobre a produção (atendimentos concluídos × preço-base), tabela no Financeiro.
- O expediente de cada profissional sai de `lib/working-hours.ts` (agenda e agendamento online).
- **Configurações** com menu lateral por grupos (`configuracoes/_components/settings-layout.tsx`; seção no hash, `#atendimento` antigo cai em `#horarios`): Clínica (dados, unidades, aparência), Equipe (usuários e acessos, profissionais), Agenda (horário, regras, rótulos, agendamento online), Atendimento (procedimentos, documentos), Financeiro (formas de recebimento), Comunicação e Conta (plano, privacidade). Teste de acessibilidade de cada seção em `e2e/regressao/configuracoes.spec.ts`.
- **Regras da agenda** (`Tenant.settings.agenda`, `lib/agenda-rules.ts` puro e testado): início/fim da grade, intervalo (5–30 min; a hora tem sempre 96 px, `grid-context.tsx`), duração padrão sem procedimento e "permitir encaixe" (pula o conflito; bloqueio continua valendo). **Formas de recebimento** (`Tenant.settings.paymentMethods`, `lib/payment-methods.ts`) na ficha e no orçamento — não confundir com `PAYMENT_METHODS` do orçamento/PDF.
- **Unidades** (várias clínicas na mesma conta, `ClinicUnit`): pacientes, orçamentos, financeiro e CRM são da clínica toda; cada unidade tem endereço, telefone, horário (`businessHours` próprio ou o da clínica) e agenda. A principal é a de menor `order` (`un_<tenantId>`, criada sozinha por `lib/units.ts` se faltar); agendamento ou expediente sem unidade = principal (`lib/unit-rules.ts`, puro e testado). Seletor no topo (`components/unit-switcher.tsx`, cookie `clinicaiq-unidade`, só com 2+ ativas); a agenda filtra pela unidade e cada dia do expediente do profissional diz a unidade (`ProfessionalSchedule.unitId`); conflito de horário confere em todas. `User.unitIds` restringe quem vê o quê (vazio = todas). Agendamento online pergunta a unidade. Produção: `docs/producao/2026-10-14-unidades.sql`.

## CRM

- **O CRM é um adicional pago** do sistema de agenda: R$ 39 por usuário/mês (`Plan.crmSeatPriceCents`), 14 dias grátis uma vez, cortesia inclui. Uma cobrança só no Asaas (plano + CRM) — `crm/billing.ts` (regras puras) e `crm/addon.ts` (ligar, desligar, acesso, `syncBillingValue`). Qualquer mudança que afete o valor chama `syncBillingValue`; a rotina diária também.
- Entrar no CRM exige três coisas: CRM ligado na clínica (`Subscription.crmEnabled`), perfil com `crm` (dono, admin, recepção; `crm_config` para dono e admin) e a chave da pessoa (`User.crmSeat`). Páginas usam `requireCrm`, actions usam `guardCrmAction` (`apps/web/crm/guard.ts`).
- O lead é um negócio, não a pessoa: a mesma pessoa pode ter vários. `Lead.patientId` liga ao paciente depois da conversão.
- **A agenda e os orçamentos nunca dependem do CRM.** A única ligação é `after(() => notifyCrm(tenantId, evento))` depois de salvar (`apps/web/crm/notify.ts`), que não faz nada sem o módulo e nunca lança. Não importe nada mais de `crm/` em código da clínica.
- As regras de automação ficam em `crm/automation.ts` (puras, testadas por tabela): avançar só para frente, voltar só no cancelamento ou falta, nunca perder sozinho.
- O que o card mostra da clínica (próxima avaliação, orçamento em aberto) é lido ao vivo (`crm/live.ts`), nunca copiado para o CRM.
- **Visual no jeito do Kommo** (só no espaço do CRM): sempre escuro, azul-marinho — o layout do CRM liga `dark crm-navy` no `<html>` (`components/crm-theme.tsx`; tokens em `.dark.crm-navy` no `app/globals.css`, `--link` para telefone e links; o alto contraste continua mandando). Menu estreito (`components/crm-rail.tsx`), cards com avatar, data, telefone e "Sem tarefas" (`_components/lead-card.tsx`), e nas Conversas o lead à direita (`conversas/_components/lead-side.tsx`, o mesmo `LeadPanel` da ficha).
- **Vários funis** (`Pipeline`; `PipelineStage.pipelineId`): cada funil tem Novo/Fechou/Perdeu com papel (`@@unique([pipelineId, role])`); "Avaliação agendada" e "Em negociação" com papel só no principal (o de menor `order`, `mainPipeline`). A agenda move o lead só dentro do funil dele (`notify.ts` lê as etapas do funil do lead). Lead novo sem etapa entra no principal. O quadro usa `?funil=` (ou o cookie `crm-funil`); trocar e criar funil pelo nome do funil (`pipeline-menu.tsx`); **Editar funil** é o próprio quadro (`?editar=1`, `pipeline-editor.tsx`); excluir funil leva os leads (abertos → entrada, ganhos → Fechou, perdidos → Perdeu). Regras em `crm/settings.ts`; telas recebem `basics.pipelines` (`crm/page-data.ts`), listas de etapa com o funil na frente (`stageOptions`).
- **Mapa do funil** (`_components/board-navigator.tsx`): no canto da tela, uma barrinha por etapa (altura pelo número de leads), o retângulo do que está visível e setas; clicar/arrastar leva o quadro até lá. Só aparece quando o funil não cabe.
- **Pesquisar e filtrar** (`_components/filter-panel.tsx`): atalhos, propriedades (nome/telefone, criado, etapa, funil na lista, origem, responsável, tarefas, valor) e tags com contagem. Tudo na URL (`crm/filters.ts`, puro e testado; `tag` aceita várias separadas por vírgula).
- **Automações** (`/crm/automacoes`): Bots, Modelos (criar e mandar para a Meta aprovar, com prévia), Transmissões (`/crm/transmissoes` redireciona) e Por etapa do funil. As Configurações do CRM ficaram com Funis, Tags, Motivos e Respostas.
- Horários: agendamentos são "hora de parede em UTC" (`lib/tz.ts`); tarefas do CRM são instantes reais. Conversões em `crm/clock.ts`.
- Spec e plano: `docs/superpowers/specs/2026-10-07-crm-etapa1-leads-funil-design.md` e `docs/superpowers/plans/2026-10-07-crm-etapa1-plan.md`.

### Conversas do WhatsApp (etapa 2)

- O gateway grava toda mensagem 1:1 da linha da clínica (`apps/whatsapp-gateway/src/chat-log.ts`) só para clínica com CRM: `Conversation` (um número = uma conversa) e `ChatMessage` (texto **cifrado**), sem duplicar por `tenantId + externalId`. A confirmação de consulta roda antes e não depende disso.
- A chave da conversa é `chatKey` (celular sempre com o 9), duplicada em `apps/web/lib/phone.ts` e `apps/whatsapp-gateway/src/phone.ts` — mudar as duas juntas (`chat-key.test.ts` nos dois lados).
- O app liga a conversa a lead aberto, paciente ou Entrada (`crm/conversations.ts`, `classifyConversation`), avisado pelo gateway em `/api/whatsapp/conversation` ou ao abrir o funil/Conversas.
- Resposta do CRM: a action grava `ChatMessage` PENDING com o id do WhatsApp já escolhido e `after(dispatchChat)` pede ao gateway (`POST /sessions/:tenantId/chat`); o gateway reserva a linha e reenvia sozinho. Sem gateway configurado, o app dá como enviada (só fora de produção).
- Origem: `CONTACT`, `CRM`, `PHONE` (celular da clínica) e `AUTOMATION` (o `send()` do gateway anota o id antes de mandar).
- Spec e plano: `docs/superpowers/specs/2026-10-10-crm-etapa2-conversas-design.md` e `docs/superpowers/plans/2026-10-10-crm-etapa2-plan.md`.

### API oficial, transmissões, robô e automações

- **Canal por clínica** (`crm/cloud.ts`): com `WhatsAppCloudAccount` ativa e conectada, as conversas entram pelo webhook `/api/webhooks/meta` (assinatura conferida com `META_APP_SECRET`) e saem pela Cloud API (`crm/cloud-send.ts`); o gateway não grava nem envia para essa clínica. Sem ela, é o gateway de QR. Os lembretes da agenda não mudam.
- `crm/chat-ingest.ts` espelha a gravação do gateway (`chat-log.ts`) — mudar os dois juntos.
- Janela de 24 h: na API oficial, fora dela só modelo aprovado (`MessageTemplate`). Token da Meta cifrado; nunca vai para a tela.
- **Relógio do CRM** (`crm/tick.ts`, `/api/cron/crm-tick`): roda automações com atraso, transmissões agendadas, a fila da API oficial e expira robôs. Quem chama: o uso do CRM (`crm/tick-nudge.ts`, no `requireCrm` e no atualizar das Conversas, no máximo 1×/min), o Supabase pg_cron (`docs/producao/relogio-crm.sql`, a ligar) e o gateway, se estiver no ar. Em desenvolvimento, `instrumentation.ts` também chama e dá como enviadas as mensagens da fila (`crm/dev-clock.ts`, nunca em produção). Cada parte reserva o que vai fazer, então chamadas juntas não duplicam.
- **Transmissões** (`crm/broadcasts.ts`): uma mensagem por lead na fila da conversa, com hora marcada (espaçada no QR). Respeitam `Lead.whatsappOptOut` ("SAIR", tratado em `crm/inbound.ts`). O público (`crm/audience.ts`, puro e testado) usa os filtros da busca de leads: situação, funil, etapa, tags (qualquer/todas e "sem estas tags"), dia de entrada, origem e responsável; "⋯ › Enviar transmissão para estes leads" no funil abre a nova transmissão com os filtros da busca (`audienceFromSearch`). Transmissões antigas sem os campos novos leem como "abertos".
- **Automações por etapa** (`crm/stage-automations.ts`): `createLead`/`moveLead` agendam (`crm/stage-queue.ts`, na mesma transação); se o lead sair da etapa antes da hora, não roda.
- **Robô** (`crm/bot-engine.ts` puro, `crm/bot.ts` executa): roda depois de cada mensagem do contato (`afterInbound`); para quando a equipe responde. Menu de botões com submenu, **pergunta aberta** (guarda no nome, e-mail ou como anotação no histórico; e-mail inválido pede de novo uma vez), várias ações por botão (etapa, tags, responsável) e **horário** (`BotSteps.hours`: sempre, só fora ou só dentro do expediente, fuso de Brasília). A tela (`bots-tab.tsx` + `crm/bot-form.ts`) começa de modelos prontos (`BOT_TEMPLATES`) e tem um simulador (`bot-simulator.tsx`) que roda o mesmo motor sem gravar nada — fora do `<form>` do robô.
- **Respostas personalizadas** (a "Condição" do Salesbot; `BotStep.rules`, `matchRule`/`hasWord` em `bot-engine.ts`, tela em `bot-rules.tsx`): em cada menu (quando a pessoa escreve em vez de tocar) e em cada pergunta (pela resposta), "se escrever estas palavras → responde, põe tags/etapa/responsável e depois encerra, mostra o menu, continua esperando ou chama a equipe". Vale a primeira que bater; o botão tocado vale mais. Na pergunta, a resposta é guardada antes. Textos aceitam `{primeiro_nome}`, `{nome}` e `{clinica}` (`fillVars`; sem nome, some sem deixar vírgula) — `bot.ts` passa o nome do paciente/lead/contato e o da clínica; o simulador usa "Ana Souza".
- **Robô por tag** (`BotSteps.audience`: `anyTags` "só para leads com" e `noneTags` "nunca com", no JSON dos passos, sem coluna nova): `pickBot` (puro) escolhe — palavra-chave antes de contato novo; o que pede tag antes do geral; fora do horário ou do público não conta. Vários robôs de contato novo podem ficar ligados se pedirem tag; geral, só um. A tela separa os robôs por gatilho, filtra por situação e por tag (pedida ou posta) e duplica.
- **Captação pela primeira mensagem** (`CaptureRule`; `crm/capture-rules.ts` puro, `crm/capture.ts` executa; tela na página dos Bots, `capture-rules.tsx`): palavras (inteiras, plural vale, sem acento) na primeira mensagem de um número criam o lead com tags, funil e origem — ou só põem as tags no lead aberto. Roda em `afterInbound` antes do robô, que recebe `newContact` para o robô de contato novo continuar valendo. Produção: `docs/producao/2026-10-14-captacao.sql`.
- **Cortesia inclui o CRM**: `getTenantModules` liga o módulo e `crmWholeTeam` dispensa a chave por pessoa.
- **Painel** (`/crm/painel`, `crm/dashboard.ts` + `crm/dashboard-math.ts` puro): leads novos, ganhos, perdidos, conversão, funil, origem, motivos de perda, equipe e tempo de resposta (mediana, só resposta de gente).
- **Arquivos pelo CRM** (`crm/media-rules.ts` puro, `crm/media-store.ts`): foto, PDF/Office, áudio e vídeo até 10 MB, guardados no Supabase Storage (`store:`) ou, só no desenvolvimento, em `apps/web/.crm-media` (`local:`). Saem pela API oficial (`CloudApi.uploadMedia` + `sendMedia`); o gateway de QR não manda arquivo (filtra `mediaRef: null`).
- **LGPD — apagar os dados de uma pessoa** (`crm/anonymize.ts`, botão no pé da ficha, só `crm_config`, confirmação "APAGAR"): todos os leads com o mesmo telefone ficam sem nome, telefone, e-mail, notas, tarefas, tags, conversas e arquivos; o negócio fechado continua nos números, o aberto sai do funil; a ficha de paciente não muda. Grava `LEAD_PERSONAL_DATA_ERASED` na auditoria.
- Banco de produção dos funis: `docs/producao/2026-10-13-funis.sql` (cria `pipelines`, põe as etapas no "Funil principal" e troca o índice de papel).
- Spec e plano: `docs/superpowers/specs/2026-10-11-crm-api-oficial-transmissoes-robo-design.md` e `docs/superpowers/plans/2026-10-11-crm-api-oficial-transmissoes-robo-plan.md`.

### Pacote A: dados e lista (no jeito do Kommo)

- **Campos personalizados** (`LeadField`; valores em `Lead.fields` jsonb, `{ [fieldId]: valor }`): texto, número, data, lista, várias opções e sim/não, até 40 ativos. Regras puras em `crm/custom-fields.ts`; banco em `crm/lead-fields.ts` — `setLeadFields` grava com um único `jsonb ||` (não apaga o que outra pessoa escreveu) e registra `FIELD_CHANGED`. O tipo não muda depois de criado. Aparecem na ficha, no card (até 3 com `showOnCard`), no Novo lead, nos filtros (`campo_<id>=`), na lista, no público da transmissão e no robô (pergunta aberta guarda em `field:<id>`). Cadastro em Configurações do CRM › Campos. Produção: `docs/producao/2026-10-16-crm-campos.sql`.
- **Lista de leads**: colunas escolhidas (cookie `crm-colunas`, `crm/list-columns.ts`), páginas de 100 (`pagina=`), marcar linhas ou "todos da busca".
- **Ações em massa** (`crm/bulk.ts`, até 2000): mover (sem automação de etapa, a não ser que peça), responsável, tag, tarefa, campo, perder e excluir (só `crm_config`). A coluna é renumerada uma vez no fim (`renumberStage`). Auditoria `LEADS_BULK_*`.
- **Exportar** (`/crm/leads/exportar`, só `crm_config`): CSV para o Excel brasileiro (`;`, BOM, proteção contra fórmula — `crm/csv.ts`), com os filtros da tela e os campos. Auditoria `LEADS_EXPORTED`.
- **Importar** (`/crm/leads/importar`, só `crm_config`): o navegador lê .xlsx (`read-excel-file`) ou .csv, reconhece as colunas do Kommo em pt/en/es (`crm/import-map.ts`, puro e testado) e manda lotes de 200 (`crm/import.ts`). Cria funis, etapas, tags e campos que faltam; ganho/perdido, datas, notas e responsável vêm junto; duplicado (lead aberto com o mesmo telefone) pula, atualiza ou cria. Não dispara automação de etapa (`createLead`/`moveLead` com `automations: false`). Auditoria `LEADS_IMPORTED` por lote.
- **Conversas no layout do Kommo**: lista | lead | conversa a partir de `xl` (`conversas/_components/inbox.tsx`); abaixo disso o lead abre numa gaveta pelo botão "Lead". Sem lead, o painel mostra o contato com "Criar lead" (nome, funil, etapa, tags — `acceptConversation` aceita essas opções) e "Recusar". A lista mostra o negócio, quem mandou a última mensagem (`previewFrom`) e as tags, com filtro por tag (`?tag=`). Balões com hora, autor e situação em cima e o avatar ao lado.
- Spec e plano: `docs/superpowers/specs/2026-10-16-crm-pacote-a-dados-lista-design.md` e `docs/superpowers/plans/2026-10-16-crm-pacote-a-plan.md`.

## Accessibility

WCAG 2.1 AA is a product differentiator. Every component must be keyboard-navigable, have proper ARIA attributes, and pass axe-core checks. Use `eslint-plugin-jsx-a11y` and `@axe-core/playwright`.

## LGPD

CPF and phone are encrypted at rest (AES-256-GCM). Use `encrypt`/`decrypt` from `@clinicaiq/db`. Never log or expose raw PII.

Para achar registros pelo telefone sem decifrar a tabela, use o índice cego `hashForTenant` (como `Lead.phoneHash`). No CRM, o telefone aparece mascarado; ver o número inteiro grava `LEAD_PHONE_VIEWED` na auditoria.
