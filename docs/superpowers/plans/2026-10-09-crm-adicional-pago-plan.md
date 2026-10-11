# Plano — CRM como adicional pago

Spec: [`docs/superpowers/specs/2026-10-09-crm-adicional-pago-design.md`](../specs/2026-10-09-crm-adicional-pago-design.md)
Branch: `feat/crm-etapa1`

Mesmas regras do plano da etapa 1: um commit por tarefa, lint/typecheck/unit
verdes, regressão E2E verde em toda tarefa que mexe em código existente,
banco só o local.

### 1. Schema ✅
`Plan.crmSeatPriceCents`, `Subscription.crmTrialEndsAt`, `Subscription.billedValueCents`,
`User.crmSeat`. Diff só de acréscimos; SQL conferido (só `ADD COLUMN` com padrão).
`seed-plans.ts` grava o preço por usuário.

### 2. Regras de cobrança (puras) — `crm/billing.ts` ✅
`crmStatus`, `seatsCharged`, `subscriptionValueCents`, `subscriptionDescription`. Testes por tabela.

### 3. Ligar, desligar, acesso e sincronização — `crm/addon.ts` ✅
`startCrmTrial`, `enableCrm`, `disableCrm`, `setCrmSeat`, `syncBillingValue` (Asaas
injetável para teste). Testes contra o banco com Asaas simulado.

### 4. Acesso por pessoa ✅
`requireCrm`/`guardCrmAction` checam `crmSeat`; `AppShell` só mostra o seletor
com acesso; tela "peça acesso". Testes do guard.

### 5. Cobrança existente ✅
`choosePlan` usa o valor total; remover alguém da equipe sincroniza; rotina
diária chama `syncBillingValue`. Regressão verde.

### 6. Telas ✅
Cartão do CRM no Plano; chave na Equipe; botão na tela de não contratado; aviso
de fim de teste. axe sem violações.

### 7. E2E e documentação ✅
Specs do adicional; semeadura dá acesso ao dono; `CONTEXTO.md`, `ROADMAP.md`.
