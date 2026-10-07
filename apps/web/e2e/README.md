# Testes E2E

Dois grupos:

- **publico** (`a11y.spec.ts`): só a landing page. Roda sem banco e sem Clerk.
- **logado** (`regressao/`): agenda e orçamentos de verdade, com login. Precisa
  de banco, do Clerk de desenvolvimento e de uma conta de teste.

A suíte `regressao/` protege o agendamento: toda mudança no CRM tem que deixá-la verde.

## Preparar a máquina (uma vez)

### 1. Banco de desenvolvimento

Use um banco **só para desenvolvimento**, nunca o de produção: a preparação
dos testes grava e apaga dados de teste.

O jeito mais simples no Windows, sem instalar nada, é um projeto gratuito no Supabase:

1. Em https://supabase.com/dashboard, clique em **New project** e chame de `clinicaiq-dev`.
2. Anote a senha do banco que você escolher.
3. Abra o projeto, clique em **Connect** e copie as duas strings de conexão:
   - **Transaction pooler** (porta 6543) → vai em `DATABASE_URL`, com
     `?pgbouncer=true` no final;
   - **Session pooler** (porta 5432) → vai em `DIRECT_URL`.

### 2. Clerk de desenvolvimento

1. No painel do Clerk (https://dashboard.clerk.com), entre na aplicação do
   ClinicaIQ e confira se está na instância **Development**, no seletor do topo.
2. Em **Configure → API keys**, copie a **Publishable key** (`pk_test_…`) e a
   **Secret key** (`sk_test_…`).
3. Em **Users → Create user**, crie a conta de teste com um e-mail que tenha
   `+clerk_test` antes do @ (ex.: `voce+clerk_test@gmail.com`). Se o Clerk
   pedir senha, use qualquer uma: os testes não usam.

### 3. Arquivos de variáveis

Crie `packages/db/.env`:

```
DATABASE_URL="<transaction pooler>?pgbouncer=true"
DIRECT_URL="<session pooler>"
```

Crie `apps/web/.env.local` a partir de `apps/web/.env.example`, com:

- `DATABASE_URL` e `DIRECT_URL`: os mesmos de cima;
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY`: as chaves `pk_test_`/`sk_test_`;
- `ENCRYPTION_MASTER_KEY`: gere uma nova (não use a de produção) com
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Crie `apps/web/.env.test` a partir de `apps/web/.env.test.example`, com o
e-mail da conta de teste.

Nenhum desses arquivos vai para o git.

### 4. Tabelas, planos e navegador

```bash
pnpm db:push
pnpm --filter @clinicaiq/db exec tsx prisma/seed-plans.ts
pnpm --filter @clinicaiq/web exec playwright install chromium
```

## Rodar

```bash
pnpm --filter @clinicaiq/web test:e2e
```

O Playwright sobe o `pnpm dev` sozinho se nada estiver rodando na porta 3000.
O relatório abre com `pnpm --filter @clinicaiq/web exec playwright show-report`.

## O que a preparação faz

`global.setup.ts` roda antes do grupo logado e:

1. confere que está no ambiente de teste: recusa `sk_live_` e e-mail sem `+clerk_test`;
2. cria ou reaproveita a "Clínica de Teste E2E" (cortesia, uma profissional, um
   procedimento e um orçamento enviado para o teste do link público);
3. apaga os agendamentos que execuções anteriores deixaram na profissional de teste;
4. entra com a conta de teste e salva a sessão em `e2e/.auth/` (fora do git).
