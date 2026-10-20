<p align="center">
  <img src="apps/web/public/brand/dreamclin-horizontal.svg" alt="DreamClin" width="280">
</p>

<p align="center">
  Sistema de gestão para clínicas odontológicas e estéticas.<br>
  <a href="https://www.dreamclin.com">dreamclin.com</a>
</p>

---

O DreamClin cuida do dia a dia da clínica: agenda, ficha do paciente, orçamento, financeiro e a conversa com o paciente pelo WhatsApp. Quem quiser captar paciente novo liga o CRM, um funil de leads parecido com o Kommo.

A clínica cria a conta sozinha e usa 14 dias de graça, sem cartão. Depois assina um dos planos (Essencial, Profissional ou Clínica), pagando por PIX, boleto ou cartão. O CRM é cobrado à parte, por usuário.

## O que tem

**Gestão da clínica**

- Agenda por profissional, com visão de dia, semana e mês, sala de espera, rótulos coloridos e bloqueio de horário.
- Agendamento online: cada clínica tem um link público onde o paciente escolhe o horário sozinho.
- Confirmação e lembrete de consulta pelo WhatsApp.
- Ficha do paciente com anamnese, odontograma e histórico.
- Orçamento com PDF, link de aprovação para o paciente e plano de parcelas.
- Contrato e recibo em PDF.
- Financeiro com recebimentos, comissões e relatórios.
- Várias unidades na mesma conta.
- Lista de retorno, com quem sumiu e quem nunca marcou.

**CRM de captação**

- Vários funis, com etapas, tags, campos personalizados e tarefas.
- Conversas do WhatsApp dentro do CRM, ligadas ao lead.
- Robô de atendimento montado em quadro, com passos ligados por setas.
- Transmissões, modelos aprovados pela Meta e automações por etapa.
- Painel com conversão, origem dos leads e tempo de resposta.
- Importação e exportação de planilha, no formato do Kommo.

A agenda nunca depende do CRM. Uma clínica sem o módulo usa tudo da gestão normalmente.

**Cuidados que valem para tudo**

- LGPD: CPF e telefone ficam cifrados no banco (AES-256-GCM). Cada clínica só enxerga os próprios dados.
- Acessibilidade WCAG 2.1 AA: tudo funciona pelo teclado e com leitor de tela, e o axe-core roda nos testes.

## Como o código está organizado

É um monorepo com Turborepo e pnpm.

```
apps/
  web/               o site e o sistema (Next.js 15)
  whatsapp-gateway/  conexão com o WhatsApp por QR code (Baileys, no Fly.io)
packages/
  db/                Prisma, cliente por clínica e criptografia
  pdf/               orçamento, contrato e recibo
  whatsapp/          envio de mensagens e modelos
  ui/                componentes compartilhados
docs/
  producao/          SQL para rodar no banco de produção
  specs/             especificações das funcionalidades
  planos/            planos de implementação
```

Dentro de `apps/web`, a gestão fica em `app/(app)`, as telas do CRM em `app/(crm)` e as regras do CRM em `crm/`.

**Tecnologias:** Next.js 15, React 19, TypeScript, Tailwind e shadcn/ui no front. Prisma com PostgreSQL (Supabase) no banco. O login é pelo Clerk, a cobrança pelo Asaas e o PDF pelo @react-pdf. Os testes usam Vitest e Playwright.

## Rodando na sua máquina

Você vai precisar de Node 20 ou mais novo e do pnpm 11 (`corepack enable` resolve).

```bash
pnpm install
```

Depois crie os arquivos de ambiente. Nenhum deles vai para o git.

- `packages/db/.env` com `DATABASE_URL` e `DIRECT_URL`.
- `apps/web/.env.local`, copiando de `apps/web/.env.example`.

Use sempre um banco de desenvolvimento e o Clerk de desenvolvimento (chaves `pk_test` e `sk_test`). Para o banco, serve um Postgres na máquina, um projeto gratuito no Supabase ou o `docker compose up -d`. O passo a passo completo está em [`apps/web/e2e/README.md`](apps/web/e2e/README.md).

Com o ambiente pronto:

```bash
pnpm db:push                                              # cria as tabelas
pnpm --filter @clinicaiq/db exec tsx prisma/seed-plans.ts # cria os planos
pnpm dev                                                  # http://localhost:3000
```

Em desenvolvimento o WhatsApp é simulado, então nenhuma mensagem sai de verdade.

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Sobe o sistema em modo de desenvolvimento |
| `pnpm build` | Gera a versão de produção |
| `pnpm typecheck` | Confere os tipos |
| `pnpm lint` | Roda o lint |
| `pnpm test` | Testes unitários. Os de banco (`*.db.test.ts`) só rodam com `DATABASE_URL` |
| `pnpm test:e2e` | Testes de ponta a ponta com Playwright |
| `pnpm db:generate` | Gera o cliente do Prisma |
| `pnpm db:push` | Aplica o schema no banco |

Para ligar o CRM de uma clínica no seu banco local:

```bash
pnpm --filter @clinicaiq/db exec tsx prisma/crm-enable.ts <slug-da-clinica>
```

## Como a gente trabalha

- Cada mudança nasce numa branch própria (`feat/...`, `fix/...`) e vai por pull request para a `develop`.
- A `develop` vai para a `main` num PR de release. O que entra na `main` vai para o ar na Vercel.
- Preferimos commits pequenos, cada um com uma mudança só.
- Todo PR roda typecheck, lint e testes no GitHub Actions. Só faça merge com tudo verde.
- O banco não usa migrations. Quando o schema muda, o SQL de produção fica em `docs/producao/` e roda no Supabase **antes** do merge na `main`.
- Nunca rode teste nem `db:push` contra o banco de produção.

## Onde roda

| Parte | Onde |
| --- | --- |
| Site e sistema | Vercel |
| Banco | Supabase (PostgreSQL) |
| Gateway do WhatsApp | Fly.io, em São Paulo |
| Login | Clerk |
| Cobrança | Asaas |

Os deploys de Preview usam um banco separado (Neon) e o Clerk de desenvolvimento, para nenhum teste encostar nas clínicas reais.

## Para saber mais

- [`docs/GUIA-DO-PROJETO.md`](docs/GUIA-DO-PROJETO.md) tem as regras do projeto em detalhe: multi-tenant, CRM, LGPD e acessibilidade.
- [`ROADMAP.md`](ROADMAP.md) mostra o que vem por aí.
- [`docs/`](docs) reúne as especificações, o SQL de produção e a configuração do WhatsApp.
