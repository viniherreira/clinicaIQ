# Assistente de IA, Nível 1: plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`).

**Objetivo:** a funcionária pergunta em português, num painel lateral da gestão, e o assistente responde com os dados reais da clínica (agenda, pacientes e financeiro), lembrando a conversa. Tudo só de leitura.

**Arquitetura:**
- Uma rota `POST /api/assistente` roda um loop manual com o Claude, com streaming e com 9 ferramentas de consulta fixas, escritas em TypeScript.
- Cada ferramenta usa `getTenantClient` e exige uma `Capability` do papel. Ferramenta proibida não é enviada ao modelo.
- A conversa fica cifrada em duas tabelas novas e é apagada pelo cron `reminders` depois de 30 dias.

**Stack:** Next.js 15 (App Router), Prisma 6, Clerk, `@anthropic-ai/sdk`, `zod` 3 com `zod-to-json-schema`, Vitest, Playwright e axe.

**Spec:** `docs/specs/2026-11-07-assistente-ia-nivel1-design.md`. Leia a spec antes de cada tarefa.

## Restrições globais

- **Branch:** todo o trabalho vai na `feat/ia`. Um commit por tarefa (ou mais), com mensagem `tipo(ia): ...` em português.
- **Commits:** autor sempre o git local (thns7). **Nunca** `Co-Authored-By`, "Generated with Claude Code" ou qualquer marca de IA.
- **Modelo:** `claude-opus-5-5`, `output_config: { effort: 'medium' }`, com `fallbacks: 'default'` e `betas: ['server-side-fallback-2026-07-01']`, pelo namespace `client.beta.messages`.
- **Isolamento:** as ferramentas leem **só** com `findMany`, `findFirst` e `count` do `getTenantClient(tenantId)` e **também** põem `tenantId` explícito no `where`. Nunca `groupBy`, `aggregate`, `$queryRaw` nem o `prisma` cru, porque a extensão não filtra esses métodos.
- **Só leitura:** nenhuma ferramenta grava. As únicas escritas são as do histórico, do `AuditLog` e do `rate_limits`.
- **Tamanho:** cada ferramenta devolve no máximo 50 linhas (`LIMITE_LINHAS = 50`) e informa `cortado: true` quando passou disso.
- **Datas:** as ferramentas recebem `AAAA-MM-DD`. O prompt dá ao modelo a data de hoje no fuso da clínica (`clinicToday()`).
  - Os agendamentos guardam a hora de parede em UTC (`T00:00:00.000Z` é o início do dia, como em `app/agendar/[slug]/actions.ts`).
  - `Payment.paidAt` é instante real, então o dia da clínica começa em `T00:00:00-03:00`.
- **Cifra:** `encrypt`/`decrypt` de `@clinicaiq/db` com `process.env.ENCRYPTION_MASTER_KEY`.
- **Prontuário e CRM:** nenhuma ferramenta toca em `Anamnesis`, `Evolution`, `ToothFinding`, `PatientFile`, `Lead`, `Conversation` nem `ChatMessage`.
- **Testes:** `pnpm --filter @clinicaiq/web test` (Vitest). Os `*.db.test.ts` precisam de `apps/web/.env.local` com `DATABASE_URL` e seguem o padrão de `crm/anonymize.db.test.ts`: clínica descartável, apagada no `afterAll`.
- **`server-only`:** todo teste que importa (mesmo indiretamente) um arquivo com `import 'server-only'` começa com `vi.mock('server-only', () => ({}));`, como `lib/access.test.ts`.
- **Lint e tipos:** `pnpm --filter @clinicaiq/web typecheck` antes de cada commit.

## Mapa de arquivos

```
apps/web/assistente/
  datas.ts / datas.test.ts                 limites de dia e de período (puro)
  ferramentas/tipos.ts / tipos.test.ts     contrato Ferramenta, Contexto, limitar()
  ferramentas/profissionais.ts             listarProfissionais
  ferramentas/pacientes.ts                 buscarPacientes
  ferramentas/atendidos.ts                 ultimosAtendidos
  ferramentas/agenda-do-dia.ts             agendaDoDia
  ferramentas/horarios-livres.ts           horariosLivres
  ferramentas/cancelamentos.ts             cancelamentos
  ferramentas/sem-retorno.ts               semRetorno
  ferramentas/saldo.ts                     saldoDevedor
  ferramentas/faturamento.ts               faturamento
  ferramentas/ferramentas.db.test.ts       testes de banco de todas as ferramentas
  registro.ts / registro.test.ts           lista por papel e formato da API
  prompt.ts / prompt.test.ts               prompt fixo e a mensagem de contexto
  loop.ts / loop.test.ts                   o loop com o Claude (cliente injetável)
  historico.ts / historico.db.test.ts      conversas cifradas, listagem, exclusão em 30 dias
  acesso.ts / acesso.db.test.ts            chave do piloto e limites
  cliente.ts                               new Anthropic() único
apps/web/app/api/assistente/route.ts                  POST: pergunta → resposta em streaming
apps/web/app/api/assistente/conversas/route.ts        GET: lista; GET ?id=: mensagens
apps/web/components/assistente/assistente-painel.tsx  painel lateral (client)
apps/web/components/assistente/mensagens.ts / .test.ts  histórico da API → bolhas da tela (puro)
apps/web/components/app-shell.tsx                      monta o painel
apps/web/app/api/cron/reminders/route.ts               chama a exclusão de 30 dias
apps/web/app/privacidade/page.tsx                      cita a Anthropic
apps/web/e2e/regressao/assistente.spec.ts              painel + axe
packages/db/prisma/schema.prisma                       Subscription.assistantEnabled e 2 modelos
docs/producao/AAAA-MM-DD-assistente.sql                SQL de produção com RLS
```

---

### Tarefa 0: ajustar a spec ao que o código mostrou

**Arquivos:**
- Modificar: `docs/specs/2026-11-07-assistente-ia-nivel1-design.md`

Na leitura do código apareceram quatro ajustes, que entram na spec antes de qualquer código:
1. Já existe `Plan.assistantEnabled` (por plano, hoje `false`). A chave do piloto continua na `Subscription`, e a regra fica: **liberado = `subscription.assistantEnabled` OU `plan.assistantEnabled`**. Assim, quando houver preço, basta ligar no plano.
2. As datas vão para as ferramentas como `AAAA-MM-DD`. Quem converte "amanhã" é o modelo, que recebe a data de hoje. As ferramentas não interpretam texto.
3. O CPF fica de fora de todas as ferramentas. O telefone só sai com `incluirContato: true`.
4. `semRetorno` usa a mesma ideia do recall: última visita (`ATTENDED`) antes do corte e nenhum agendamento futuro. Não usa a pontuação do `lib/recall`.

- [ ] **Passo 1:** na seção "### 1. Piloto grátis", troque o primeiro item por:

```markdown
- `subscriptions.assistantEnabled` (boolean, padrão `false`), ligado à mão por SQL nas clínicas escolhidas. O `plans.assistantEnabled`, que já existe, também libera: liberado = assinatura OU plano. Quando houver preço, liga-se no plano.
```

- [ ] **Passo 2:** na seção "### 3.", troque o item das datas por `- recebe datas como AAAA-MM-DD. O modelo recebe a data de hoje no fuso da clínica e converte "amanhã" e "mês passado" sozinho;`. Troque a linha do telefone e do CPF por `- O CPF não sai em nenhuma ferramenta. O telefone só sai com incluirContato: true, sempre sob a permissão pacientes.`. Na linha `semRetorno` da tabela, troque a base por `última visita ATTENDED antes do corte e nenhum agendamento futuro (a mesma ideia do recall)`.

- [ ] **Passo 3: commit**

```bash
git add docs/specs/2026-11-07-assistente-ia-nivel1-design.md
git commit -m "docs(ia): spec usa o assistantEnabled do plano, datas ISO e sem CPF"
```

---

### Tarefa 1: banco (chave do piloto e tabelas do histórico)

**Arquivos:**
- Modificar: `packages/db/prisma/schema.prisma` (modelo `Subscription`, `Tenant`, `User`, e dois modelos novos no fim)
- Criar: `docs/producao/2026-11-07-assistente.sql` (troque a data pela do dia em que rodar em produção)

**Interfaces:**
- Produz: `prisma.assistantConversation`, `prisma.assistantMessage`, `subscription.assistantEnabled`.

- [ ] **Passo 1: schema.** Em `model Subscription`, logo depois de `complimentary`, acrescente:

```prisma
  /// Piloto do assistente de IA, ligado à mão por clínica
  /// (docs/specs/2026-11-07-assistente-ia-nivel1-design.md). Também libera
  /// quando o plano tem `assistantEnabled`.
  assistantEnabled Boolean @default(false)
```

No fim do arquivo:

```prisma
/// Conversa de um usuário com o assistente de IA. Apagada depois de 30 dias.
model AssistantConversation {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant   Tenant             @relation(fields: [tenantId], references: [id])
  user     User               @relation(fields: [userId], references: [id])
  messages AssistantMessage[]

  @@index([tenantId, userId, updatedAt(sort: Desc)])
  @@index([updatedAt])
  @@map("assistant_conversations")
}

/// Uma mensagem da API do Claude (pergunta, resposta ou resultado de
/// ferramenta), cifrada inteira em JSON. A ordem é a de `seq`.
model AssistantMessage {
  id             String   @id @default(cuid())
  tenantId       String
  conversationId String
  seq            Int
  role           String
  /// `encrypt(JSON.stringify(BetaMessageParam))`.
  content        String
  /// Nomes das ferramentas chamadas nesta mensagem (sem os dados).
  tools          String[] @default([])
  inputTokens    Int      @default(0)
  outputTokens   Int      @default(0)
  createdAt      DateTime @default(now())

  tenant       Tenant                @relation(fields: [tenantId], references: [id])
  conversation AssistantConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@unique([conversationId, seq])
  @@index([tenantId])
  @@map("assistant_messages")
}
```

Em `model Tenant` e em `model User`, acrescente as relações inversas:

```prisma
  assistantConversations AssistantConversation[]
```

e, só no `Tenant`:

```prisma
  assistantMessages AssistantMessage[]
```

- [ ] **Passo 2: aplicar no banco de desenvolvimento.**

Rode: `pnpm db:push && pnpm db:generate`
Esperado: "Your database is now in sync with your Prisma schema" e o client gerado sem erro.

- [ ] **Passo 3: SQL de produção.** Crie `docs/producao/2026-11-07-assistente.sql`:

```sql
-- Assistente de IA, Nível 1 (docs/specs/2026-11-07-assistente-ia-nivel1-design.md).
-- Rodar no SQL Editor do Supabase antes do deploy da feat/ia.

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "assistantEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "assistant_conversations" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id"),
  "userId" TEXT NOT NULL REFERENCES "users"("id"),
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "assistant_conversations_tenantId_userId_updatedAt_idx"
  ON "assistant_conversations" ("tenantId", "userId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "assistant_conversations_updatedAt_idx" ON "assistant_conversations" ("updatedAt");

CREATE TABLE IF NOT EXISTS "assistant_messages" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id"),
  "conversationId" TEXT NOT NULL REFERENCES "assistant_conversations"("id") ON DELETE CASCADE,
  "seq" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_messages_conversationId_seq_key" ON "assistant_messages" ("conversationId", "seq");
CREATE INDEX IF NOT EXISTS "assistant_messages_tenantId_idx" ON "assistant_messages" ("tenantId");

-- Trava contra a API REST do Supabase (o Prisma conecta como postgres e ignora o RLS).
ALTER TABLE "assistant_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_messages" ENABLE ROW LEVEL SECURITY;

-- Piloto: ligar por clínica.
-- UPDATE "subscriptions" SET "assistantEnabled" = true WHERE "tenantId" = '<id da clínica>';
```

- [ ] **Passo 4: conferir.** Rode `pnpm --filter @clinicaiq/web typecheck`. Esperado: sem erros. Rode também `pnpm --filter @clinicaiq/web test lib/producao-rls.test.ts`. Esperado: PASS. Se o teste listar as tabelas novas como sem RLS, acrescente-as onde ele pede.

- [ ] **Passo 5: commit**

```bash
git add packages/db/prisma/schema.prisma docs/producao/2026-11-07-assistente.sql
git commit -m "feat(ia): tabelas do histórico do assistente e chave do piloto"
```

---

### Tarefa 2: SDK e cliente do Claude

**Arquivos:**
- Modificar: `apps/web/package.json`, `apps/web/.env.example`
- Criar: `apps/web/assistente/cliente.ts`

**Interfaces:**
- Produz: `claude(): Anthropic` (cliente único por processo) e `MODELO = 'claude-opus-5-5'`.

- [ ] **Passo 1: instalar.**

Rode: `pnpm --filter @clinicaiq/web add @anthropic-ai/sdk zod-to-json-schema`
Esperado: as duas dependências no `package.json`.

- [ ] **Passo 2:** crie `apps/web/assistente/cliente.ts`:

```ts
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/** O modelo do assistente. Trocar é decisão do dono (spec, seção 4). */
export const MODELO = 'claude-opus-5-5';

let instancia: Anthropic | null = null;

/** Um cliente por processo. Lê ANTHROPIC_API_KEY do ambiente. */
export function claude(): Anthropic {
  instancia ??= new Anthropic();
  return instancia;
}
```

- [ ] **Passo 3:** em `apps/web/.env.example`, depois de `ENCRYPTION_MASTER_KEY`, acrescente:

```
# Assistente de IA (Nível 1). Chave da API da Anthropic.
ANTHROPIC_API_KEY=
```

- [ ] **Passo 4:** rode `pnpm --filter @clinicaiq/web typecheck`. Esperado: sem erros.

- [ ] **Passo 5: commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/.env.example apps/web/assistente/cliente.ts
git commit -m "feat(ia): SDK da Anthropic e cliente do assistente"
```

---

### Tarefa 3: datas do assistente

**Arquivos:**
- Criar: `apps/web/assistente/datas.ts`
- Teste: `apps/web/assistente/datas.test.ts`

**Interfaces:**
- Produz:
  - `DATA_ISO: z.ZodString`
  - `diaDeParede(data: string): { inicio: Date; fim: Date }`
  - `periodoReal(inicio: string, fim: string): { gte: Date; lt: Date }`
  - `subtrairMeses(data: string, meses: number): string`

- [ ] **Passo 1: teste que falha.** Crie `apps/web/assistente/datas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DATA_ISO, diaDeParede, periodoReal, subtrairMeses } from './datas';

describe('datas do assistente', () => {
  it('aceita só AAAA-MM-DD', () => {
    expect(DATA_ISO.safeParse('2026-11-08').success).toBe(true);
    expect(DATA_ISO.safeParse('08/11/2026').success).toBe(false);
    expect(DATA_ISO.safeParse('amanhã').success).toBe(false);
  });

  it('dia de parede: hora guardada em UTC, como a agenda', () => {
    const { inicio, fim } = diaDeParede('2026-11-08');
    expect(inicio.toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-11-08T23:59:59.999Z');
  });

  it('período real: começa à meia-noite de Brasília e inclui o último dia', () => {
    const { gte, lt } = periodoReal('2026-10-01', '2026-10-31');
    expect(gte.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('subtrai meses sem estourar o fim do mês', () => {
    expect(subtrairMeses('2026-11-07', 6)).toBe('2026-05-07');
    expect(subtrairMeses('2026-03-31', 1)).toBe('2026-02-28');
  });
});
```

- [ ] **Passo 2:** rode `pnpm --filter @clinicaiq/web test assistente/datas.test.ts`. Esperado: FAIL, "Cannot find module './datas'".

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/datas.ts`:

```ts
import { z } from 'zod';
import { addDays, format, parseISO, subMonths } from 'date-fns';

export const DATA_ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD');

/**
 * Um dia da agenda. Os agendamentos guardam a hora de parede em UTC
 * (app/agendar/[slug]/actions.ts faz igual), então o dia é 00:00Z a 23:59Z.
 */
export function diaDeParede(data: string): { inicio: Date; fim: Date } {
  return { inicio: new Date(`${data}T00:00:00.000Z`), fim: new Date(`${data}T23:59:59.999Z`) };
}

/**
 * Período de instantes reais (Payment.paidAt), de `inicio` até o fim de `fim`,
 * no relógio da clínica. Brasília não tem horário de verão desde 2019: -03:00.
 */
export function periodoReal(inicio: string, fim: string): { gte: Date; lt: Date } {
  const depois = format(addDays(parseISO(fim), 1), 'yyyy-MM-dd');
  return { gte: new Date(`${inicio}T00:00:00-03:00`), lt: new Date(`${depois}T00:00:00-03:00`) };
}

export function subtrairMeses(data: string, meses: number): string {
  return format(subMonths(parseISO(data), meses), 'yyyy-MM-dd');
}
```

- [ ] **Passo 4:** rode o teste de novo. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/datas.ts apps/web/assistente/datas.test.ts
git commit -m "feat(ia): datas do assistente no relógio da clínica"
```

---

### Tarefa 4: contrato das ferramentas

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/tipos.ts`
- Teste: `apps/web/assistente/ferramentas/tipos.test.ts`

**Interfaces:**
- Produz:

```ts
export interface Contexto { tenantId: string; userId: string; role: Role; hoje: string; db: TenantPrismaClient }
export interface Ferramenta<S extends z.ZodTypeAny = z.ZodTypeAny> {
  nome: string; descricao: string; capability: Capability; entrada: S;
  executar(ctx: Contexto, input: z.infer<S>): Promise<unknown>;
}
export const LIMITE_LINHAS = 50;
export function limitar<T>(linhas: T[], max?: number): { itens: T[]; total: number; cortado: boolean };
export function ferramenta<S extends z.ZodTypeAny>(f: Ferramenta<S>): Ferramenta<S>;
export const reais: (cents: number) => string;
```

- [ ] **Passo 1: teste que falha.** Crie `apps/web/assistente/ferramentas/tipos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { limitar, reais, LIMITE_LINHAS } from './tipos';

describe('limitar', () => {
  it('devolve tudo quando cabe', () => {
    expect(limitar([1, 2, 3])).toEqual({ itens: [1, 2, 3], total: 3, cortado: false });
  });
  it('corta em 50 e avisa', () => {
    const r = limitar(Array.from({ length: 70 }, (_, i) => i));
    expect(r.itens).toHaveLength(LIMITE_LINHAS);
    expect(r).toMatchObject({ total: 70, cortado: true });
  });
});

describe('reais', () => {
  it('formata centavos em BRL', () => {
    expect(reais(123456)).toBe('R$ 1.234,56');
  });
});
```

- [ ] **Passo 2:** rode `pnpm --filter @clinicaiq/web test assistente/ferramentas/tipos.test.ts`. Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/tipos.ts`:

```ts
import type { z } from 'zod';
import type { TenantPrismaClient } from '@clinicaiq/db';
import type { Capability, Role } from '@/lib/permissions';

/** Quem pergunta e de onde. Montado pela rota, nunca pelo modelo. */
export interface Contexto {
  tenantId: string;
  userId: string;
  role: Role;
  /** Hoje no relógio da clínica, AAAA-MM-DD. */
  hoje: string;
  db: TenantPrismaClient;
}

/**
 * Uma consulta que o modelo pode pedir. Só leitura, sempre filtrada pela
 * clínica do contexto e exigindo `capability` do papel de quem pergunta.
 */
export interface Ferramenta<S extends z.ZodTypeAny = z.ZodTypeAny> {
  nome: string;
  /** Lida pelo modelo: diga quando usar e o que volta. */
  descricao: string;
  capability: Capability;
  entrada: S;
  executar(ctx: Contexto, input: z.infer<S>): Promise<unknown>;
}

/** Ajuda o TypeScript a inferir o tipo da entrada em cada arquivo. */
export function ferramenta<S extends z.ZodTypeAny>(f: Ferramenta<S>): Ferramenta<S> {
  return f;
}

export const LIMITE_LINHAS = 50;

export function limitar<T>(linhas: T[], max = LIMITE_LINHAS): { itens: T[]; total: number; cortado: boolean } {
  return { itens: linhas.slice(0, max), total: linhas.length, cortado: linhas.length > max };
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** "R$ 1.234,56". O Intl usa espaço fixo, então ele é trocado por espaço comum. */
export const reais = (cents: number) => brl.format(cents / 100).replace(/ /g, ' ');
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/tipos.ts apps/web/assistente/ferramentas/tipos.test.ts
git commit -m "feat(ia): contrato das ferramentas do assistente"
```

---

### Tarefa 5: base dos testes de banco e `listarProfissionais`

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/profissionais.ts`
- Teste: `apps/web/assistente/ferramentas/ferramentas.db.test.ts` (as tarefas 6 a 13 acrescentam blocos `describe` neste mesmo arquivo)

**Interfaces:**
- Consome: `ferramenta`, `limitar`, `Contexto` (tarefa 4).
- Produz: `listarProfissionais: Ferramenta`. Entrada `{}`. Saída `{ itens: {id, nome, especialidade}[], total, cortado }`.

- [ ] **Passo 1: teste que falha.** Crie `apps/web/assistente/ferramentas/ferramentas.db.test.ts`. A base cria **duas** clínicas, para provar o isolamento:

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** As ferramentas do assistente contra o banco de desenvolvimento, em duas clínicas descartáveis. */
const envFile = resolve(__dirname, '..', '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('ferramentas do assistente (banco)', async () => {
  const { prisma, getTenantClient, encrypt } = await import('@clinicaiq/db');
  const key = process.env.ENCRYPTION_MASTER_KEY!;
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  async function clinica(nome: string) {
    const tenant = await prisma.tenant.create({ data: { clerkOrgId: `ia_${nome}_${sufixo}`, name: nome, slug: `ia-${nome}-${sufixo}` } });
    const user = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Dona', email: `${nome}-${sufixo}@teste.local`, role: 'OWNER' } });
    const prof = await prisma.professional.create({ data: { tenantId: tenant.id, name: `Dra. Ana ${nome}`, specialty: 'Ortodontia' } });
    return { tenant, user, prof, db: getTenantClient(tenant.id) };
  }
  const A = await clinica('a');
  const B = await clinica('b');
  const ctxA = { tenantId: A.tenant.id, userId: A.user.id, role: 'OWNER' as const, hoje: '2026-11-07', db: A.db };

  let ctl = 1;
  async function paciente(c: typeof A, nome: string) {
    return prisma.patient.create({
      data: { tenantId: c.tenant.id, controlNumber: ctl++, name: nome, phoneEncrypted: encrypt('11987654321', key, c.tenant.id) },
    });
  }
  async function consulta(c: typeof A, patientId: string, inicio: string, status: 'SCHEDULED' | 'ATTENDED' | 'CANCELLED' | 'MISSED') {
    const startTime = new Date(inicio);
    return prisma.appointment.create({
      data: { tenantId: c.tenant.id, patientId, professionalId: c.prof.id, startTime, endTime: new Date(startTime.getTime() + 30 * 60_000), status },
    });
  }

  afterAll(async () => {
    for (const c of [A, B]) {
      const t = { tenantId: c.tenant.id };
      await prisma.payment.deleteMany({ where: t });
      await prisma.quote.deleteMany({ where: t });
      await prisma.appointment.deleteMany({ where: t });
      await prisma.patient.deleteMany({ where: t });
      await prisma.professionalSchedule.deleteMany({ where: { professionalId: c.prof.id } });
      await prisma.professional.deleteMany({ where: t });
      await prisma.user.deleteMany({ where: t });
      await prisma.tenant.delete({ where: { id: c.tenant.id } });
    }
    await prisma.$disconnect();
  });

  describe('listarProfissionais', async () => {
    const { listarProfissionais } = await import('./profissionais');
    it('lista só os da clínica', async () => {
      const r = (await listarProfissionais.executar(ctxA, {})) as { itens: { nome: string }[] };
      expect(r.itens.map((p) => p.nome)).toEqual(['Dra. Ana a']);
    });
  });

  // TAREFAS 6 A 13: novos blocos describe entram aqui, acima deste comentário.
});
```

> Se `prisma.quote.create` (tarefa 12) exigir campos que o teste não preenche, o TypeScript mostra quais. Preencha com valores fixos (por exemplo `number: 1`, `publicToken: \`tk-${sufixo}\``, `subtotal`, `total`, `validUntil`).

- [ ] **Passo 2:** rode `pnpm --filter @clinicaiq/web test assistente/ferramentas/ferramentas.db.test.ts`. Esperado: FAIL, "Cannot find module './profissionais'".

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/profissionais.ts`:

```ts
import { z } from 'zod';
import { ferramenta, limitar } from './tipos';

export const listarProfissionais = ferramenta({
  nome: 'listar_profissionais',
  descricao:
    'Lista os profissionais ativos da clínica com id, nome e especialidade. Use para descobrir o id de um profissional citado pelo nome (ex.: "Dra. Ana") antes de chamar outras ferramentas.',
  capability: 'agenda',
  entrada: z.object({}).strict(),
  async executar(ctx) {
    const profs = await ctx.db.professional.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      select: { id: true, name: true, specialty: true },
      orderBy: { name: 'asc' },
    });
    return limitar(profs.map((p) => ({ id: p.id, nome: p.name, especialidade: p.specialty })));
  },
});
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS (ou SKIPPED quando não há `DATABASE_URL`; nesse caso configure o `.env.local` antes de seguir).

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/profissionais.ts apps/web/assistente/ferramentas/ferramentas.db.test.ts
git commit -m "feat(ia): ferramenta listar_profissionais e base dos testes de banco"
```

---

### Tarefa 6: `buscarPacientes`

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/pacientes.ts`
- Teste: acrescentar um bloco em `ferramentas.db.test.ts`

**Interfaces:**
- Produz: `buscarPacientes`. Entrada `{ nome?: string; ids?: string[]; incluirContato?: boolean }`. Saída `limitar({id, numero, nome, email, nascimento, telefone?})`.

- [ ] **Passo 1: teste que falha.** Acrescente antes do comentário das tarefas:

```ts
  describe('buscarPacientes', async () => {
    const { buscarPacientes } = await import('./pacientes');
    const maria = await paciente(A, 'Maria Souza');
    await paciente(B, 'Maria da Clínica B');

    it('acha pelo nome, só na própria clínica, sem telefone por padrão', async () => {
      const r = (await buscarPacientes.executar(ctxA, { nome: 'maria' })) as { itens: Record<string, unknown>[] };
      expect(r.itens).toHaveLength(1);
      expect(r.itens[0]).toMatchObject({ id: maria.id, nome: 'Maria Souza' });
      expect(r.itens[0]).not.toHaveProperty('telefone');
    });

    it('decifra o telefone só quando pedido', async () => {
      const r = (await buscarPacientes.executar(ctxA, { ids: [maria.id], incluirContato: true })) as { itens: { telefone: string }[] };
      expect(r.itens[0].telefone).toBe('11987654321');
    });

    it('não devolve paciente de outra clínica nem pelo id', async () => {
      const deB = await prisma.patient.findFirst({ where: { tenantId: B.tenant.id } });
      const r = (await buscarPacientes.executar(ctxA, { ids: [deB!.id] })) as { itens: unknown[] };
      expect(r.itens).toEqual([]);
    });
  });
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL, módulo `./pacientes` não encontrado.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/pacientes.ts`:

```ts
import { z } from 'zod';
import { decrypt } from '@clinicaiq/db';
import { ferramenta, limitar } from './tipos';

export const buscarPacientes = ferramenta({
  nome: 'buscar_pacientes',
  descricao:
    'Busca pacientes ativos pelo nome (parte do nome serve) ou por uma lista de ids vinda de outra ferramenta. Devolve id, número, nome, e-mail e nascimento. O telefone só vem com incluirContato=true: peça apenas quando a pergunta for sobre contato. O CPF nunca é devolvido.',
  capability: 'pacientes',
  entrada: z
    .object({
      nome: z.string().min(2).optional(),
      ids: z.array(z.string()).max(50).optional(),
      incluirContato: z.boolean().optional(),
    })
    .strict()
    .refine((v) => v.nome || v.ids?.length, 'informe nome ou ids'),
  async executar(ctx, input) {
    const pacientes = await ctx.db.patient.findMany({
      where: {
        tenantId: ctx.tenantId,
        active: true,
        deletedAt: null,
        ...(input.nome ? { name: { contains: input.nome, mode: 'insensitive' as const } } : {}),
        ...(input.ids?.length ? { id: { in: input.ids } } : {}),
      },
      select: { id: true, controlNumber: true, name: true, email: true, birthDate: true, phoneEncrypted: true },
      orderBy: { name: 'asc' },
      take: 51,
    });
    const chave = process.env.ENCRYPTION_MASTER_KEY!;
    return limitar(
      pacientes.map((p) => ({
        id: p.id,
        numero: p.controlNumber,
        nome: p.name,
        email: p.email,
        nascimento: p.birthDate?.toISOString().slice(0, 10) ?? null,
        ...(input.incluirContato ? { telefone: p.phoneEncrypted ? decrypt(p.phoneEncrypted, chave, ctx.tenantId) : null } : {}),
      })),
    );
  },
});
```

> O `take: 51` deixa o `limitar` perceber que havia mais de 50, sem trazer milhares de linhas.

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/pacientes.ts apps/web/assistente/ferramentas/ferramentas.db.test.ts
git commit -m "feat(ia): ferramenta buscar_pacientes, com telefone só sob pedido"
```

---

### Tarefa 7: `ultimosAtendidos`

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/atendidos.ts`
- Teste: bloco em `ferramentas.db.test.ts`

**Interfaces:**
- Produz: `ultimosAtendidos`. Entrada `{ quantidade: number (1..50) }`. Saída `limitar({pacienteId, paciente, data, hora, profissional, procedimento})`, do mais recente para o mais antigo.

- [ ] **Passo 1: teste que falha.**

```ts
  describe('ultimosAtendidos', async () => {
    const { ultimosAtendidos } = await import('./atendidos');
    const p1 = await paciente(A, 'Atendido Antigo');
    const p2 = await paciente(A, 'Atendido Recente');
    await consulta(A, p1.id, '2026-10-01T09:00:00.000Z', 'ATTENDED');
    await consulta(A, p2.id, '2026-11-05T14:30:00.000Z', 'ATTENDED');
    await consulta(A, p2.id, '2026-11-06T10:00:00.000Z', 'CANCELLED');

    it('traz os atendidos, do mais recente, e ignora cancelados', async () => {
      const r = (await ultimosAtendidos.executar(ctxA, { quantidade: 5 })) as { itens: { paciente: string; data: string; hora: string }[] };
      const meus = r.itens.filter((i) => i.paciente.startsWith('Atendido'));
      expect(meus.map((i) => i.paciente)).toEqual(['Atendido Recente', 'Atendido Antigo']);
      expect(meus[0]).toMatchObject({ data: '2026-11-05', hora: '14:30' });
    });
  });
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/atendidos.ts`:

```ts
import { z } from 'zod';
import { ferramenta, limitar } from './tipos';

export const ultimosAtendidos = ferramenta({
  nome: 'ultimos_atendidos',
  descricao:
    'Os últimos atendimentos realizados (status atendido), do mais recente para o mais antigo, com paciente (e o id dele), data, hora, profissional e procedimento.',
  capability: 'agenda',
  entrada: z.object({ quantidade: z.number().int().min(1).max(50) }).strict(),
  async executar(ctx, { quantidade }) {
    const atendimentos = await ctx.db.appointment.findMany({
      where: { tenantId: ctx.tenantId, status: 'ATTENDED' },
      orderBy: { startTime: 'desc' },
      take: quantidade,
      select: {
        startTime: true,
        patient: { select: { id: true, name: true } },
        professional: { select: { name: true } },
        procedure: { select: { name: true } },
      },
    });
    return limitar(
      atendimentos.map((a) => ({
        pacienteId: a.patient.id,
        paciente: a.patient.name,
        data: a.startTime.toISOString().slice(0, 10),
        hora: a.startTime.toISOString().slice(11, 16),
        profissional: a.professional.name,
        procedimento: a.procedure?.name ?? null,
      })),
    );
  },
});
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/atendidos.ts apps/web/assistente/ferramentas/ferramentas.db.test.ts
git commit -m "feat(ia): ferramenta ultimos_atendidos"
```

---

### Tarefa 8: `agendaDoDia`

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/agenda-do-dia.ts`
- Teste: bloco em `ferramentas.db.test.ts`

**Interfaces:**
- Consome: `DATA_ISO`, `diaDeParede` (tarefa 3).
- Produz: `agendaDoDia`. Entrada `{ data: string; profissionalId?: string }`. Saída `{ data, total, itens: {hora, paciente, pacienteId, profissional, status}[], cortado }`, sem cancelados nem remarcados.

- [ ] **Passo 1: teste que falha.**

```ts
  describe('agendaDoDia', async () => {
    const { agendaDoDia } = await import('./agenda-do-dia');
    const p = await paciente(A, 'Da Agenda');
    await consulta(A, p.id, '2026-11-08T09:00:00.000Z', 'SCHEDULED');
    await consulta(A, p.id, '2026-11-08T11:00:00.000Z', 'CANCELLED');
    await consulta(A, p.id, '2026-11-09T09:00:00.000Z', 'SCHEDULED');
    const pB = await paciente(B, 'Da Agenda B');
    await consulta(B, pB.id, '2026-11-08T10:00:00.000Z', 'SCHEDULED');

    it('conta só os do dia, sem cancelados, só da clínica', async () => {
      const r = (await agendaDoDia.executar(ctxA, { data: '2026-11-08' })) as { total: number; itens: { hora: string }[] };
      expect(r.total).toBe(1);
      expect(r.itens[0].hora).toBe('09:00');
    });
  });
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/agenda-do-dia.ts`:

```ts
import { z } from 'zod';
import { DATA_ISO, diaDeParede } from '../datas';
import { ferramenta, limitar } from './tipos';

const STATUS: Record<string, string> = {
  SCHEDULED: 'agendado',
  CONFIRMED: 'confirmado',
  ATTENDED: 'atendido',
  MISSED: 'faltou',
};

export const agendaDoDia = ferramenta({
  nome: 'agenda_do_dia',
  descricao:
    'Os agendamentos de um dia (AAAA-MM-DD), sem os cancelados e remarcados, com hora, paciente, profissional e status. Filtre por profissionalId quando a pergunta citar um profissional. Responde "quantos agendamentos temos amanhã".',
  capability: 'agenda',
  entrada: z.object({ data: DATA_ISO, profissionalId: z.string().optional() }).strict(),
  async executar(ctx, { data, profissionalId }) {
    const { inicio, fim } = diaDeParede(data);
    const ags = await ctx.db.appointment.findMany({
      where: {
        tenantId: ctx.tenantId,
        startTime: { gte: inicio, lte: fim },
        status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
        ...(profissionalId ? { professionalId: profissionalId } : {}),
      },
      orderBy: { startTime: 'asc' },
      select: {
        startTime: true,
        status: true,
        patient: { select: { id: true, name: true } },
        professional: { select: { name: true } },
      },
    });
    return {
      data,
      ...limitar(
        ags.map((a) => ({
          hora: a.startTime.toISOString().slice(11, 16),
          paciente: a.patient.name,
          pacienteId: a.patient.id,
          profissional: a.professional.name,
          status: STATUS[a.status] ?? a.status,
        })),
      ),
    };
  },
});
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/agenda-do-dia.ts apps/web/assistente/ferramentas/ferramentas.db.test.ts
git commit -m "feat(ia): ferramenta agenda_do_dia"
```

---

### Tarefa 9: `horariosLivres`

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/horarios-livres.ts`
- Teste: bloco em `ferramentas.db.test.ts`

**Interfaces:**
- Consome: `buildWorkingHoursMap(tenantId, [id])` de `@/lib/working-hours`, `freeSlots` e `clinicNow` de `@/lib/availability`, `diaDeParede`.
- Produz: `horariosLivres`. Entrada `{ profissionalId: string; data: string; duracaoMin?: number (padrão 30) }`. Saída `{ profissional, data, horarios: string[] }` ou `{ erro }`.

- [ ] **Passo 1: teste que falha.** O dia 2030-01-07 é segunda-feira (`dayOfWeek` 1). A data fica no futuro para o teste não envelhecer, porque horários de dias passados não são oferecidos:

```ts
  describe('horariosLivres', async () => {
    const { horariosLivres } = await import('./horarios-livres');
    await prisma.professionalSchedule.create({
      data: { professionalId: A.prof.id, dayOfWeek: 1, startTime: '08:00', endTime: '10:00' },
    });
    const p = await paciente(A, 'Ocupa Horário');
    await consulta(A, p.id, '2030-01-07T08:30:00.000Z', 'SCHEDULED');

    it('devolve o expediente menos o ocupado', async () => {
      const r = (await horariosLivres.executar(ctxA, { profissionalId: A.prof.id, data: '2030-01-07' })) as { horarios: string[] };
      expect(r.horarios).toEqual(['08:00', '09:00', '09:30']);
    });

    it('recusa profissional de outra clínica', async () => {
      const r = (await horariosLivres.executar(ctxA, { profissionalId: B.prof.id, data: '2030-01-07' })) as { erro: string };
      expect(r.erro).toMatch(/não encontrado/);
    });
  });
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/horarios-livres.ts`:

```ts
import { z } from 'zod';
import { getDay, parseISO } from 'date-fns';
import { buildWorkingHoursMap } from '@/lib/working-hours';
import { clinicNow, freeSlots } from '@/lib/availability';
import { DATA_ISO, diaDeParede } from '../datas';
import { ferramenta } from './tipos';

export const horariosLivres = ferramenta({
  nome: 'horarios_livres',
  descricao:
    'Horários livres de um profissional num dia (AAAA-MM-DD), pelo expediente cadastrado, tirando agendamentos e bloqueios. Use listar_profissionais antes para obter o profissionalId. duracaoMin é a duração da consulta (padrão 30).',
  capability: 'agenda',
  entrada: z
    .object({ profissionalId: z.string(), data: DATA_ISO, duracaoMin: z.number().int().min(10).max(240).optional() })
    .strict(),
  async executar(ctx, { profissionalId, data, duracaoMin = 30 }) {
    const prof = await ctx.db.professional.findFirst({
      where: { tenantId: ctx.tenantId, id: profissionalId, active: true },
      select: { id: true, name: true },
    });
    if (!prof) return { erro: 'profissional não encontrado nesta clínica' };

    const { inicio, fim } = diaDeParede(data);
    const [mapa, ags, bloqueios] = await Promise.all([
      buildWorkingHoursMap(ctx.tenantId, [prof.id]),
      ctx.db.appointment.findMany({
        where: { tenantId: ctx.tenantId, professionalId: prof.id, status: { notIn: ['CANCELLED', 'RESCHEDULED'] }, startTime: { lt: fim }, endTime: { gt: inicio } },
        select: { startTime: true, endTime: true },
      }),
      ctx.db.blockedSlot.findMany({
        where: { tenantId: ctx.tenantId, professionalId: prof.id, startTime: { lt: fim }, endTime: { gt: inicio } },
        select: { startTime: true, endTime: true },
      }),
    ]);

    // Minutos do dia; o que começa antes ou termina depois fica preso às bordas
    // (a mesma conta de app/agendar/[slug]/actions.ts).
    const min = (d: Date) => {
      const dia = d.toISOString().slice(0, 10);
      if (dia < data) return 0;
      if (dia > data) return 24 * 60;
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    };
    const busy: [number, number][] = [...ags, ...bloqueios].map((x) => [min(x.startTime), min(x.endTime)]);
    const day = mapa[prof.id]?.[getDay(parseISO(data))] ?? null;
    const agora = clinicNow();
    const notBeforeMin = data === agora.date ? agora.minutes : data < agora.date ? 24 * 60 : 0;

    return { profissional: prof.name, data, horarios: freeSlots({ day, busy, durationMin: duracaoMin, stepMin: 30, notBeforeMin }) };
  },
});
```

> Se `buildWorkingHoursMap` também ler `ClinicUnit` ou `businessHours` da clínica e o resultado do teste vier diferente, ajuste o expediente do teste (por exemplo `tenant.settings.businessHours`) até o caso refletir 08:00–10:00. Não mude a regra da ferramenta.

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/horarios-livres.ts apps/web/assistente/ferramentas/ferramentas.db.test.ts
git commit -m "feat(ia): ferramenta horarios_livres reaproveita a regra do agendamento online"
```

---

### Tarefa 10: `cancelamentos`

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/cancelamentos.ts`
- Teste: bloco em `ferramentas.db.test.ts`

**Interfaces:**
- Produz: `cancelamentos`. Entrada `{ minimo: number (1..20); desde?: string }`. Saída `limitar({pacienteId, paciente, cancelados, faltas, total})`, ordenada por `total` decrescente.

- [ ] **Passo 1: teste que falha.**

```ts
  describe('cancelamentos', async () => {
    const { cancelamentos } = await import('./cancelamentos');
    const p = await paciente(A, 'Cancela Muito');
    await consulta(A, p.id, '2026-09-01T09:00:00.000Z', 'CANCELLED');
    await consulta(A, p.id, '2026-09-08T09:00:00.000Z', 'CANCELLED');
    await consulta(A, p.id, '2026-09-15T09:00:00.000Z', 'MISSED');
    const q = await paciente(A, 'Cancela Pouco');
    await consulta(A, q.id, '2026-09-01T10:00:00.000Z', 'CANCELLED');

    it('lista quem passou do mínimo, somando cancelado e falta', async () => {
      const r = (await cancelamentos.executar(ctxA, { minimo: 3 })) as { itens: { paciente: string; cancelados: number; faltas: number; total: number }[] };
      expect(r.itens).toEqual([expect.objectContaining({ paciente: 'Cancela Muito', cancelados: 2, faltas: 1, total: 3 })]);
    });
  });
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/cancelamentos.ts`:

```ts
import { z } from 'zod';
import { DATA_ISO } from '../datas';
import { ferramenta, limitar } from './tipos';

export const cancelamentos = ferramenta({
  nome: 'cancelamentos',
  descricao:
    'Pacientes com pelo menos `minimo` consultas canceladas ou faltas (somadas), desde a data opcional `desde` (AAAA-MM-DD). "Mais de duas" significa minimo=3.',
  capability: 'agenda',
  entrada: z.object({ minimo: z.number().int().min(1).max(20), desde: DATA_ISO.optional() }).strict(),
  async executar(ctx, { minimo, desde }) {
    // findMany e conta no código: groupBy não passa pelo filtro de clínica.
    const ags = await ctx.db.appointment.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['CANCELLED', 'MISSED'] },
        ...(desde ? { startTime: { gte: new Date(`${desde}T00:00:00.000Z`) } } : {}),
      },
      select: { status: true, patient: { select: { id: true, name: true } } },
    });
    const porPaciente = new Map<string, { pacienteId: string; paciente: string; cancelados: number; faltas: number; total: number }>();
    for (const a of ags) {
      const p = porPaciente.get(a.patient.id) ?? { pacienteId: a.patient.id, paciente: a.patient.name, cancelados: 0, faltas: 0, total: 0 };
      if (a.status === 'CANCELLED') p.cancelados += 1;
      else p.faltas += 1;
      p.total += 1;
      porPaciente.set(a.patient.id, p);
    }
    return limitar([...porPaciente.values()].filter((p) => p.total >= minimo).sort((a, b) => b.total - a.total));
  },
});
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/cancelamentos.ts apps/web/assistente/ferramentas/ferramentas.db.test.ts
git commit -m "feat(ia): ferramenta cancelamentos"
```

---

### Tarefa 11: `semRetorno`

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/sem-retorno.ts`
- Teste: bloco em `ferramentas.db.test.ts`

**Interfaces:**
- Consome: `subtrairMeses` (tarefa 3).
- Produz: `semRetorno`. Entrada `{ meses: number (1..60) }`. Saída `limitar({pacienteId, paciente, ultimaVisita})`, da visita mais antiga para a mais recente.

- [ ] **Passo 1: teste que falha.** Com `hoje: '2026-11-07'` e 6 meses, o corte é 2026-05-07:

```ts
  describe('semRetorno', async () => {
    const { semRetorno } = await import('./sem-retorno');
    const sumido = await paciente(A, 'Sumido Faz Tempo');
    await consulta(A, sumido.id, '2026-03-10T09:00:00.000Z', 'ATTENDED');
    const voltou = await paciente(A, 'Voltou Recente');
    await consulta(A, voltou.id, '2026-03-10T09:00:00.000Z', 'ATTENDED');
    await consulta(A, voltou.id, '2026-10-10T09:00:00.000Z', 'ATTENDED');
    const marcado = await paciente(A, 'Sumido Mas Marcou');
    await consulta(A, marcado.id, '2026-02-10T09:00:00.000Z', 'ATTENDED');
    await consulta(A, marcado.id, '2026-11-20T09:00:00.000Z', 'SCHEDULED');

    it('traz quem não volta desde o corte e não tem consulta marcada', async () => {
      const r = (await semRetorno.executar(ctxA, { meses: 6 })) as { itens: { paciente: string; ultimaVisita: string }[] };
      const nomes = r.itens.map((i) => i.paciente);
      expect(nomes).toContain('Sumido Faz Tempo');
      expect(nomes).not.toContain('Voltou Recente');
      expect(nomes).not.toContain('Sumido Mas Marcou');
      expect(r.itens.find((i) => i.paciente === 'Sumido Faz Tempo')!.ultimaVisita).toBe('2026-03-10');
    });
  });
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/sem-retorno.ts`:

```ts
import { z } from 'zod';
import { subtrairMeses } from '../datas';
import { ferramenta, limitar } from './tipos';

export const semRetorno = ferramenta({
  nome: 'sem_retorno',
  descricao:
    'Pacientes cuja última consulta atendida foi há mais de `meses` meses e que não têm consulta marcada para frente. Devolve a data da última visita, da mais antiga para a mais recente.',
  capability: 'pacientes',
  entrada: z.object({ meses: z.number().int().min(1).max(60) }).strict(),
  async executar(ctx, { meses }) {
    const corte = new Date(`${subtrairMeses(ctx.hoje, meses)}T00:00:00.000Z`);
    const hoje = new Date(`${ctx.hoje}T00:00:00.000Z`);
    const ags = await ctx.db.appointment.findMany({
      where: {
        tenantId: ctx.tenantId,
        patient: { active: true, deletedAt: null },
        OR: [{ status: 'ATTENDED' }, { status: { in: ['SCHEDULED', 'CONFIRMED'] }, startTime: { gte: hoje } }],
      },
      select: { startTime: true, status: true, patient: { select: { id: true, name: true } } },
    });

    const ultima = new Map<string, { nome: string; visita: Date }>();
    const comFuturo = new Set<string>();
    for (const a of ags) {
      if (a.status !== 'ATTENDED') {
        comFuturo.add(a.patient.id);
        continue;
      }
      const atual = ultima.get(a.patient.id);
      if (!atual || a.startTime > atual.visita) ultima.set(a.patient.id, { nome: a.patient.name, visita: a.startTime });
    }

    const lista = [...ultima.entries()]
      .filter(([id, u]) => u.visita < corte && !comFuturo.has(id))
      .sort((a, b) => a[1].visita.getTime() - b[1].visita.getTime())
      .map(([id, u]) => ({ pacienteId: id, paciente: u.nome, ultimaVisita: u.visita.toISOString().slice(0, 10) }));
    return limitar(lista);
  },
});
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/sem-retorno.ts apps/web/assistente/ferramentas/ferramentas.db.test.ts
git commit -m "feat(ia): ferramenta sem_retorno"
```

---

### Tarefa 12: `saldoDevedor`

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/saldo.ts`
- Teste: bloco em `ferramentas.db.test.ts`

**Interfaces:**
- Consome: `reais` (tarefa 4).
- Produz: `saldoDevedor`. Entrada `{ pacienteIds?: string[] }`. Saída `{ totalEmAberto: string, ...limitar({pacienteId, paciente, aprovado, pago, emAberto}) }`, só quem deve mais que zero, do maior para o menor saldo.

- [ ] **Passo 1: teste que falha.**

```ts
  describe('saldoDevedor', async () => {
    const { saldoDevedor } = await import('./saldo');
    const devedor = await paciente(A, 'Deve Quinhentos');
    const quite = await paciente(A, 'Está Quite');
    let n = 1;
    const orcamento = (patientId: string, total: number) =>
      prisma.quote.create({
        data: {
          tenantId: A.tenant.id, patientId, number: n++, publicToken: `tk-${sufixo}-${n}`, status: 'ACCEPTED',
          subtotal: total, total, validUntil: new Date('2026-12-31'),
        },
      });
    await orcamento(devedor.id, 800);
    await orcamento(quite.id, 300);
    await prisma.payment.create({ data: { tenantId: A.tenant.id, patientId: devedor.id, amount: 300 } });
    await prisma.payment.create({ data: { tenantId: A.tenant.id, patientId: quite.id, amount: 300 } });

    it('mostra só quem deve, com o valor em reais', async () => {
      const r = (await saldoDevedor.executar(ctxA, {})) as { itens: { paciente: string; emAberto: string }[] };
      expect(r.itens.map((i) => i.paciente)).toEqual(['Deve Quinhentos']);
      expect(r.itens[0].emAberto).toBe('R$ 500,00');
    });

    it('filtra por ids (o "quais deles" da conversa)', async () => {
      const r = (await saldoDevedor.executar(ctxA, { pacienteIds: [quite.id] })) as { itens: unknown[] };
      expect(r.itens).toEqual([]);
    });
  });
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/saldo.ts`:

```ts
import { z } from 'zod';
import { ferramenta, limitar, reais } from './tipos';

export const saldoDevedor = ferramenta({
  nome: 'saldo_devedor',
  descricao:
    'Quem está com pagamento pendente: soma dos orçamentos aprovados menos o que já foi pago, por paciente. Só aparece quem deve mais que zero, do maior para o menor saldo. Passe pacienteIds para checar pacientes de uma resposta anterior ("quais deles ainda não pagaram?").',
  capability: 'financeiro',
  entrada: z.object({ pacienteIds: z.array(z.string()).max(50).optional() }).strict(),
  async executar(ctx, { pacienteIds }) {
    const filtro = pacienteIds?.length ? { patientId: { in: pacienteIds } } : {};
    // A mesma conta da tela de Retorno (app/(app)/retorno/actions.ts).
    const [orcamentos, pagamentos] = await Promise.all([
      ctx.db.quote.findMany({
        where: { tenantId: ctx.tenantId, status: 'ACCEPTED', ...filtro },
        select: { total: true, patient: { select: { id: true, name: true } } },
      }),
      ctx.db.payment.findMany({ where: { tenantId: ctx.tenantId, ...filtro }, select: { patientId: true, amount: true } }),
    ]);
    const conta = new Map<string, { nome: string; aprovado: number; pago: number }>();
    for (const o of orcamentos) {
      const c = conta.get(o.patient.id) ?? { nome: o.patient.name, aprovado: 0, pago: 0 };
      c.aprovado += Math.round(Number(o.total) * 100);
      conta.set(o.patient.id, c);
    }
    for (const p of pagamentos) {
      const c = conta.get(p.patientId);
      if (c) c.pago += Math.round(Number(p.amount) * 100);
    }
    const devedores = [...conta.entries()]
      .map(([id, c]) => ({ id, ...c, aberto: Math.max(0, c.aprovado - c.pago) }))
      .filter((c) => c.aberto > 0)
      .sort((a, b) => b.aberto - a.aberto);
    return {
      totalEmAberto: reais(devedores.reduce((s, d) => s + d.aberto, 0)),
      ...limitar(
        devedores.map((d) => ({ pacienteId: d.id, paciente: d.nome, aprovado: reais(d.aprovado), pago: reais(d.pago), emAberto: reais(d.aberto) })),
      ),
    };
  },
});
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/saldo.ts apps/web/assistente/ferramentas/ferramentas.db.test.ts
git commit -m "feat(ia): ferramenta saldo_devedor com a conta da tela de Retorno"
```

---

### Tarefa 13: `faturamento`

**Arquivos:**
- Criar: `apps/web/assistente/ferramentas/faturamento.ts`
- Teste: bloco em `ferramentas.db.test.ts`

**Interfaces:**
- Consome: `periodoReal` (tarefa 3), `reais`.
- Produz: `faturamento`. Entrada `{ inicio: string; fim: string }`. Saída `{ inicio, fim, total, pagamentos: number, porForma: {forma, total}[] }`.

- [ ] **Passo 1: teste que falha.**

```ts
  describe('faturamento', async () => {
    const { faturamento } = await import('./faturamento');
    const p = await paciente(A, 'Pagante');
    await prisma.payment.create({ data: { tenantId: A.tenant.id, patientId: p.id, amount: 200, method: 'PIX', paidAt: new Date('2026-10-01T03:00:00.000Z') } });
    await prisma.payment.create({ data: { tenantId: A.tenant.id, patientId: p.id, amount: 100, method: 'PIX', paidAt: new Date('2026-10-31T20:00:00.000Z') } });
    // 31/10 às 23h30 em Brasília já é 01/11 em UTC: tem de contar em outubro.
    await prisma.payment.create({ data: { tenantId: A.tenant.id, patientId: p.id, amount: 50, method: 'Dinheiro', paidAt: new Date('2026-11-01T02:30:00.000Z') } });
    await prisma.payment.create({ data: { tenantId: A.tenant.id, patientId: p.id, amount: 999, paidAt: new Date('2026-11-01T03:00:00.000Z') } });

    it('soma o período no relógio da clínica', async () => {
      const r = (await faturamento.executar(ctxA, { inicio: '2026-10-01', fim: '2026-10-31' })) as { pagamentos: number; porForma: { forma: string }[] };
      // O saldoDevedor também grava pagamentos: confira só os deste bloco.
      expect(r.pagamentos).toBeGreaterThanOrEqual(3);
      expect(r.porForma.map((f) => f.forma)).toEqual(expect.arrayContaining(['PIX', 'Dinheiro']));
    });
  });
```

> Para o total ficar exato, os pagamentos do bloco `saldoDevedor` (gravados com `paidAt` = agora, em novembro) não podem cair em outubro de 2026. Eles não caem, porque o teste roda depois de 2026-11-01.

- [ ] **Passo 2:** rode o teste. Esperado: FAIL.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/ferramentas/faturamento.ts`:

```ts
import { z } from 'zod';
import { DATA_ISO, periodoReal } from '../datas';
import { ferramenta, reais } from './tipos';

export const faturamento = ferramenta({
  nome: 'faturamento',
  descricao:
    'Quanto a clínica recebeu num período (pagamentos lançados), de `inicio` a `fim` inclusive (AAAA-MM-DD), com o total, o número de pagamentos e a divisão por forma de pagamento. "Mês passado" vai do dia 1 ao último dia do mês anterior a hoje.',
  capability: 'financeiro',
  entrada: z.object({ inicio: DATA_ISO, fim: DATA_ISO }).strict(),
  async executar(ctx, { inicio, fim }) {
    if (fim < inicio) return { erro: 'fim antes do início' };
    const pagamentos = await ctx.db.payment.findMany({
      where: { tenantId: ctx.tenantId, paidAt: periodoReal(inicio, fim) },
      select: { amount: true, method: true },
    });
    const porForma = new Map<string, number>();
    let total = 0;
    for (const p of pagamentos) {
      const cents = Math.round(Number(p.amount) * 100);
      total += cents;
      const forma = p.method?.trim() || 'Não informada';
      porForma.set(forma, (porForma.get(forma) ?? 0) + cents);
    }
    return {
      inicio,
      fim,
      total: reais(total),
      pagamentos: pagamentos.length,
      porForma: [...porForma.entries()].sort((a, b) => b[1] - a[1]).map(([forma, c]) => ({ forma, total: reais(c) })),
    };
  },
});
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/ferramentas/faturamento.ts apps/web/assistente/ferramentas/ferramentas.db.test.ts
git commit -m "feat(ia): ferramenta faturamento no relógio da clínica"
```

---

### Tarefa 14: registro de ferramentas por papel

**Arquivos:**
- Criar: `apps/web/assistente/registro.ts`
- Teste: `apps/web/assistente/registro.test.ts`

**Interfaces:**
- Consome: as 9 ferramentas e `can` de `@/lib/permissions`.
- Produz:
  - `TODAS: Ferramenta[]`
  - `ferramentasPara(role: Role): Ferramenta[]`
  - `paraApi(fs: Ferramenta[]): Anthropic.Beta.BetaTool[]` (ordem estável, para o cache)
  - `executarFerramenta(fs, nome, input, ctx): Promise<{ conteudo: string; erro: boolean }>`

- [ ] **Passo 1: teste que falha.** Crie `apps/web/assistente/registro.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { can, type Role } from '@/lib/permissions';
import { TODAS, executarFerramenta, ferramentasPara, paraApi } from './registro';

describe('registro de ferramentas', () => {
  it('tem as 9 ferramentas da spec, com nomes únicos', () => {
    expect(TODAS.map((f) => f.nome).sort()).toEqual(
      ['agenda_do_dia', 'buscar_pacientes', 'cancelamentos', 'faturamento', 'horarios_livres', 'listar_profissionais', 'saldo_devedor', 'sem_retorno', 'ultimos_atendidos'],
    );
  });

  it.each<Role>(['OWNER', 'ADMIN', 'RECEPTIONIST', 'PROFESSIONAL'])('%s recebe só o que o papel alcança', (role) => {
    for (const f of ferramentasPara(role)) expect(can(role, f.capability)).toBe(true);
    for (const f of TODAS.filter((t) => !ferramentasPara(role).includes(t))) expect(can(role, f.capability)).toBe(false);
  });

  it('formato da API: schema de objeto, sem $schema, ordem fixa', () => {
    const api = paraApi(TODAS);
    expect(api.map((t) => t.name)).toEqual(TODAS.map((f) => f.nome));
    for (const t of api) {
      expect(t.input_schema.type).toBe('object');
      expect(t.input_schema).not.toHaveProperty('$schema');
    }
  });

  it('entrada inválida volta como erro para o modelo, sem executar', async () => {
    const r = await executarFerramenta(TODAS, 'ultimos_atendidos', { quantidade: 500 }, {} as never);
    expect(r.erro).toBe(true);
    expect(r.conteudo).toMatch(/entrada inválida/);
  });

  it('ferramenta fora da lista é recusada', async () => {
    const r = await executarFerramenta([], 'faturamento', {}, {} as never);
    expect(r).toEqual({ conteudo: 'ferramenta não disponível para este usuário', erro: true });
  });
});
```

- [ ] **Passo 2:** rode `pnpm --filter @clinicaiq/web test assistente/registro.test.ts`. Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/registro.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { can, type Role } from '@/lib/permissions';
import { reportError } from '@/lib/observability';
import type { Contexto, Ferramenta } from './ferramentas/tipos';
import { listarProfissionais } from './ferramentas/profissionais';
import { buscarPacientes } from './ferramentas/pacientes';
import { ultimosAtendidos } from './ferramentas/atendidos';
import { agendaDoDia } from './ferramentas/agenda-do-dia';
import { horariosLivres } from './ferramentas/horarios-livres';
import { cancelamentos } from './ferramentas/cancelamentos';
import { semRetorno } from './ferramentas/sem-retorno';
import { saldoDevedor } from './ferramentas/saldo';
import { faturamento } from './ferramentas/faturamento';

/** Ordem fixa: a lista de ferramentas faz parte do prefixo em cache. */
export const TODAS: Ferramenta[] = [
  listarProfissionais,
  buscarPacientes,
  ultimosAtendidos,
  agendaDoDia,
  horariosLivres,
  cancelamentos,
  semRetorno,
  saldoDevedor,
  faturamento,
];

/** Ferramenta que o papel não alcança nem chega ao modelo. */
export function ferramentasPara(role: Role): Ferramenta[] {
  return TODAS.filter((f) => can(role, f.capability));
}

export function paraApi(fs: Ferramenta[]): Anthropic.Beta.BetaTool[] {
  return fs.map((f) => {
    const { $schema: _ignorado, ...schema } = zodToJsonSchema(f.entrada, { target: 'jsonSchema7', $refStrategy: 'none' }) as Record<string, unknown>;
    return {
      name: f.nome,
      description: f.descricao,
      input_schema: { ...schema, type: 'object' } as Anthropic.Beta.BetaTool.InputSchema,
    };
  });
}

/** Roda a ferramenta pedida. Erro vira texto para o modelo, nunca exceção para a rota. */
export async function executarFerramenta(
  fs: Ferramenta[],
  nome: string,
  input: unknown,
  ctx: Contexto,
): Promise<{ conteudo: string; erro: boolean }> {
  const f = fs.find((x) => x.nome === nome);
  if (!f) return { conteudo: 'ferramenta não disponível para este usuário', erro: true };
  const parsed = f.entrada.safeParse(input);
  if (!parsed.success) return { conteudo: `entrada inválida: ${parsed.error.issues.map((i) => i.message).join('; ')}`, erro: true };
  try {
    return { conteudo: JSON.stringify(await f.executar(ctx, parsed.data)), erro: false };
  } catch (e) {
    reportError(e, { area: 'assistente', ferramenta: nome });
    return { conteudo: 'a consulta falhou; diga ao usuário que não foi possível obter esse dado agora', erro: true };
  }
}
```

> Se o tipo `Anthropic.Beta.BetaTool.InputSchema` não existir na versão instalada, o `typecheck` mostra o nome certo (por exemplo `Anthropic.Beta.Messages.BetaTool['input_schema']`). Use o tipo que o compilador indicar.

- [ ] **Passo 4:** rode o teste e depois `pnpm --filter @clinicaiq/web typecheck`. Esperado: PASS e sem erros.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/registro.ts apps/web/assistente/registro.test.ts
git commit -m "feat(ia): registro das ferramentas filtrado pelo papel"
```

---

### Tarefa 15: o prompt

**Arquivos:**
- Criar: `apps/web/assistente/prompt.ts`
- Teste: `apps/web/assistente/prompt.test.ts`

**Interfaces:**
- Produz:
  - `PROMPT_SISTEMA: string` (fixo, sem data)
  - `blocoContexto(c: { hoje: string; diaSemana: string; clinica: string; usuario: string; papel: string }): Anthropic.Beta.BetaTextBlockParam`, com o texto começando por `[contexto]`
  - `MARCA_CONTEXTO = '[contexto]'`

- [ ] **Passo 1: teste que falha.** Crie `apps/web/assistente/prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MARCA_CONTEXTO, PROMPT_SISTEMA, blocoContexto } from './prompt';

describe('prompt do assistente', () => {
  it('o prompt fixo não tem data nem nada que mude a cada pedido (senão o cache quebra)', () => {
    expect(PROMPT_SISTEMA).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(PROMPT_SISTEMA).toMatch(/somente leitura|só leitura/i);
    expect(PROMPT_SISTEMA).toMatch(/nunca invente/i);
  });

  it('o contexto leva a data de hoje e quem pergunta', () => {
    const b = blocoContexto({ hoje: '2026-11-07', diaSemana: 'sábado', clinica: 'Sorriso', usuario: 'Bia', papel: 'Recepção' });
    expect(b.text.startsWith(MARCA_CONTEXTO)).toBe(true);
    expect(b.text).toContain('2026-11-07 (sábado)');
    expect(b.text).toContain('Recepção');
  });
});
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/prompt.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Fixo de propósito: tudo que muda (data, clínica, quem pergunta) vai no
 * bloco de contexto da mensagem, depois do trecho em cache.
 */
export const PROMPT_SISTEMA = `Você é o assistente do DreamClin, o sistema de gestão de uma clínica odontológica ou estética no Brasil. Quem fala com você é alguém da equipe da clínica (recepção, profissional, administração ou dono).

O que você faz:
- Responde perguntas sobre a agenda, os pacientes e o financeiro da clínica consultando as ferramentas. Você é somente leitura: não marca, não cancela, não envia mensagem, não cadastra e não altera nada.
- Se pedirem uma ação (enviar, cadastrar, marcar, cobrar, preparar mensagem), diga com gentileza que isso chega numa próxima versão do assistente e, se ajudar, mostre os dados que a pessoa vai precisar para fazer na tela.
- Se nenhuma ferramenta cobre a pergunta, diga que ainda não sabe responder isso. Não tente adivinhar.

Regras sobre os dados:
- Nunca invente números, nomes, datas ou valores. Cite só o que veio das ferramentas nesta conversa.
- Quando uma ferramenta avisar "cortado": true, diga que a lista mostra os primeiros e quantos são no total.
- As ferramentas recebem datas no formato AAAA-MM-DD. Converta "hoje", "amanhã", "semana que vem" e "mês passado" a partir da data de hoje que vem no contexto.
- Para citar um profissional pelo nome, chame listar_profissionais antes para obter o id.
- Quando a pessoa se referir a resultados anteriores ("esses", "quais deles"), use os ids que já apareceram na conversa.
- Se uma ferramenta não estiver disponível para este usuário, diga que o perfil dele não tem acesso a esse dado.
- Telefone só quando a pergunta for sobre contato. Não peça nem mostre CPF.

Como responder:
- Em português do Brasil, direto e curto, como um colega da clínica.
- Listas de pacientes em tabela Markdown simples (no máximo 5 colunas). Valores em reais como vieram das ferramentas.
- Datas no formato dd/mm/aaaa na resposta.`;

export const MARCA_CONTEXTO = '[contexto]';

export function blocoContexto(c: {
  hoje: string;
  diaSemana: string;
  clinica: string;
  usuario: string;
  papel: string;
}): Anthropic.Beta.BetaTextBlockParam {
  return {
    type: 'text',
    text: `${MARCA_CONTEXTO} Hoje é ${c.hoje} (${c.diaSemana}), no fuso de Brasília. Clínica: ${c.clinica}. Quem pergunta: ${c.usuario}, perfil ${c.papel}.`,
  };
}
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/prompt.ts apps/web/assistente/prompt.test.ts
git commit -m "feat(ia): prompt do assistente, fixo para o cache"
```

---

### Tarefa 16: o loop com o Claude

**Arquivos:**
- Criar: `apps/web/assistente/loop.ts`
- Teste: `apps/web/assistente/loop.test.ts`

**Interfaces:**
- Consome: `MODELO` (tarefa 2), `paraApi`, `executarFerramenta` (tarefa 14), `PROMPT_SISTEMA` (tarefa 15), `Contexto`, `Ferramenta`.
- Produz:

```ts
export type Param = Anthropic.Beta.BetaMessageParam;
export interface StreamLike { on(evento: 'text', cb: (t: string) => void): unknown; finalMessage(): Promise<Anthropic.Beta.BetaMessage> }
export interface ClienteClaude { beta: { messages: { stream(params: any): StreamLike } } }
export interface NovaMensagem { param: Param; tools: string[]; inputTokens: number; outputTokens: number }
export async function responder(args: {
  cliente: ClienteClaude; historico: Param[]; pergunta: Param; ferramentas: Ferramenta[]; ctx: Contexto;
  aoEscrever: (texto: string) => void;
}): Promise<{ novas: NovaMensagem[]; textoFinal: string; parouPor: string }>;
export const MAX_VOLTAS = 8;
```

- [ ] **Passo 1: teste que falha.** Crie `apps/web/assistente/loop.test.ts`, com um Claude falso que segue um roteiro:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { responder, MAX_VOLTAS, type ClienteClaude, type Param } from './loop';
import { ferramenta } from './ferramentas/tipos';

type Msg = Anthropic.Beta.BetaMessage;
const msg = (content: Msg['content'], stop: Msg['stop_reason']): Msg =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'x', content, stop_reason: stop, stop_sequence: null,
     usage: { input_tokens: 10, output_tokens: 5 } }) as unknown as Msg;

function falso(roteiro: Msg[]) {
  const pedidos: Record<string, unknown>[] = [];
  const cliente: ClienteClaude = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          pedidos.push(structuredClone(params));
          const resposta = roteiro.shift()!;
          return {
            on(_e: 'text', cb: (t: string) => void) {
              for (const b of resposta.content) if (b.type === 'text') cb(b.text);
              return this;
            },
            finalMessage: async () => resposta,
          };
        },
      },
    },
  };
  return { cliente, pedidos };
}

const eco = ferramenta({
  nome: 'eco',
  descricao: 'devolve o número',
  capability: 'agenda',
  entrada: z.object({ n: z.number() }).strict(),
  executar: async (_ctx, { n }) => ({ n }),
});
const pergunta: Param = { role: 'user', content: [{ type: 'text', text: 'quanto?' }] };

describe('responder', () => {
  it('chama a ferramenta, devolve o resultado ao modelo e escreve a resposta', async () => {
    const { cliente, pedidos } = falso([
      msg([{ type: 'tool_use', id: 't1', name: 'eco', input: { n: 7 } }] as Msg['content'], 'tool_use'),
      msg([{ type: 'text', text: 'São 7.' }] as Msg['content'], 'end_turn'),
    ]);
    const escrito: string[] = [];
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: (t) => escrito.push(t) });

    expect(r.textoFinal).toBe('São 7.');
    expect(escrito.join('')).toBe('São 7.');
    // pergunta, chamada da ferramenta, resultado, resposta
    expect(r.novas.map((n) => n.param.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(r.novas[1].tools).toEqual(['eco']);
    const resultado = (r.novas[2].param.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
    expect(resultado).toMatchObject({ type: 'tool_result', tool_use_id: 't1', content: '{"n":7}' });
    // A segunda chamada leva o histórico inteiro.
    expect((pedidos[1].messages as unknown[]).length).toBe(3);
    expect(pedidos[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'medium' } });
  });

  it('o histórico anterior vai antes da pergunta (contexto da conversa)', async () => {
    const { cliente, pedidos } = falso([msg([{ type: 'text', text: 'ok' }] as Msg['content'], 'end_turn')]);
    const antes: Param[] = [
      { role: 'user', content: [{ type: 'text', text: 'últimos 5' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Ana, Bia…' }] },
    ];
    await responder({ cliente, historico: antes, pergunta, ferramentas: [], ctx: {} as never, aoEscrever: () => {} });
    expect(pedidos[0].messages).toEqual([...antes, pergunta]);
  });

  it('para em recusa sem rodar ferramenta', async () => {
    const { cliente } = falso([msg([{ type: 'tool_use', id: 't1', name: 'eco', input: { n: 1 } }] as Msg['content'], 'refusal')]);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {} });
    expect(r.parouPor).toBe('refusal');
    expect(r.novas.map((n) => n.param.role)).toEqual(['user']);
  });

  it(`não passa de ${MAX_VOLTAS} voltas`, async () => {
    const roteiro = Array.from({ length: MAX_VOLTAS + 2 }, (_, i) =>
      msg([{ type: 'tool_use', id: `t${i}`, name: 'eco', input: { n: i } }] as Msg['content'], 'tool_use'),
    );
    const { cliente, pedidos } = falso(roteiro);
    const r = await responder({ cliente, historico: [], pergunta, ferramentas: [eco], ctx: {} as never, aoEscrever: () => {} });
    expect(pedidos).toHaveLength(MAX_VOLTAS);
    expect(r.parouPor).toBe('limite');
  });
});
```

- [ ] **Passo 2:** rode `pnpm --filter @clinicaiq/web test assistente/loop.test.ts`. Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/loop.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk';
import { MODELO } from './cliente';
import { PROMPT_SISTEMA } from './prompt';
import { executarFerramenta, paraApi } from './registro';
import type { Contexto, Ferramenta } from './ferramentas/tipos';

export type Param = Anthropic.Beta.BetaMessageParam;

/** O que o loop usa do SDK. Injetável para o teste usar um Claude falso. */
export interface StreamLike {
  on(evento: 'text', cb: (t: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Beta.BetaMessage>;
}
export interface ClienteClaude {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beta: { messages: { stream(params: any): StreamLike } };
}

export interface NovaMensagem {
  param: Param;
  tools: string[];
  inputTokens: number;
  outputTokens: number;
}

/** Teto de idas e voltas com ferramentas numa pergunta. */
export const MAX_VOLTAS = 8;

/**
 * Uma pergunta: manda o histórico mais a pergunta, roda as ferramentas pedidas
 * e repete até a resposta final. Só acrescenta ao histórico, nunca edita o que
 * já foi, porque o cache e o pensamento do modelo dependem disso.
 */
export async function responder({
  cliente,
  historico,
  pergunta,
  ferramentas,
  ctx,
  aoEscrever,
}: {
  cliente: ClienteClaude;
  historico: Param[];
  pergunta: Param;
  ferramentas: Ferramenta[];
  ctx: Contexto;
  aoEscrever: (texto: string) => void;
}): Promise<{ novas: NovaMensagem[]; textoFinal: string; parouPor: string }> {
  const tools = paraApi(ferramentas);
  const messages: Param[] = [...historico, pergunta];
  const novas: NovaMensagem[] = [{ param: pergunta, tools: [], inputTokens: 0, outputTokens: 0 }];
  let textoFinal = '';

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const stream = cliente.beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: PROMPT_SISTEMA, cache_control: { type: 'ephemeral' } }],
      ...(tools.length ? { tools } : {}),
      messages,
    });
    stream.on('text', aoEscrever);
    const resposta = await stream.finalMessage();

    // Uma recusa pode cortar um tool_use no meio: nunca rode as ferramentas dessa volta.
    if (resposta.stop_reason === 'refusal') return { novas, textoFinal, parouPor: 'refusal' };

    const assistente: Param = { role: 'assistant', content: resposta.content };
    const chamadas = resposta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    messages.push(assistente);
    novas.push({
      param: assistente,
      tools: chamadas.map((c) => c.name),
      inputTokens: resposta.usage.input_tokens + (resposta.usage.cache_read_input_tokens ?? 0),
      outputTokens: resposta.usage.output_tokens,
    });
    textoFinal = resposta.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');

    if (resposta.stop_reason !== 'tool_use' || chamadas.length === 0) {
      return { novas, textoFinal, parouPor: resposta.stop_reason ?? 'fim' };
    }

    // Todas as respostas das ferramentas numa mensagem só (é o que mantém as chamadas em paralelo).
    const resultados = await Promise.all(
      chamadas.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const r = await executarFerramenta(ferramentas, c.name, c.input, ctx);
        return { type: 'tool_result', tool_use_id: c.id, content: r.conteudo, ...(r.erro ? { is_error: true } : {}) };
      }),
    );
    const usuario: Param = { role: 'user', content: resultados };
    messages.push(usuario);
    novas.push({ param: usuario, tools: [], inputTokens: 0, outputTokens: 0 });
  }
  return { novas, textoFinal, parouPor: 'limite' };
}
```

> Se a versão instalada do SDK não tipar `fallbacks` ou `output_config` no `beta.messages.stream`, atualize o `@anthropic-ai/sdk` para a última versão (`pnpm --filter @clinicaiq/web up @anthropic-ai/sdk --latest`). Não remova os campos.

- [ ] **Passo 4:** rode o teste e o `typecheck`. Esperado: PASS e sem erros.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/loop.ts apps/web/assistente/loop.test.ts
git commit -m "feat(ia): loop do assistente com ferramentas, streaming e teto de voltas"
```

---

### Tarefa 17: histórico cifrado

**Arquivos:**
- Criar: `apps/web/assistente/historico.ts`
- Teste: `apps/web/assistente/historico.db.test.ts`

**Interfaces:**
- Consome: `Param`, `NovaMensagem` (tarefa 16).
- Produz:
  - `criarConversa(tenantId, userId, titulo): Promise<string>`
  - `carregarHistorico(tenantId, userId, conversationId): Promise<Param[] | null>` (null quando a conversa não é do usuário)
  - `salvarMensagens(tenantId, conversationId, novas: NovaMensagem[]): Promise<void>`
  - `listarConversas(tenantId, userId): Promise<{id, titulo, atualizadaEm}[]>`
  - `apagarAntigas(agora: Date): Promise<number>`
  - `RETENCAO_DIAS = 30`

- [ ] **Passo 1: teste que falha.** Crie `apps/web/assistente/historico.db.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('histórico do assistente (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const h = await import('./historico');
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `iah_${sufixo}`, name: 'H', slug: `iah-${sufixo}` } });
  const ana = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Ana', email: `a-${sufixo}@t.local`, role: 'OWNER' } });
  const bia = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Bia', email: `b-${sufixo}@t.local`, role: 'RECEPTIONIST' } });

  afterAll(async () => {
    await prisma.assistantMessage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.assistantConversation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('grava cifrado e devolve na ordem, só para o dono da conversa', async () => {
    const id = await h.criarConversa(tenant.id, ana.id, 'Últimos atendidos');
    await h.salvarMensagens(tenant.id, id, [
      { param: { role: 'user', content: [{ type: 'text', text: 'Maria Souza deve?' }] }, tools: [], inputTokens: 0, outputTokens: 0 },
      { param: { role: 'assistant', content: [{ type: 'text', text: 'Deve R$ 500,00.' }] }, tools: ['saldo_devedor'], inputTokens: 900, outputTokens: 40 },
    ]);
    await h.salvarMensagens(tenant.id, id, [
      { param: { role: 'user', content: [{ type: 'text', text: 'e a Bia?' }] }, tools: [], inputTokens: 0, outputTokens: 0 },
    ]);

    const bruto = await prisma.assistantMessage.findMany({ where: { conversationId: id }, orderBy: { seq: 'asc' } });
    expect(bruto.map((m) => m.seq)).toEqual([0, 1, 2]);
    expect(bruto[0].content).not.toContain('Maria');
    expect(bruto[1].tools).toEqual(['saldo_devedor']);

    const hist = await h.carregarHistorico(tenant.id, ana.id, id);
    expect(hist!.map((p) => p.role)).toEqual(['user', 'assistant', 'user']);
    expect(await h.carregarHistorico(tenant.id, bia.id, id)).toBeNull();
    expect((await h.listarConversas(tenant.id, ana.id)).map((c) => c.titulo)).toContain('Últimos atendidos');
    expect(await h.listarConversas(tenant.id, bia.id)).toEqual([]);
  });

  it('apaga o que passou de 30 dias', async () => {
    const velha = await h.criarConversa(tenant.id, ana.id, 'velha');
    await prisma.assistantConversation.update({ where: { id: velha }, data: { updatedAt: new Date(Date.now() - 31 * 86_400_000) } });
    const nova = await h.criarConversa(tenant.id, ana.id, 'nova');
    expect(await h.apagarAntigas(new Date())).toBeGreaterThanOrEqual(1);
    expect(await prisma.assistantConversation.findUnique({ where: { id: velha } })).toBeNull();
    expect(await prisma.assistantConversation.findUnique({ where: { id: nova } })).not.toBeNull();
  });
});
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/historico.ts`:

```ts
import 'server-only';
import { decrypt, encrypt, prisma } from '@clinicaiq/db';
import type { NovaMensagem, Param } from './loop';

export const RETENCAO_DIAS = 30;

const chave = () => {
  const k = process.env.ENCRYPTION_MASTER_KEY;
  if (!k) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return k;
};

export async function criarConversa(tenantId: string, userId: string, titulo: string): Promise<string> {
  const c = await prisma.assistantConversation.create({
    data: { tenantId, userId, title: titulo.slice(0, 80) },
    select: { id: true },
  });
  return c.id;
}

/** Null quando a conversa não existe ou é de outra pessoa: cada um vê só as suas. */
export async function carregarHistorico(tenantId: string, userId: string, conversationId: string): Promise<Param[] | null> {
  const conversa = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, tenantId, userId },
    select: { messages: { orderBy: { seq: 'asc' }, select: { content: true } } },
  });
  if (!conversa) return null;
  const k = chave();
  return conversa.messages.map((m) => JSON.parse(decrypt(m.content, k, tenantId)) as Param);
}

export async function salvarMensagens(tenantId: string, conversationId: string, novas: NovaMensagem[]): Promise<void> {
  if (novas.length === 0) return;
  const k = chave();
  await prisma.$transaction(async (tx) => {
    const ultima = await tx.assistantMessage.findFirst({
      where: { conversationId, tenantId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const base = (ultima?.seq ?? -1) + 1;
    await tx.assistantMessage.createMany({
      data: novas.map((n, i) => ({
        tenantId,
        conversationId,
        seq: base + i,
        role: n.param.role,
        content: encrypt(JSON.stringify(n.param), k, tenantId),
        tools: n.tools,
        inputTokens: n.inputTokens,
        outputTokens: n.outputTokens,
      })),
    });
    await tx.assistantConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  });
}

export async function listarConversas(tenantId: string, userId: string) {
  const cs = await prisma.assistantConversation.findMany({
    where: { tenantId, userId },
    orderBy: { updatedAt: 'desc' },
    take: 20,
    select: { id: true, title: true, updatedAt: true },
  });
  return cs.map((c) => ({ id: c.id, titulo: c.title, atualizadaEm: c.updatedAt.toISOString() }));
}

/** Chamada pelo cron `reminders`. Apaga conversas paradas há mais de 30 dias (as mensagens vão em cascata). */
export async function apagarAntigas(agora: Date): Promise<number> {
  const corte = new Date(agora.getTime() - RETENCAO_DIAS * 86_400_000);
  const r = await prisma.assistantConversation.deleteMany({ where: { updatedAt: { lt: corte } } });
  return r.count;
}
```

> A spec fala em apagar o que tem mais de 30 dias. Aqui conta a **última mensagem** da conversa (`updatedAt`): uma conversa usada ontem não perde o começo. Isso fica registrado na spec na tarefa 22.

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/historico.ts apps/web/assistente/historico.db.test.ts
git commit -m "feat(ia): histórico do assistente cifrado e apagado em 30 dias"
```

---

### Tarefa 18: chave do piloto e limites

**Arquivos:**
- Criar: `apps/web/assistente/acesso.ts`
- Teste: `apps/web/assistente/acesso.db.test.ts`

**Interfaces:**
- Consome: `rateLimit(key, limit, windowMs)` de `@/lib/rate-limit`.
- Produz:
  - `assistenteLiberado(tenantId): Promise<boolean>`
  - `checarLimites(tenantId, userId): Promise<{ ok: true } | { ok: false; retryAfter: number; mensagem: string }>`
  - `LIMITE_DIA_CLINICA = 100`, `LIMITE_HORA_USUARIO = 30`

- [ ] **Passo 1: teste que falha.** Crie `apps/web/assistente/acesso.db.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

describe.skipIf(!process.env.DATABASE_URL)('acesso ao assistente (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const { assistenteLiberado, checarLimites, LIMITE_HORA_USUARIO } = await import('./acesso');
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `iaa_${sufixo}`, name: 'A', slug: `iaa-${sufixo}` } });
  const plano = await prisma.plan.findFirst({ where: { assistantEnabled: false } });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "rate_limits" WHERE "key" LIKE ${`assistente:%${tenant.id}%`}`;
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('sem assinatura: fechado', async () => {
    expect(await assistenteLiberado(tenant.id)).toBe(false);
  });

  it('assinatura sem a chave: fechado; com a chave: aberto', async () => {
    await prisma.subscription.create({
      data: { tenantId: tenant.id, tier: plano!.tier, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
    expect(await assistenteLiberado(tenant.id)).toBe(false);
    await prisma.subscription.update({ where: { tenantId: tenant.id }, data: { assistantEnabled: true } });
    expect(await assistenteLiberado(tenant.id)).toBe(true);
  });

  it(`barra depois de ${LIMITE_HORA_USUARIO} perguntas por hora do mesmo usuário`, async () => {
    for (let i = 0; i < LIMITE_HORA_USUARIO; i++) expect((await checarLimites(tenant.id, 'u1')).ok).toBe(true);
    const r = await checarLimites(tenant.id, 'u1');
    expect(r.ok).toBe(false);
    expect((await checarLimites(tenant.id, 'u2')).ok).toBe(true);
  });
});
```

> Se `Subscription.create` exigir outros campos obrigatórios, o TypeScript mostra quais. Preencha com valores fixos.

- [ ] **Passo 2:** rode o teste. Esperado: FAIL.

- [ ] **Passo 3: implementação.** Crie `apps/web/assistente/acesso.ts`:

```ts
import 'server-only';
import { prisma } from '@clinicaiq/db';
import { rateLimit } from '@/lib/rate-limit';

export const LIMITE_DIA_CLINICA = 100;
export const LIMITE_HORA_USUARIO = 30;

/** Liberado pelo piloto (assinatura) ou pelo plano. Sem assinatura, fechado. */
export async function assistenteLiberado(tenantId: string): Promise<boolean> {
  const s = await prisma.subscription
    .findUnique({ where: { tenantId }, select: { assistantEnabled: true, plan: { select: { assistantEnabled: true } } } })
    .catch(() => null);
  return Boolean(s && (s.assistantEnabled || s.plan.assistantEnabled));
}

export async function checarLimites(
  tenantId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; retryAfter: number; mensagem: string }> {
  const usuario = await rateLimit(`assistente:usuario:${tenantId}:${userId}`, LIMITE_HORA_USUARIO, 60 * 60_000);
  if (!usuario.ok) return { ok: false, retryAfter: usuario.retryAfter, mensagem: 'Muitas perguntas seguidas. Tente de novo daqui a pouco.' };
  const clinica = await rateLimit(`assistente:clinica:${tenantId}`, LIMITE_DIA_CLINICA, 24 * 60 * 60_000);
  if (!clinica.ok) return { ok: false, retryAfter: clinica.retryAfter, mensagem: 'Limite de perguntas de hoje atingido.' };
  return { ok: true };
}
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/web/assistente/acesso.ts apps/web/assistente/acesso.db.test.ts
git commit -m "feat(ia): chave do piloto e limites de uso do assistente"
```

---

### Tarefa 19: as rotas

**Arquivos:**
- Criar: `apps/web/app/api/assistente/route.ts`
- Criar: `apps/web/app/api/assistente/conversas/route.ts`
- Criar: `apps/web/assistente/turno.ts` (a lógica da rota, testável)
- Teste: `apps/web/assistente/turno.test.ts`

**Interfaces:**
- Consome: `currentAccess()` de `@/lib/guard`, `assistenteLiberado`, `checarLimites` (tarefa 18), histórico (tarefa 17), `responder` (tarefa 16), `ferramentasPara` (tarefa 14), `blocoContexto` (tarefa 15), `claude()` (tarefa 2), `clinicToday()` de `@/lib/tz`.
- Produz:
  - `POST /api/assistente` com o corpo `{ pergunta: string; conversaId?: string }`.
    - A resposta é `text/plain` em streaming: o texto vai chegando, e a última linha é `\n\u0000{"conversaId":"…","parouPor":"…"}`.
    - Erros: 404 (sem acesso), 429 (limite) e 400 (pergunta vazia ou longa), com JSON `{ erro }`.
  - `GET /api/assistente/conversas` → `{ conversas }`; `GET /api/assistente/conversas?id=…` → `{ mensagens: Param[] }`.
  - `SEPARADOR_FIM = '\u0000'` em `turno.ts`.

- [ ] **Passo 1: teste que falha.** Crie `apps/web/assistente/turno.test.ts`. Ele testa a validação de entrada, que é pura:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { lerPedido, SEPARADOR_FIM } from './turno';

describe('lerPedido', () => {
  it('aceita pergunta com conversa opcional', () => {
    expect(lerPedido({ pergunta: '  quantos amanhã? ' })).toEqual({ ok: true, pergunta: 'quantos amanhã?', conversaId: undefined });
  });
  it('recusa vazia e longa demais', () => {
    expect(lerPedido({ pergunta: '   ' }).ok).toBe(false);
    expect(lerPedido({ pergunta: 'x'.repeat(2001) }).ok).toBe(false);
    expect(lerPedido(null).ok).toBe(false);
  });
  it('separador do fim é um caractere que o modelo não escreve', () => {
    expect(SEPARADOR_FIM).toBe('\u0000');
  });
});
```

- [ ] **Passo 2:** rode o teste. Esperado: FAIL.

- [ ] **Passo 3: implementação de `turno.ts`.** Crie `apps/web/assistente/turno.ts`:

```ts
import 'server-only';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getTenantClient, prisma } from '@clinicaiq/db';
import { clinicToday } from '@/lib/tz';
import { reportError } from '@/lib/observability';
import type { Role } from '@/lib/permissions';
import { claude } from './cliente';
import { blocoContexto } from './prompt';
import { ferramentasPara } from './registro';
import { responder, type Param } from './loop';
import { carregarHistorico, criarConversa, salvarMensagens } from './historico';

export const SEPARADOR_FIM = '\u0000';

const Pedido = z.object({ pergunta: z.string().trim().min(1).max(2000), conversaId: z.string().optional() });

export function lerPedido(corpo: unknown):
  | { ok: true; pergunta: string; conversaId: string | undefined }
  | { ok: false; erro: string } {
  const r = Pedido.safeParse(corpo);
  if (!r.success) return { ok: false, erro: 'Escreva uma pergunta de até 2000 caracteres.' };
  return { ok: true, pergunta: r.data.pergunta, conversaId: r.data.conversaId };
}

const PAPEL: Record<string, string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', RECEPTIONIST: 'Recepção', PROFESSIONAL: 'Profissional' };
const DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Uma pergunta inteira: monta o contexto, roda o loop escrevendo em `escrever`, grava e audita. */
export async function rodarTurno(args: {
  tenantId: string;
  userId: string;
  role: Role;
  pergunta: string;
  conversaId?: string;
  escrever: (t: string) => void;
}): Promise<{ conversaId: string; parouPor: string } | { erro: string; status: number }> {
  const { tenantId, userId, role, pergunta, escrever } = args;

  let conversaId = args.conversaId;
  let historico: Param[] = [];
  if (conversaId) {
    const h = await carregarHistorico(tenantId, userId, conversaId);
    if (!h) return { erro: 'Conversa não encontrada.', status: 404 };
    historico = h;
  } else {
    conversaId = await criarConversa(tenantId, userId, pergunta);
  }

  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.user.findFirst({ where: { id: userId, tenantId }, select: { name: true } }),
  ]);
  const hoje = clinicToday();
  const perguntaParam: Param = {
    role: 'user',
    content: [
      blocoContexto({
        hoje,
        diaSemana: DIA[new Date(`${hoje}T12:00:00Z`).getUTCDay()],
        clinica: tenant?.name ?? 'Clínica',
        usuario: user?.name ?? 'Usuário',
        papel: PAPEL[role] ?? role,
      }),
      { type: 'text', text: pergunta },
    ],
  };

  const ferramentas = ferramentasPara(role);
  try {
    const r = await responder({
      cliente: claude(),
      historico,
      pergunta: perguntaParam,
      ferramentas,
      ctx: { tenantId, userId, role, hoje, db: getTenantClient(tenantId) },
      aoEscrever: escrever,
    });
    if (r.parouPor === 'refusal') escrever('Não consegui responder a essa pergunta. Tente reformular.');
    if (r.parouPor === 'limite') escrever('\n\nA pergunta exigiu consultas demais. Tente dividir em partes.');
    await salvarMensagens(tenantId, conversaId, r.novas);
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'assistant.query',
        entity: 'AssistantConversation',
        entityId: conversaId,
        metadata: { tools: r.novas.flatMap((n) => n.tools), parouPor: r.parouPor },
      },
    });
    return { conversaId, parouPor: r.parouPor };
  } catch (e) {
    reportError(e, { area: 'assistente', tenantId });
    const ocupado = e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500);
    escrever(ocupado ? 'O assistente está ocupado. Tente de novo em instantes.' : 'Algo deu errado ao responder. Tente de novo.');
    return { conversaId, parouPor: 'erro' };
  }
}
```

- [ ] **Passo 4: a rota.** Crie `apps/web/app/api/assistente/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { currentAccess } from '@/lib/guard';
import { assistenteLiberado, checarLimites } from '@/assistente/acesso';
import { lerPedido, rodarTurno, SEPARADOR_FIM } from '@/assistente/turno';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const acesso = await currentAccess();
  // 404, e não 403: para quem não está no piloto, a rota não existe.
  if (!acesso || !(await assistenteLiberado(acesso.tenantId))) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  }
  const pedido = lerPedido(await req.json().catch(() => null));
  if (!pedido.ok) return NextResponse.json({ erro: pedido.erro }, { status: 400 });

  const limite = await checarLimites(acesso.tenantId, acesso.userId);
  if (!limite.ok) {
    return NextResponse.json({ erro: limite.mensagem }, { status: 429, headers: { 'Retry-After': String(limite.retryAfter) } });
  }

  const codificador = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      const escrever = (t: string) => controller.enqueue(codificador.encode(t));
      const r = await rodarTurno({ ...acesso, pergunta: pedido.pergunta, conversaId: pedido.conversaId, escrever });
      const fim = 'erro' in r ? { erro: r.erro } : r;
      if ('erro' in r) escrever(r.erro);
      escrever(`\n${SEPARADOR_FIM}${JSON.stringify(fim)}`);
      controller.close();
    },
  });
  return new Response(corpo, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
```

- [ ] **Passo 5: a rota das conversas.** Crie `apps/web/app/api/assistente/conversas/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { currentAccess } from '@/lib/guard';
import { assistenteLiberado } from '@/assistente/acesso';
import { carregarHistorico, listarConversas } from '@/assistente/historico';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const acesso = await currentAccess();
  if (!acesso || !(await assistenteLiberado(acesso.tenantId))) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ conversas: await listarConversas(acesso.tenantId, acesso.userId) });
  const mensagens = await carregarHistorico(acesso.tenantId, acesso.userId, id);
  if (!mensagens) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  return NextResponse.json({ mensagens });
}
```

- [ ] **Passo 6:** confira que o `middleware.ts` protege `/api/assistente` com o Clerk. O `isPublicRoute` não pode incluir esse caminho. Rode o teste do `turno` e o `typecheck`. Esperado: PASS e sem erros.

- [ ] **Passo 7: teste à mão** (precisa de `ANTHROPIC_API_KEY` no `.env.local` e da sua clínica de desenvolvimento com `assistantEnabled = true`). Rode `pnpm dev`, entre no sistema e, no console do navegador:

```js
const r = await fetch('/api/assistente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pergunta: 'Quantos agendamentos temos amanhã?' }) });
console.log(await r.text());
```

Esperado: uma resposta em português com o número certo e, no fim, `{"conversaId":"…","parouPor":"end_turn"}`.

- [ ] **Passo 8: commit**

```bash
git add apps/web/assistente/turno.ts apps/web/assistente/turno.test.ts apps/web/app/api/assistente
git commit -m "feat(ia): rota do assistente com streaming, histórico e auditoria"
```

---

### Tarefa 20: exclusão de 30 dias no cron

**Arquivos:**
- Modificar: `apps/web/app/api/cron/reminders/route.ts` (dentro do `GET`, logo depois do bloco da reconciliação das assinaturas)

**Interfaces:**
- Consome: `apagarAntigas` (tarefa 17).

- [ ] **Passo 1:** acrescente o import `import { apagarAntigas } from '@/assistente/historico';` e, depois do `try` da reconciliação:

```ts
  // Conversas do assistente de IA: guardadas 30 dias (LGPD). Try próprio, pela mesma razão acima.
  let assistente: { apagadas: number } | { error: string };
  try {
    assistente = { apagadas: await apagarAntigas(new Date()) };
  } catch {
    assistente = { error: 'falhou' };
  }
```

No `NextResponse.json` do fim, acrescente `assistente,` ao lado de `subscriptions,`.

- [ ] **Passo 2:** rode `pnpm --filter @clinicaiq/web typecheck` e `pnpm --filter @clinicaiq/web test app/api/cron`. Esperado: sem erros, e os testes existentes do cron passando.

- [ ] **Passo 3: commit**

```bash
git add apps/web/app/api/cron/reminders/route.ts
git commit -m "feat(ia): cron apaga conversas do assistente com mais de 30 dias"
```

---

### Tarefa 21: o painel lateral

**Arquivos:**
- Criar: `apps/web/components/assistente/mensagens.ts`
- Teste: `apps/web/components/assistente/mensagens.test.ts`
- Criar: `apps/web/components/assistente/assistente-painel.tsx`
- Modificar: `apps/web/components/app-shell.tsx`
- Teste: `apps/web/e2e/regressao/assistente.spec.ts`

**Interfaces:**
- Consome: `MARCA_CONTEXTO` (tarefa 15), `SEPARADOR_FIM` (tarefa 19; repetido no client como constante, porque `turno.ts` é `server-only`), as rotas da tarefa 19.
- Produz: `bolhas(params: Param[]): { autor: 'voce' | 'assistente'; texto: string }[]` e `<AssistentePainel />`.

- [ ] **Passo 1: teste que falha (puro).** Crie `apps/web/components/assistente/mensagens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bolhas } from './mensagens';

describe('bolhas', () => {
  it('mostra só a pergunta e o texto final; esconde contexto, ferramentas e resultados', () => {
    expect(
      bolhas([
        { role: 'user', content: [{ type: 'text', text: '[contexto] Hoje é 2026-11-07' }, { type: 'text', text: 'quantos amanhã?' }] },
        { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'agenda_do_dia', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: '{}' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'São 12.' }] },
      ]),
    ).toEqual([
      { autor: 'voce', texto: 'quantos amanhã?' },
      { autor: 'assistente', texto: 'São 12.' },
    ]);
  });
});
```

- [ ] **Passo 2:** rode `pnpm --filter @clinicaiq/web test components/assistente/mensagens.test.ts`. Esperado: FAIL.

- [ ] **Passo 3:** crie `apps/web/components/assistente/mensagens.ts`:

```ts
import type Anthropic from '@anthropic-ai/sdk';

type Param = Anthropic.Beta.BetaMessageParam;
export interface Bolha {
  autor: 'voce' | 'assistente';
  texto: string;
}

/** A mesma marca de assistente/prompt.ts (aquele arquivo não pode vir para o client). */
const MARCA_CONTEXTO = '[contexto]';

/** O histórico da API vira o que a pessoa vê: suas perguntas e as respostas em texto. */
export function bolhas(params: Param[]): Bolha[] {
  const out: Bolha[] = [];
  for (const p of params) {
    const blocos = typeof p.content === 'string' ? [{ type: 'text' as const, text: p.content }] : p.content;
    const texto = blocos
      .flatMap((b) => (b.type === 'text' && !b.text.startsWith(MARCA_CONTEXTO) ? [b.text] : []))
      .join('')
      .trim();
    if (texto) out.push({ autor: p.role === 'user' ? 'voce' : 'assistente', texto });
  }
  return out;
}
```

- [ ] **Passo 4:** rode o teste. Esperado: PASS.

- [ ] **Passo 5: o painel.** Antes, confira em `package.json` se já existe um renderizador de Markdown (por exemplo `react-markdown`). Se não houver, mostre o texto com `whitespace-pre-wrap`, sem dependência nova: a tabela Markdown continua legível como texto. Crie `apps/web/components/assistente/assistente-painel.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sparkles, X, Plus, Send } from 'lucide-react';
import { bolhas, type Bolha } from './mensagens';

const SEPARADOR_FIM = '\u0000';
const SUGESTOES = [
  'Quantos agendamentos temos amanhã?',
  'Me passe os dados dos últimos 5 pacientes atendidos.',
  'Quais pacientes estão com pagamento pendente?',
  'Qual foi nosso faturamento no mês passado?',
];

export function AssistentePainel() {
  const [aberto, setAberto] = useState(false);
  const [conversaId, setConversaId] = useState<string | undefined>();
  const [lista, setLista] = useState<Bolha[]>([]);
  const [recentes, setRecentes] = useState<{ id: string; titulo: string }[]>([]);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => fimRef.current?.scrollIntoView({ block: 'end' }), [lista]);
  useEffect(() => {
    if (!aberto) return;
    fetch('/api/assistente/conversas')
      .then((r) => (r.ok ? r.json() : { conversas: [] }))
      .then((d) => setRecentes(d.conversas ?? []))
      .catch(() => setRecentes([]));
  }, [aberto, conversaId]);

  async function abrirConversa(id: string) {
    const r = await fetch(`/api/assistente/conversas?id=${encodeURIComponent(id)}`);
    if (!r.ok) return;
    const d = await r.json();
    setConversaId(id);
    setLista(bolhas(d.mensagens));
  }

  async function perguntar(pergunta: string) {
    if (!pergunta.trim() || ocupado) return;
    setTexto('');
    setOcupado(true);
    setLista((l) => [...l, { autor: 'voce', texto: pergunta }, { autor: 'assistente', texto: '' }]);
    try {
      const r = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, conversaId }),
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.erro ?? 'Não foi possível responder agora.');
      }
      const leitor = r.body.getReader();
      const dec = new TextDecoder();
      let tudo = '';
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        tudo += dec.decode(value, { stream: true });
        const visivel = tudo.split(SEPARADOR_FIM)[0].replace(/\n$/, '');
        setLista((l) => [...l.slice(0, -1), { autor: 'assistente', texto: visivel }]);
      }
      const fim = tudo.split(SEPARADOR_FIM)[1];
      if (fim) {
        const meta = JSON.parse(fim) as { conversaId?: string };
        if (meta.conversaId) setConversaId(meta.conversaId);
      }
    } catch (e) {
      setLista((l) => [...l.slice(0, -1), { autor: 'assistente', texto: (e as Error).message }]);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Sparkles aria-hidden className="size-4" />
          Assistente
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-xl" aria-describedby="assistente-descricao">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <Dialog.Title className="text-base font-semibold">Assistente</Dialog.Title>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setConversaId(undefined); setLista([]); }} className="rounded p-2 hover:bg-muted" aria-label="Nova conversa">
                <Plus aria-hidden className="size-4" />
              </button>
              <Dialog.Close className="rounded p-2 hover:bg-muted" aria-label="Fechar o assistente">
                <X aria-hidden className="size-4" />
              </Dialog.Close>
            </div>
          </header>
          <p id="assistente-descricao" className="sr-only">
            Pergunte sobre a agenda, os pacientes e o financeiro. O assistente só consulta, não altera nada.
          </p>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite" aria-busy={ocupado}>
            {lista.length === 0 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Pergunte sobre a agenda, os pacientes e o financeiro. O assistente só consulta, não altera nada.</p>
                <ul className="space-y-2">
                  {SUGESTOES.map((s) => (
                    <li key={s}>
                      <button type="button" onClick={() => perguntar(s)} className="w-full rounded border px-3 py-2 text-left text-sm hover:bg-muted">
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
                {recentes.length > 0 && (
                  <nav aria-label="Conversas recentes">
                    <h2 className="mb-1 text-xs font-medium text-muted-foreground">Recentes</h2>
                    <ul className="space-y-1">
                      {recentes.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => abrirConversa(c.id)} className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-muted">
                            {c.titulo}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
              </div>
            )}
            {lista.map((b, i) => (
              <div key={i} className={b.autor === 'voce' ? 'ml-8 rounded-lg bg-primary/10 px-3 py-2 text-sm' : 'mr-4 whitespace-pre-wrap text-sm'}>
                <span className="sr-only">{b.autor === 'voce' ? 'Você: ' : 'Assistente: '}</span>
                {b.texto || (ocupado && i === lista.length - 1 ? 'Consultando…' : '')}
              </div>
            ))}
            <div ref={fimRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); perguntar(texto); }} className="flex gap-2 border-t p-3">
            <label htmlFor="assistente-pergunta" className="sr-only">Sua pergunta</label>
            <input
              id="assistente-pergunta"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={2000}
              placeholder="Ex.: quem não volta há 6 meses?"
              className="min-w-0 flex-1 rounded border bg-background px-3 py-2 text-sm"
              disabled={ocupado}
            />
            <button type="submit" disabled={ocupado || !texto.trim()} className="rounded bg-primary px-3 text-primary-foreground disabled:opacity-50" aria-label="Enviar pergunta">
              <Send aria-hidden className="size-4" />
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

> Confira se o projeto usa `lucide-react` (`grep lucide-react apps/web/package.json`). Se usar outra biblioteca de ícones, troque pelos equivalentes dela. Use as classes de cor que os outros componentes usam (`bg-primary` e `text-primary-foreground` são do shadcn).

- [ ] **Passo 6: montar no `AppShell`.** Em `apps/web/components/app-shell.tsx`, importe `AssistentePainel` e `assistenteLiberado`. Depois de calcular `modules`, acrescente:

```ts
  // Assistente de IA: só na gestão, só nas clínicas do piloto (ou com o plano liberado).
  const assistente = space === 'clinic' && modules.clinic ? await assistenteLiberado(tenant.id) : false;
```

Logo antes do `</div>` final do retorno, acrescente:

```tsx
      {assistente && <AssistentePainel />}
```

- [ ] **Passo 7: e2e com axe.** Crie `apps/web/e2e/regressao/assistente.spec.ts`. O Claude não é chamado: o teste intercepta a rota no navegador.

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prisma } from '@clinicaiq/db';
import { E2E_TENANT_SLUG } from '../support/seed';

test.beforeAll(async () => {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG }, select: { id: true } });
  await prisma.subscription.update({ where: { tenantId: t.id }, data: { assistantEnabled: true } });
});
test.afterAll(async () => {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: E2E_TENANT_SLUG }, select: { id: true } });
  await prisma.subscription.update({ where: { tenantId: t.id }, data: { assistantEnabled: false } });
});

test('o painel do assistente pergunta e mostra a resposta, sem violar WCAG', async ({ page }) => {
  await page.route('**/api/assistente', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: `Temos 12 agendamentos amanhã.\n\u0000{"conversaId":"c1","parouPor":"end_turn"}` }),
  );
  await page.route('**/api/assistente/conversas', (route) => route.fulfill({ json: { conversas: [] } }));

  await page.goto('/agenda');
  await page.getByRole('button', { name: 'Assistente' }).click();
  const painel = page.getByRole('dialog', { name: 'Assistente' });
  await expect(painel).toBeVisible();

  await painel.getByLabel('Sua pergunta').fill('Quantos agendamentos temos amanhã?');
  await painel.getByRole('button', { name: 'Enviar pergunta' }).click();
  await expect(painel.getByText('Temos 12 agendamentos amanhã.')).toBeVisible();

  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(painel).toBeHidden();
});
```

- [ ] **Passo 8:** rode `pnpm --filter @clinicaiq/web typecheck`, depois `pnpm --filter @clinicaiq/web test:e2e e2e/regressao/assistente.spec.ts`. Esperado: sem erros e PASS. Se o `E2E_TENANT_SLUG` não tiver `Subscription`, crie a assinatura no `beforeAll` com `upsert`.

- [ ] **Passo 9: commits** (dois, para separar a lógica pura da tela):

```bash
git add apps/web/components/assistente/mensagens.ts apps/web/components/assistente/mensagens.test.ts
git commit -m "feat(ia): histórico da API vira bolhas de conversa"
git add apps/web/components/assistente/assistente-painel.tsx apps/web/components/app-shell.tsx apps/web/e2e/regressao/assistente.spec.ts
git commit -m "feat(ia): painel lateral do assistente na gestão, com teste de acessibilidade"
```

---

### Tarefa 22: privacidade e spec final

**Arquivos:**
- Modificar: `apps/web/app/privacidade/page.tsx`
- Modificar: `docs/specs/2026-11-07-assistente-ia-nivel1-design.md`

- [ ] **Passo 1:** em `apps/web/app/privacidade/page.tsx`, ache a lista de operadores ou suboperadores (procure por "Supabase" ou "Vercel"). Acrescente um item no mesmo formato dos outros:

```tsx
<li>
  <strong>Anthropic</strong> (Estados Unidos): processa as perguntas feitas ao assistente de IA e os dados que ele consulta
  para responder (agenda, cadastro e financeiro). Não usa esses dados para treinar modelos. As conversas ficam guardadas
  no DreamClin por 30 dias e depois são apagadas. O assistente fica disponível só nas clínicas que optarem por ele.
</li>
```

Se a página usa outro formato (parágrafos, tabela), siga o formato dela com o mesmo conteúdo.

- [ ] **Passo 2:** na spec, seção 6, troque "apaga o que tem mais de 30 dias" por "apaga as conversas paradas há mais de 30 dias (conta a última mensagem)".

- [ ] **Passo 3:** rode `pnpm --filter @clinicaiq/web test:e2e e2e/a11y.spec.ts`. Esperado: `/privacidade` sem violações.

- [ ] **Passo 4: commit**

```bash
git add apps/web/app/privacidade/page.tsx docs/specs/2026-11-07-assistente-ia-nivel1-design.md
git commit -m "docs(ia): política de privacidade cita a Anthropic no assistente"
```

---

### Tarefa 23: verificação final e avaliação manual

- [ ] **Passo 1:** rode a suíte inteira.

```bash
pnpm --filter @clinicaiq/web typecheck
pnpm --filter @clinicaiq/web lint
pnpm --filter @clinicaiq/web test
```

Esperado: tudo verde, incluindo os `*.db.test.ts` com o `.env.local`.

- [ ] **Passo 2: avaliação manual.** Na clínica de desenvolvimento, com dados de exemplo e `assistantEnabled = true`, faça as 7 perguntas da spec, nesta ordem, na mesma conversa:
  1. "Me passe os dados dos últimos 5 clientes atendidos."
  2. "Quais deles ainda não pagaram?" (tem de usar os 5 anteriores)
  3. "Quais pacientes estão com pagamentos pendentes?"
  4. "Quantos agendamentos temos para amanhã?"
  5. "Encontre os pacientes que não retornam há mais de 6 meses."
  6. "Qual foi nosso faturamento no mês passado?"
  7. "Quais horários estão disponíveis com a Dra. Ana?" (troque pelo nome de um profissional real)
  8. "Mostre os pacientes que cancelaram mais de duas consultas."
  9. "Prepare uma mensagem para eles." (tem de responder que isso chega no próximo nível)

  Confira cada número na tela correspondente do sistema. Repita as perguntas 3 e 6 logado como Recepção sem financeiro: o assistente tem de dizer que o perfil não tem acesso.

- [ ] **Passo 3:** anote o resultado (perguntas certas, erradas e o custo de tokens do `assistant_messages`) num comentário do PR da `feat/ia` para a `main`, quando abri-lo.
