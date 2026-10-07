# CRM — Etapa 1: leads, funil e tags

Data: 2026-10-07
Status: aprovado no brainstorming, aguardando revisão da spec

## Contexto

O ClinicaIQ ganha um CRM de captação para clínicas, no estilo do Kommo, mas
pensado para o caminho de clínica: o lead chega, conversa, agenda avaliação,
recebe orçamento e vira paciente.

O CRM inteiro foi dividido em cinco entregas, cada uma com spec e plano próprios:

1. **Leads, funil e tags** ← esta spec
2. Conexão pela API oficial do WhatsApp (Embedded Signup) e caixa de entrada
3. Transmissões com templates aprovados pela Meta (substitui Campanhas para quem tem CRM)
4. Chatbot por botões (menu, perguntas de qualificação, fora do horário, passar para humano)
5. Plano "só CRM", plano combinado e cobrança

Decisões já tomadas para o CRM como um todo:

- Só para clínicas. O lead vira paciente dentro do ClinicaIQ.
- A API oficial é exclusiva do CRM. O plano básico continua no QR code (gateway Baileys).
- Na entrada, só WhatsApp e cadastro manual.
- Um funil por clínica, editável, que anda sozinho com os eventos da agenda e dos orçamentos.
- O CRM pode ser vendido junto com a gestão clínica ou sozinho.

### Requisito principal: não atrapalhar o agendamento

- Nenhuma tabela existente muda de formato nesta etapa.
- A agenda e os orçamentos nunca esperam o CRM nem dependem dele para dar certo.
- Clínica sem o módulo CRM executa exatamente o código de hoje.
- Os E2E atuais da agenda, dos pacientes e dos orçamentos precisam passar antes da entrega.
- Esta etapa não toca em nada de WhatsApp.

## Fora do escopo

Campos personalizados, vários funis, tarefas do atendente, importação de
planilha, qualquer coisa de WhatsApp, cobrança do módulo e acesso de
profissionais ao CRM.

## Separação: dois espaços no mesmo app

O app passa a ter dois espaços, cada um com o próprio menu lateral:

| Espaço | Menu |
|---|---|
| Clínica | o menu de hoje (Dashboard, Agenda, Pacientes, Retorno, Procedimentos, Orçamentos, Financeiro, WhatsApp, Campanhas, Configurações) |
| CRM | Funil, Leads, Configurações do CRM (Conversas, Transmissões e Chatbot entram nas etapas 2–4) |

- O texto "Gestão clínica" embaixo do logo vira um seletor `Clínica | CRM`.
- O seletor só aparece quando a clínica tem os dois módulos. Com um só, o menu
  mostra apenas aquele espaço, sem seletor.
- O último espaço usado fica lembrado em um cookie, que é só preferência: o
  acesso é sempre validado no servidor.
- O seletor é um grupo de dois links com `aria-current`. Ele é navegável por
  teclado e tem nome acessível ("Trocar de módulo").
- Os pontos de encontro entre os espaços são só links: "Agendar avaliação" no
  lead leva para a Agenda, e "Ver no funil" no paciente que veio de um lead leva
  para o card dele.

### No código

- Rotas: `apps/web/app/(crm)/crm/...`, um grupo de rotas com layout e menu
  próprios. O que é comum (cabeçalho, menu do usuário, provedores) sai do layout
  de `(app)` para um componente compartilhado, sem mudar o comportamento.
- Domínio: `apps/web/crm/` guarda as regras (funil, conversão, automação,
  funil padrão). Telas e server actions do CRM importam daqui.
- A agenda e os orçamentos nunca importam de `apps/web/crm/`, com uma única
  exceção: a função `notifyCrm` (ver "Automação").
- `NAV` em `components/app-sidebar.tsx` vira duas listas, `CLINIC_NAV` e `CRM_NAV`.

## Acesso

Duas camadas, como no resto do sistema:

1. **Módulo contratado.** A flag `crmEnabled` em `Subscription` diz se a clínica
   tem o CRM. Nesta etapa ela é ligada manualmente, como a cortesia. Sem a flag,
   as rotas `/crm` respondem com a tela de "módulo não contratado" e a automação
   não faz nada.
2. **Papel da pessoa.** Duas capacidades novas em `lib/permissions.ts`:
   - `crm`: criar, editar, mover, converter e marcar perda em leads. Vale para OWNER, ADMIN e RECEPTIONIST.
   - `crm_config`: editar etapas, tags e motivos de perda. Vale para OWNER e ADMIN.
   - PROFESSIONAL não recebe nenhuma das duas nesta etapa.

Toda server action do CRM chama `requireCapability`, checa a flag do módulo e
valida que os ids recebidos pertencem à clínica, seguindo o padrão `refOutsideTenant`.

## Dados

Todas as tabelas são novas e têm `tenantId`. O acesso é sempre por
`getTenantClient(tenantId)`.

### `Lead`

| Campo | Tipo | Observação |
|---|---|---|
| id | cuid | |
| tenantId | String | |
| name | String | |
| phoneEncrypted | String | AES-256-GCM via `encrypt`, como no paciente |
| phoneHash | String | HMAC do telefone normalizado, para busca e para achar duplicados sem decifrar |
| email | String? | |
| stageId | String | FK para `PipelineStage` |
| position | Int | ordem dentro da coluna |
| assignedToId | String? | FK para `User` |
| source | LeadSource | `WHATSAPP`, `INDICACAO`, `INSTAGRAM`, `SITE`, `MANUAL`, `OUTRO` |
| interestProcedureId | String? | FK para `Procedure` |
| estimatedValueCents | Int? | |
| notes | String? | |
| patientId | String? @unique | preenchido quando vira paciente |
| lostReasonId | String? | FK para `LostReason` |
| wonAt / lostAt | DateTime? | |
| deletedAt | DateTime? | exclusão lógica |
| createdById / updatedById | String? | |
| createdAt / updatedAt | DateTime | |

Índices: `[tenantId, stageId, position]`, `[tenantId, phoneHash]`,
`[tenantId, deletedAt]` e `[tenantId, assignedToId]`.

> Hoje os pacientes não têm hash de telefone. O `phoneHash` do lead é um HMAC
> com a chave derivada da clínica (`packages/db/src/encryption.ts`) e serve só
> para achar lead duplicado. Para achar paciente com o mesmo telefone, o sistema
> decifra os telefones dos pacientes da clínica, como a busca de pacientes já
> faz. Criar um hash para pacientes mexeria em tabela existente e fica fora
> desta etapa.

### `PipelineStage`

| Campo | Tipo | Observação |
|---|---|---|
| id, tenantId | | |
| name | String | editável |
| color | String | um token da paleta, não um hex livre |
| order | Int | |
| role | StageRole? | `NEW`, `SCHEDULED`, `QUOTED`, `WON`, `LOST`; null = etapa criada pela clínica |

Regras:

- Cada `role` aparece no máximo uma vez por clínica (índice único parcial em
  `[tenantId, role]` onde `role` não é nulo).
- Etapas com `role` `WON` e `LOST` não podem ser apagadas. As demais etapas com
  `role` podem ser renomeadas e reordenadas, mas não apagadas, porque a
  automação depende delas.
- Etapas sem `role` podem ser apagadas. Se tiverem leads, a pessoa escolhe a
  etapa de destino antes.
- `WON` e `LOST` sempre aparecem por último no quadro, nessa ordem.

### `LeadTag` e `LeadTagOnLead`

- `LeadTag`: `id`, `tenantId`, `name` e `color`, com `@@unique([tenantId, name])`.
- `LeadTagOnLead`: `leadId` e `tagId`, com a chave composta pelos dois.

### `LostReason`

`id`, `tenantId`, `name`, `order` e `active`. A clínica começa com: Achou caro,
Sem resposta, Fechou com outra clínica, Só pesquisando, Outro.

### `LeadActivity`

Histórico do card, mais novo primeiro.

| Campo | Tipo |
|---|---|
| id, tenantId, leadId | |
| type | `CREATED`, `STAGE_CHANGED`, `NOTE`, `TAG_ADDED`, `TAG_REMOVED`, `ASSIGNED`, `CONVERTED`, `LOST`, `REOPENED`, `AUTOMATION` |
| data | Json (ex.: `{ from, to }`, `{ tagId }`, `{ appointmentId }`) |
| actorId | String? (nulo quando foi a automação) |
| createdAt | DateTime |

Índice: `[tenantId, leadId, createdAt desc]`.

Telefone e qualquer outro dado pessoal nunca vão para `data`.

### `Subscription`

Ganha `crmEnabled Boolean @default(false)`. É o único campo novo numa tabela
existente. Ele é aditivo e tem valor padrão, então nenhuma consulta atual muda.

## Funil padrão

Criado na primeira vez que a clínica abre o CRM com o módulo ligado, por uma
função idempotente (`ensureDefaultPipeline`):

| Ordem | Nome | role |
|---|---|---|
| 1 | Novo | NEW |
| 2 | Em conversa | — |
| 3 | Avaliação agendada | SCHEDULED |
| 4 | Orçamento enviado | QUOTED |
| 5 | Fechou | WON |
| 6 | Perdeu | LOST |

A mesma função cria os motivos de perda padrão.

## Regras do lead

- **Criar:** nome e telefone são obrigatórios. O lead entra na etapa `NEW`, a
  menos que a pessoa escolha outra. Se o telefone já pertencer a um lead aberto,
  o sistema avisa e oferece abrir o existente. Se pertencer a um paciente,
  oferece criar o lead já vinculado.
- **Mover para `WON`:** preenche `wonAt`.
- **Mover para `LOST`:** exige motivo de perda e preenche `lostAt`.
- **Reabrir:** tirar o lead de `WON` ou `LOST` limpa as datas e registra
  `REOPENED`.
- **Ordem na coluna:** campo `position`. Mover o card reposiciona só a coluna
  de destino.
- **Excluir:** exclusão lógica, só para quem tem `crm_config`.

## Conversão em paciente

- **"Converter em paciente":** abre o formulário de paciente que já existe
  (`pacientes/_components/patient-form.tsx`), preenchido com nome, telefone e
  e-mail. O aceite da LGPD continua obrigatório. Ao salvar, `Lead.patientId`
  recebe o paciente e registra `CONVERTED`.
- **Telefone igual ao de um paciente existente:** antes de abrir o formulário, o
  sistema mostra o paciente e oferece "Vincular a este paciente". Vincular não
  cria nem altera o paciente.
- **"Agendar avaliação":** converte primeiro, se ainda não for paciente, e
  depois navega para `/agenda?novo=1&paciente=<id>`. A agenda abre o modal de
  novo agendamento com o paciente escolhido. Essa é a única mudança visível na
  agenda: ler dois parâmetros da URL e pré-selecionar. Sem esses parâmetros, a
  agenda se comporta como hoje.
- Converter não move o card. Quem move é o agendamento ou o orçamento, pela automação.

## Automação: o card anda sozinho

Depois que a ação da agenda ou do orçamento já salvou, ela chama:

```ts
after(() => notifyCrm(tenantId, { type: 'appointment.created', patientId, appointmentId }));
```

- `after()` (de `next/server`) roda depois da resposta. A ação não espera e o
  usuário não vê atraso.
- `notifyCrm` mora em `apps/web/crm/notify.ts` e:
  - não faz nada se a clínica não tiver `crmEnabled`;
  - trata qualquer erro dentro de si mesma (try/catch com log sem dados
    pessoais) e nunca lança erro.

Pontos de chamada (uma linha cada):

| Ação existente | Evento |
|---|---|
| `agenda/actions.ts` → `createAppointment` | `appointment.created` |
| `agenda/actions.ts` → `updateAppointmentStatus` com MISSED | `appointment.missed` |
| `(app)/orcamentos/actions.ts` → as duas ações que gravam `status: 'SENT'` | `quote.sent` |
| `(app)/orcamentos/actions.ts` → a ação que grava `status: 'ACCEPTED'` | `quote.accepted` |
| `orcamento/[token]/actions.ts` → aceite pelo link público | `quote.accepted` |

Regras aplicadas pelo CRM:

1. Procura o lead aberto (sem `wonAt`, sem `lostAt` e sem `deletedAt`) com aquele
   `patientId`. Se não houver, não faz nada.
2. `appointment.created` → move para `SCHEDULED`.
3. `quote.sent` → move para `QUOTED`.
4. `quote.accepted` → move para `WON`, preenche `wonAt` e grava o total do
   orçamento em `estimatedValueCents`.
5. `appointment.missed` → não move, só registra uma `AUTOMATION` no histórico.
6. **Só para frente:** a automação só move se a etapa de destino vier depois da
   atual na ordem do funil. Se a recepção já colocou o card mais adiante, nada acontece.
7. Todo movimento automático registra `STAGE_CHANGED` com `actorId` nulo e a
   origem no `data`.

Limite conhecido: se `notifyCrm` falhar, o card fica para trás. Isso é aceito
nesta etapa, porque o agendamento já foi salvo e a pessoa pode mover o card à
mão. Uma fila com reprocessamento só entra se isso acontecer na prática.

## Telas

### `/crm` — Funil (kanban)

- Uma coluna por etapa, com nome, quantidade e soma de `estimatedValueCents`.
- O card mostra nome, tags, responsável, origem, valor e há quanto tempo está na etapa.
- Filtros: responsável, tag e origem. Busca por nome ou telefone.
- As colunas `WON` e `LOST` mostram só os últimos 30 dias, com o link "ver todos".
- Arrastar usa `@dnd-kit/core`, que a agenda já usa, com `KeyboardSensor` e
  `announcements` em português.
- Todo card tem um menu "Mover para…", que é o caminho principal para teclado e
  leitor de tela.
- "Novo lead" abre um modal.

### `/crm/leads` — Lista

A mesma informação do funil em tabela, com colunas ordenáveis e os mesmos
filtros. É a alternativa completa ao kanban.

### `/crm/leads/[id]` — Detalhe

- Dados editáveis, etapa, responsável, tags (adicionar e criar na hora) e valor.
- Ações: Converter em paciente, Agendar avaliação, Marcar como perdido, Reabrir.
- Anotação rápida e histórico.
- Se tiver `patientId`, mostra o link "Abrir ficha do paciente".

### `/crm/configuracoes`

Abas Etapas (criar, renomear, cor, reordenar, apagar com destino), Tags e
Motivos de perda. Exige `crm_config`.

### Na ficha do paciente

Se existir um lead com aquele `patientId`, aparece o link "Ver no funil". É só
leitura e não aparece para quem não tem `crm`.

## Acessibilidade (WCAG 2.1 AA)

- O kanban é uma lista de regiões rotuladas ("Etapa Novo, 12 leads"), e os
  cards são itens focáveis.
- Mover pelo teclado: o menu "Mover para…" e o sensor de teclado do dnd-kit.
  Os dois anunciam o resultado numa região `aria-live`.
- A cor da etapa e da tag nunca é a única informação, porque o nome aparece sempre.
- Os modais seguem o padrão já usado na agenda (foco preso, Esc fecha, foco
  volta para quem abriu).
- O axe-core roda nas quatro telas no E2E.

## LGPD

- O telefone do lead é criptografado como o do paciente e nunca aparece em log
  nem no `data` do histórico.
- O lead não tem aceite de LGPD próprio nesta etapa: o dado é de contato
  comercial que a própria pessoa iniciou. O aceite do tratamento continua sendo
  coletado na conversão em paciente.
- Excluir o lead é exclusão lógica. Anonimizar a pedido do titular fica fora
  desta etapa e entra junto com a caixa de entrada (etapa 2), quando o lead
  passa a ter conversas guardadas.

## Testes

**Unitários (Vitest)**

- Regras de movimento automático: só para frente, ignora lead fechado ou
  perdido, sem lead não faz nada, `MISSED` não move.
- `notifyCrm` nunca lança erro, mesmo com o banco falhando, e não faz nada sem `crmEnabled`.
- `ensureDefaultPipeline` é idempotente.
- Apagar etapa: bloqueia `role` de sistema e exige destino quando há leads.
- Achar duplicado por telefone (lead e paciente).
- Perda exige motivo, e reabrir limpa as datas.

**E2E (Playwright + axe-core)**

- Criar lead → mover pelo teclado com "Mover para…" → converter em paciente →
  agendar avaliação → o card aparece em "Avaliação agendada".
- Clínica sem `crmEnabled`: o seletor não aparece e `/crm` é barrado.
- Recepção não abre `/crm/configuracoes`.
- axe-core sem violações em `/crm`, `/crm/leads`, `/crm/leads/[id]` e `/crm/configuracoes`.

**Regressão**

- A suíte E2E atual da agenda, dos pacientes e dos orçamentos passa sem alteração.
- A agenda aberta sem os parâmetros `novo`/`paciente` se comporta exatamente como antes.

## Critério de pronto

- Uma clínica com `crmEnabled` consegue captar, mover, etiquetar, perder,
  reabrir e converter leads, e o card anda sozinho com agendamento e orçamento.
- Uma clínica sem `crmEnabled` não vê nenhuma diferença.
- Lint, typecheck, unitários e E2E passando.
