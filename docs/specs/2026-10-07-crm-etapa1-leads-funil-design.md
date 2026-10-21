# CRM — Etapa 1: leads, funil, tags e tarefas

Data: 2026-10-07 (revisada em 2026-10-08)
Status: aprovado no brainstorming

## Contexto

O ClinicaIQ ganha um CRM de captação para clínicas. As **funcionalidades e a
organização de tela seguem o Kommo**; a identidade visual (cores, logo,
tipografia) continua a do ClinicaIQ. Nada de marca, ilustração ou texto do
Kommo é copiado.

O CRM inteiro foi dividido em cinco entregas, cada uma com spec e plano próprios:

1. **Leads, funil, tags e tarefas** ← esta spec
2. Conexão pela API oficial do WhatsApp (Embedded Signup), caixa de entrada e
   coluna "Entrada" (leads que chegam sozinhos)
3. Transmissões com templates aprovados pela Meta (substitui Campanhas para quem tem CRM)
4. Chatbot por botões e automações por etapa (ao entrar na etapa: mensagem, tarefa)
5. Plano "só CRM", plano combinado e cobrança

Decisões já tomadas para o CRM como um todo:

- Só para clínicas. O lead vira paciente dentro do ClinicaIQ.
- A API oficial é exclusiva do CRM. O plano básico continua no QR code (gateway Baileys).
- Na entrada, só WhatsApp e cadastro manual.
- Um funil por clínica, editável, que anda sozinho com a agenda e os orçamentos.
- O CRM pode ser vendido junto com a gestão clínica ou sozinho.

### Requisito principal: não atrapalhar o agendamento

- Nenhuma tabela existente muda de formato nesta etapa (só ganha relações e um
  campo novo com valor padrão em `Subscription`).
- A agenda e os orçamentos nunca esperam o CRM nem dependem dele para dar certo.
- Clínica sem o módulo CRM executa exatamente o código de hoje.
- A suíte E2E de regressão (`apps/web/e2e/regressao/`) passa a cada tarefa que
  mexe em código existente.
- Esta etapa não toca em nada de WhatsApp.

## Fora do escopo

Campos personalizados, vários funis, coluna "Entrada", automações configuráveis
por etapa, importação de planilha, qualquer coisa de WhatsApp, cobrança do
módulo e acesso de profissionais ao CRM.

## Modelo: pessoa e negócio

Como no Kommo, o **lead é um negócio** (uma oportunidade), não a pessoa. A
mesma pessoa pode ter vários leads ao longo do tempo: "Implante" em 2026 e
"Harmonização" em 2027. Enquanto não é paciente, os dados de contato ficam no
próprio lead; depois de convertido, o lead aponta para o `Patient`, e os
próximos leads dessa pessoa nascem já ligados a ele.

## Separação: dois espaços no mesmo app

| Espaço | Menu |
|---|---|
| Clínica | o menu de hoje (Dashboard, Agenda, Pacientes, Retorno, Procedimentos, Orçamentos, Financeiro, WhatsApp, Campanhas, Configurações) |
| CRM | Funil, Leads, Tarefas, Configurações do CRM (Conversas, Transmissões e Chatbot entram nas etapas 2–4) |

- O texto "Gestão clínica" embaixo do logo vira um seletor `Clínica | CRM`.
- O seletor só aparece quando a clínica tem os dois módulos.
- O último espaço usado fica num cookie, só como preferência: o acesso é sempre
  validado no servidor.
- O seletor é um grupo de dois links com `aria-current` e nome acessível
  "Trocar de módulo".
- Os pontos de encontro são links: "Agendar avaliação" no lead leva à Agenda;
  "Ver no funil" no paciente leva aos leads dele.

### No código

- Rotas: `apps/web/app/(crm)/crm/...`, grupo próprio com layout e menu. O que é
  comum (cabeçalho, menu do usuário) sai de `(app)/layout.tsx` para um
  `AppShell` compartilhado, sem mudar o que aparece.
- Domínio: `apps/web/crm/` guarda as regras. A agenda e os orçamentos só
  importam `apps/web/crm/notify.ts`.
- `NAV` em `components/app-sidebar.tsx` vira `CLINIC_NAV` e `CRM_NAV`.

## Acesso

1. **Módulo contratado:** `Subscription.crmEnabled` (padrão `false`). Ligado à
   mão nesta etapa. Sem ele, `/crm` mostra "módulo não contratado" e a automação
   não faz nada.
2. **Papel:**
   - `crm` — criar, editar, mover, converter, perder leads, criar e concluir
     tarefas: OWNER, ADMIN, RECEPTIONIST.
   - `crm_config` — etapas, tags, motivos de perda, excluir lead: OWNER, ADMIN.
   - PROFESSIONAL não tem acesso nesta etapa.

Toda server action do CRM chama `requireCrm(...)` (capacidade + módulo) e
valida que os ids recebidos são da clínica (`refOutsideTenant`).

## Dados

Todas as tabelas novas têm `tenantId` — a extensão de `getTenantClient` filtra
**todo** modelo por ele, inclusive tabelas de ligação.

### `Lead`

| Campo | Tipo | Observação |
|---|---|---|
| id, tenantId | | |
| title | String? | nome do negócio ("Implante"); vazio = mostra o interesse ou o nome |
| name | String | nome da pessoa (copiado do paciente quando ligado) |
| phoneEncrypted | String | AES-256-GCM via `encrypt` |
| phoneHash | String | HMAC do telefone normalizado com a chave da clínica, para duplicados |
| email | String? | |
| stageId | String | FK `PipelineStage` |
| position | Int | ordem na coluna |
| assignedToId | String? | FK `User` |
| source | LeadSource | `WHATSAPP`, `INDICACAO`, `INSTAGRAM`, `SITE`, `MANUAL`, `OUTRO` |
| interestProcedureId | String? | FK `Procedure` |
| estimatedValueCents | Int? | |
| notes | String? | |
| patientId | String? | FK `Patient`, **não único** (vários negócios por pessoa) |
| lostReasonId | String? | FK `LostReason` |
| stageEnteredAt | DateTime | quando entrou na etapa atual ("há 3 dias") |
| wonAt, lostAt, deletedAt | DateTime? | |
| createdById, updatedById | String? | |
| createdAt, updatedAt | DateTime | |

Índices: `[tenantId, stageId, position]`, `[tenantId, phoneHash]`,
`[tenantId, patientId]`, `[tenantId, assignedToId]`, `[tenantId, deletedAt]`.

Lead **aberto** = sem `wonAt`, sem `lostAt` e sem `deletedAt`.

### `PipelineStage`

| Campo | Tipo | Observação |
|---|---|---|
| id, tenantId | | |
| name | String | editável |
| color | String | token da paleta, não hex livre |
| order | Int | |
| role | StageRole? | `NEW`, `SCHEDULED`, `NEGOTIATION`, `WON`, `LOST`; null = etapa da clínica |

- `@@unique([tenantId, role])` — no Postgres, nulos não colidem, então etapas
  sem `role` não são afetadas.
- Etapas com `role` podem ser renomeadas e reordenadas, mas não apagadas.
- Etapas sem `role` podem ser apagadas; se tiverem leads, escolhe-se o destino.
- `WON` e `LOST` não aparecem como colunas: viram a barra "solte aqui" (ver Telas).

### `LeadTask` (tarefas)

| Campo | Tipo | Observação |
|---|---|---|
| id, tenantId, leadId | | |
| text | String | "Ligar para confirmar avaliação" |
| dueAt | DateTime | data e hora |
| assignedToId | String | FK `User` (padrão: responsável do lead) |
| completedAt | DateTime? | |
| completedById | String? | |
| origin | TaskOrigin | `MANUAL` ou `AUTOMATION` |
| createdById | String? | |
| createdAt, updatedAt | DateTime | |

Índices: `[tenantId, leadId, completedAt]`, `[tenantId, assignedToId, completedAt, dueAt]`.

Situação do lead, calculada na leitura (não gravada):

- **Sem tarefa** — lead aberto sem nenhuma tarefa pendente.
- **Atrasada** — tem tarefa pendente com `dueAt` no passado.
- **Em dia** — a próxima tarefa pendente ainda não venceu (o card mostra quando).

### `LeadTag`, `LeadTagOnLead`, `LostReason`

- `LeadTag`: `tenantId`, `name`, `color`; `@@unique([tenantId, name])`.
- `LeadTagOnLead`: `tenantId`, `leadId`, `tagId`; chave `[leadId, tagId]`.
- `LostReason`: `tenantId`, `name`, `order`, `active`. Padrão: Achou caro, Sem
  resposta, Fechou com outra clínica, Só pesquisando, Outro.

### `LeadActivity` (histórico)

`tenantId`, `leadId`, `type`, `data` (Json), `actorId?` (nulo = automação), `createdAt`.

Tipos: `CREATED`, `STAGE_CHANGED`, `NOTE`, `TAG_ADDED`, `TAG_REMOVED`,
`ASSIGNED`, `TASK_CREATED`, `TASK_COMPLETED`, `CONVERTED`, `LOST`, `REOPENED`,
`CLINIC_EVENT` (eventos da agenda e dos orçamentos).

Índice: `[tenantId, leadId, createdAt desc]`. Telefone e dados pessoais nunca vão em `data`.

### `Subscription`

Ganha `crmEnabled Boolean @default(false)`.

## Funil padrão

Criado por `ensureDefaultPipeline` (idempotente) na primeira abertura do CRM:

| Ordem | Nome | role | Como o card chega |
|---|---|---|---|
| 1 | Novo | NEW | lead criado |
| 2 | Em conversa | — | manual |
| 3 | Avaliação agendada | SCHEDULED | automático: agendamento criado |
| 4 | Em negociação | NEGOTIATION | automático: orçamento criado (em aberto) |
| — | Fechou | WON | automático: orçamento aprovado; ou manual |
| — | Perdeu | LOST | sempre manual, com motivo |

## Regras do lead

- **Criar:** nome e telefone obrigatórios; título, interesse, valor, origem,
  responsável (padrão: quem criou) opcionais. Entra em `NEW`.
- **Duplicado:** se já houver lead **aberto** com o mesmo telefone, avisa e
  oferece abrir o existente. Se o telefone for de um paciente, cria o lead já
  ligado a ele (sem perguntar de novo os dados).
- **Ganho:** preenche `wonAt`. **Perda:** exige motivo e preenche `lostAt`.
- **Reabrir:** limpa `wonAt`/`lostAt`, volta para a etapa escolhida, registra `REOPENED`.
- **Mover:** atualiza `stageId`, `position`, `stageEnteredAt` e registra `STAGE_CHANGED`.
- **Excluir:** exclusão lógica, só `crm_config`.

## Conversão em paciente

- "Converter em paciente": se o telefone já for de um paciente, oferece
  "Vincular a este paciente". Senão, abre o `patient-form.tsx` existente
  preenchido (nome, telefone, e-mail). Aceite LGPD continua obrigatório. Ao
  salvar, grava `Lead.patientId` e registra `CONVERTED`.
- "Agendar avaliação": converte se preciso e abre `/agenda?novo=1&paciente=<id>`,
  que abre o modal de novo agendamento com o paciente escolhido. Sem esses
  parâmetros a agenda não muda.
- Converter não move o card; quem move é a agenda, pela automação.

## Integração automática com a agenda e os orçamentos

### Como o aviso chega

Depois que a ação da clínica **já salvou**, ela chama
`after(() => notifyCrm(tenantId, evento))`. `notifyCrm`:

- não faz nada sem `crmEnabled`;
- acha o **lead aberto mais recente** do paciente (`patientId`); sem lead, nada;
- trata qualquer erro por dentro (log só com tipo e ids) e **nunca lança**.

### Regras

| Evento | Onde nasce | O que o CRM faz |
|---|---|---|
| `appointment.created` | `createAppointment` | move para `SCHEDULED` |
| `appointment.rescheduled` | `updateAppointment`, `moveAppointment` | só histórico (a data no card é lida ao vivo) |
| `appointment.cancelled` | `updateAppointmentStatus`/`cancelAppointment` com CANCELLED, `deleteAppointment` | se o lead está em `SCHEDULED` e o paciente não tem outro agendamento futuro: volta para "Em conversa" (ou `NEW`, se a clínica apagou "Em conversa") e cria a tarefa "Reagendar avaliação" (amanhã 10h, para o responsável) |
| `appointment.missed` | `updateAppointmentStatus` com MISSED | igual ao cancelamento, com o texto "Faltou na avaliação — reagendar" |
| `appointment.attended` | `updateAppointmentStatus` com ATTENDED | histórico; se o paciente não tem orçamento em aberto, cria a tarefa "Enviar orçamento" (amanhã 10h) |
| `quote.created` | `createQuote` | move para `NEGOTIATION` |
| `quote.accepted` | `acceptQuote`, aceite pelo link público | move para `WON`, `wonAt` e valor = total do orçamento |
| `quote.reopened` | `reopenQuote` | se o lead foi ganho por esse orçamento: reabre e volta para `NEGOTIATION` |
| `quote.rejected` | recusa pelo link público | histórico com o motivo + tarefa "Retomar negociação"; **não** perde o lead |
| `quote.deleted` | `deleteQuote` | histórico + tarefa "Retomar negociação" se não sobrou orçamento em aberto |

Princípios:

1. **Avançar** (`SCHEDULED`, `NEGOTIATION`, `WON`) só acontece se a etapa de
   destino vier depois da atual. Se a recepção já pôs o card mais à frente, a
   automação não o puxa para trás.
2. **Voltar** só acontece no cancelamento ou falta, e só a partir de `SCHEDULED`.
3. **Perder nunca é automático.**
4. Lead ganho ou perdido não é mexido, exceto por `quote.reopened` do próprio
   orçamento que o ganhou.
5. Todo movimento ou tarefa automática registra histórico com `actorId` nulo e
   a origem do evento.

### O que o card mostra ao vivo

A próxima avaliação ("Avaliação 12/10 9h") e o orçamento em aberto ("Orçamento
nº 12 · R$ 6.500") são **lidos da agenda e dos orçamentos** na hora de montar
o quadro, pelo `patientId` do lead — não copiados para o CRM. Se um aviso se
perder, o card fica numa etapa atrasada (a pessoa arrasta), mas nunca mostra
data ou valor errados.

## Telas (organização no estilo Kommo)

### `/crm` — Funil

- Barra superior: Quadro | Lista, busca por nome ou telefone, filtros rápidos
  ("Meus leads", "Sem tarefa", "Atrasadas", por tag, por origem) e "Novo lead".
- Uma coluna por etapa (exceto `WON`/`LOST`): linha colorida no topo, nome,
  quantidade e soma do valor; "Adicionar rápido" no topo da coluna (nome +
  telefone, Enter salva).
- Card: título ou nome, interesse e origem, tags, responsável, valor, avaliação
  ou orçamento ao vivo, e a situação da tarefa ("Sem tarefa" em aviso,
  "Atrasada" em perigo, ou a hora da próxima).
- Ao arrastar um card aparece no rodapé a barra "Ganho | Perdido | Excluir".
  Soltar em Perdido abre o motivo; Excluir só aparece para `crm_config`.
- Arrastar usa `@dnd-kit/core` (já usado na agenda) com `KeyboardSensor` e
  anúncios em português. Todo card tem o menu "Mover para…" (inclui Ganho e
  Perdido), que é o caminho principal por teclado.

### `/crm/leads` — Lista

Tabela com as mesmas informações e filtros, colunas ordenáveis, inclusive
ganhos e perdidos (filtro por situação).

### `/crm/leads/[id]` — Ficha do lead

- **Esquerda (dados):** título, tags (adicionar e criar na hora), barra de
  progresso pelas etapas com seletor, responsável, valor, interesse, telefone
  (mascarado até clicar em "mostrar"), e-mail, origem, paciente ligado, e os
  botões Agendar avaliação, Converter em paciente, Marcar como perdido / Reabrir.
- **Direita (histórico):** linha do tempo mais nova embaixo, com eventos,
  notas, tarefas (com botão "Concluir") e eventos da clínica. Embaixo, a caixa
  com abas **Tarefa** (texto, data e hora, responsável) e **Nota**. A aba
  Conversa fica reservada para a etapa 2.
- Outros leads da mesma pessoa aparecem num bloco "Outros negócios".

### `/crm/tarefas` — Tarefas

Lista das tarefas pendentes em três grupos — Atrasadas, Hoje, Próximas —
filtráveis por responsável (padrão: as minhas). Concluir direto da lista.

### `/crm/configuracoes`

Abas Etapas (criar, renomear, cor, reordenar, apagar com destino), Tags e
Motivos de perda. Exige `crm_config`.

### Na ficha do paciente

Bloco "Negócios no CRM" com os leads da pessoa e link para cada um. Só aparece
com `crm`.

## Acessibilidade (WCAG 2.1 AA)

- O quadro é uma lista de regiões rotuladas ("Etapa Novo, 12 leads"); cards
  são itens focáveis.
- "Mover para…" e o sensor de teclado anunciam o resultado em `aria-live`.
- A barra "solte aqui" tem equivalente no menu "Mover para…".
- Cor de etapa, tag e situação de tarefa nunca é a única informação (sempre há texto).
- Modais seguem o padrão da agenda (foco preso, Esc fecha, foco volta).
- axe-core em todas as telas do CRM.

## LGPD

- Telefone do lead criptografado e mascarado na tela; nunca em log nem no histórico.
- O aceite de tratamento é coletado na conversão em paciente.
- Exclusão é lógica. Anonimização a pedido entra na etapa 2, junto com as conversas.

## Testes

**Unitários (Vitest)**

- Regras de automação (tabela de casos): avança só para frente; volta só em
  cancelamento/falta a partir de `SCHEDULED`; não volta se há outro
  agendamento futuro; nunca perde; reabertura só pelo orçamento que ganhou;
  tarefas automáticas criadas nos casos certos; sem lead não faz nada.
- `notifyCrm` nunca lança, mesmo com o banco falhando; sem módulo não consulta nada.
- Situação de tarefa (sem tarefa / atrasada / em dia).
- `ensureDefaultPipeline` idempotente; apagar etapa (bloqueio de `role`, destino).
- Duplicado por telefone só entre leads abertos; perda exige motivo; reabrir limpa datas.

**E2E (Playwright + axe-core)**

- Caminho completo: criar lead → "Sem tarefa" aparece → criar tarefa →
  converter → agendar (card em "Avaliação agendada") → cancelar (card volta e
  aparece "Reagendar avaliação") → reagendar → criar orçamento ("Em
  negociação") → aprovar ("Fechou").
- Mover pelo teclado com "Mover para…", inclusive para Perdido com motivo.
- Sem `crmEnabled`: sem seletor e `/crm` barrado. Recepção não abre configurações.
- axe-core sem violações em todas as telas do CRM e na agenda com o seletor.

**Regressão:** `e2e/regressao/` verde a cada tarefa que mexe em código existente.

## Critério de pronto

- Com `crmEnabled`, a clínica capta, organiza, etiqueta, agenda tarefas, perde,
  reabre e converte leads, e o card anda sozinho com a agenda e os orçamentos.
- Sem `crmEnabled`, nenhuma diferença.
- Lint, typecheck, unitários e E2E passando.
