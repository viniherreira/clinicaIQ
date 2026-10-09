# CRM como adicional pago

Data: 2026-10-09
Status: aprovado no brainstorming

## Contexto e mudança de estratégia

O ClinicaIQ é o sistema de agenda e gestão da clínica. **O CRM é um adicional
pago**, contratado por cima de qualquer plano (Essencial, Profissional,
Clínica). Não existe mais plano "só CRM" (decisão anterior revogada).

Esta entrega vem **antes** da etapa 2 (WhatsApp e caixa de entrada): o CRM da
etapa 1 só vai para produção já vendável.

## Decisões

- **Cobrança por usuário**, como o Kommo: **R$ 39 por usuário por mês**.
- **A clínica escolhe quem tem CRM**: chave "Acesso ao CRM" por pessoa na Equipe.
- **14 dias grátis**, uma vez por clínica.
- **Uma cobrança só**: a assinatura do Asaas passa a valer plano + CRM.
- **Cortesia inclui o CRM**, sem cobrança, com quantos usuários quiser.
- Profissional continua sem acesso ao CRM (perfil não elegível).

## Dados (só acréscimos)

| Onde | Campo | Para quê |
|---|---|---|
| `Plan` | `crmSeatPriceCents Int @default(3900)` | preço por usuário, no banco como os preços dos planos |
| `Subscription` | `crmEnabled` (já existe) | o CRM está ligado (em teste, pago ou cortesia) |
| `Subscription` | `crmTrialEndsAt DateTime?` | fim do teste; preenchido também marca que o teste já foi usado |
| `Subscription` | `billedValueCents Int?` | último valor mandado ao Asaas, para só atualizar quando mudar |
| `User` | `crmSeat Boolean @default(false)` | a pessoa tem acesso ao CRM e conta na cobrança |

## Regras

### Situação do CRM da clínica (função pura)

- `off` — `crmEnabled` falso.
- `complimentary` — ligado e a assinatura é cortesia: grátis.
- `trial` — ligado e `crmTrialEndsAt` no futuro: grátis.
- `paid` — ligado e o teste acabou: cobra.

### Valor da assinatura (função pura)

`valor = plano + (situação = paid ? usuários com CRM ativos × crmSeatPriceCents : 0)`

Usuário conta se `active` e `crmSeat` e o perfil é elegível (dono, admin, recepção).

Descrição no Asaas: `ClinicaIQ — plano Profissional + CRM (2 usuários)`.

### Quando o valor é recalculado e enviado ao Asaas

`syncBillingValue(tenantId)` calcula o valor; se a clínica tem assinatura no
Asaas, não é cortesia e o valor difere de `billedValueCents`, chama
`updateSubscriptionValue` e grava `billedValueCents`. Chamado em:

- ligar e desligar o CRM;
- dar e tirar acesso ao CRM de alguém (e remover alguém da equipe);
- trocar de plano (`choosePlan` passa a usar o valor total);
- rotina diária (`reconcileSubscriptions`): pega o fim do teste e qualquer
  divergência. Falha numa clínica não derruba as outras.

Clínica sem assinatura no Asaas (ainda no teste do próprio sistema): nada é
enviado; quando ela escolher o plano, `choosePlan` já cria com o valor total.

Mudança no meio do mês segue o comportamento atual da troca de plano
(`updatePendingPayments: true`): vale na fatura em aberto ou na próxima, sem
proporcional.

### Ligar e desligar

- **Experimentar** (dono/admin, capacidade `planos`): só se o teste nunca foi
  usado; liga `crmEnabled`, `crmTrialEndsAt = agora + 14 dias`, e dá acesso a
  quem ligou.
- **Ativar** (teste já usado, ou cortesia): liga `crmEnabled` direto; em
  cortesia não há cobrança, senão passa a cobrar.
- **Desligar**: `crmEnabled = false`, sincroniza o valor (sai da cobrança). Os
  dados do CRM ficam guardados; religar mostra tudo de volta.
- Clínica suspensa (cobrança atrasada além da tolerância) não liga o CRM.

### Acesso

Entrar no CRM exige as três coisas: CRM ligado na clínica, `crmSeat` da pessoa,
perfil com `crm`. `requireCrm` e `guardCrmAction` passam a checar o acesso da
pessoa. A automação (`notifyCrm`) depende só de o CRM estar ligado na clínica.

Sem acesso, a pessoa vê o seletor? Não: o seletor só aparece para quem tem acesso.

### Dar e tirar acesso

- Na Equipe (capacidade `equipe`): chave "Acesso ao CRM · R$ 39/mês" por pessoa
  elegível, visível quando o CRM está ligado. Em teste ou cortesia, a chave diz
  "grátis no teste" / "incluído na cortesia".
- Tirar o acesso não mexe nos leads da pessoa.
- Precisa sobrar ao menos uma pessoa com acesso enquanto o CRM estiver ligado.

## Telas

- **Configurações → Plano**: cartão "CRM" — desligado (com "Experimentar 14 dias
  grátis" ou "Ativar CRM"), em teste ("até 23/10 · depois R$ 39 por usuário"),
  ativo ("2 usuários · R$ 78/mês") ou cortesia; botões ligar/desligar e o total
  do mês (plano + CRM).
- **Configurações → Equipe**: a chave por pessoa.
- **CRM não contratado** (`/crm-indisponivel`): para quem pode contratar, botão
  "Experimentar 14 dias grátis" (ou "Ativar"); para os outros, o texto atual.
- **Aviso de fim de teste** no espaço do CRM, nos últimos 3 dias, para dono/admin.
- **Sem acesso pessoal**: quem é da clínica com CRM ligado mas sem a chave vê
  "Peça acesso ao responsável da clínica".

## Testes

- Unitários: situação do CRM, cálculo do valor (plano, teste, pago, cortesia,
  usuários inativos e perfis não elegíveis não contam), descrição.
- Banco: ligar teste uma vez só; desligar/religar; dar/tirar acesso; último
  acesso não sai; `syncBillingValue` só chama o Asaas quando o valor muda (Asaas
  simulado).
- E2E: experimentar → acesso de quem ligou; dar acesso a outra pessoa na Equipe;
  quem não tem acesso não entra no CRM; desligar esconde o CRM.
- Regressão da agenda e dos orçamentos verde.
