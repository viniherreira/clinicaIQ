# Contexto do trabalho no CRM (para continuar em outro computador)

Atualizado em 2026-10-09. Leia isto antes de continuar o CRM.

## Onde estamos

- Branch: `feat/crm-etapa1` (no GitHub). A `main` e o site em produção **não** têm nada do CRM.
- **Etapa 1 do CRM pronta e testada** (leads, funil, tags, tarefas, conversão em paciente, integração automática com agenda e orçamentos). Spec e plano:
  - `docs/superpowers/specs/2026-10-07-crm-etapa1-leads-funil-design.md`
  - `docs/superpowers/plans/2026-10-07-crm-etapa1-plan.md` (todas as tarefas ✅)
- Verificação: 289 testes unitários, 17 E2E (regressão da agenda e orçamentos + CRM), axe-core sem violações nas telas do CRM, `next build` ok.
- **Ainda não publicado em produção.** Ver "Publicar a etapa 1" abaixo.

## Decisões tomadas com o dono do produto

- CRM **só para clínicas**, funcionalidades e organização de tela **inspiradas no Kommo**, identidade visual do ClinicaIQ (nada de marca do Kommo).
- Dois espaços no mesmo app com seletor `Clínica | CRM`.
- **Mudança de estratégia (2026-10-09): o produto é o sistema de agenda; o CRM é um adicional pago** por cima de qualquer plano — R$ 39 por usuário/mês, a clínica escolhe quem tem acesso, 14 dias grátis, uma cobrança só no Asaas, cortesia inclui o CRM. Não existe plano "só CRM". Spec: `docs/superpowers/specs/2026-10-09-crm-adicional-pago-design.md`; plano: `docs/superpowers/plans/2026-10-09-crm-adicional-pago-plan.md`. Vem **antes** da etapa 2.
- Lead = negócio (várias por pessoa). Tarefas com aviso "sem tarefa". Um funil editável por clínica.
- **A agenda nunca depende do CRM**: só `after(() => notifyCrm(...))` depois de salvar.
- Banco de desenvolvimento **separado da produção** (Postgres local). Nunca testar contra o banco das clínicas.
- Publicar em produção só com autorização explícita, passo a passo (cópia de segurança → mostrar o SQL → aplicar → clínica piloto).

## CRM adicional pago — pronto

Feito no plano `docs/superpowers/plans/2026-10-09-crm-adicional-pago-plan.md`: colunas novas,
regras de cobrança, ligar/desligar com teste de 14 dias, acesso por pessoa (Equipe),
cartão no Plano, tela de venda em `/crm-indisponivel`, aviso de fim de teste, troca de
plano e rotina diária cobrando plano + CRM. 19 testes E2E verdes.

## Etapa 2 — WhatsApp e caixa de entrada (desenho em discussão, ainda sem spec)

Decidido:
- **QR code agora, API oficial depois**: a caixa de entrada não depende do provedor. Começa com o gateway de QR (`apps/whatsapp-gateway`), que já está conectado nas clínicas. Em paralelo, o dono inicia a aprovação do ClinicaIQ como Tech Provider na Meta; depois, cada clínica migra para a Cloud API com **coexistência** (o celular continua funcionando).
- Escopo: tela **Conversas** (lista com não lidas e filtros Todas/Minhas/Sem resposta/Entrada) + **chat na ficha do lead** (aba Conversa), **coluna Entrada** (número novo; aceitar, ligar a lead/paciente existente, recusar), **respostas rápidas** (`/`). Mídia fica para depois ("mídia recebida, abra no celular").
- **Todas as conversas** aparecem (pacientes, leads e números novos). Confirmações de consulta continuam automáticas e também aparecem na conversa.

Proposto e **aguardando aprovação** (opção A recomendada):
- O gateway passa a gravar toda mensagem 1:1 direto no banco (inclusive as enviadas pelo celular da clínica e a mídia como aviso), sem duplicar os lembretes (pelo id da mensagem), e só para clínicas com `crmEnabled`. Depois avisa o app, que liga a conversa ao lead/paciente ou manda para Entrada.
- Tabelas novas: `Conversation` (telefone cifrado + índice cego, lead/paciente, responsável, não lidas, situação Entrada/aceita/recusada), `ChatMessage` (**texto cifrado** — dado de saúde), `QuickReply`.
- Envio das respostas do CRM pela mesma fila com reenvio dos lembretes.
- Telas atualizam por consulta periódica enquanto abertas.
- Publicar esta etapa exige **atualizar o gateway no Fly.io** (com o mesmo cuidado de produção).

Fatos do código relevantes para a etapa 2:
- `packages/whatsapp/src/meta-provider.ts` atende um número só (credenciais em variável de ambiente) — precisa virar por clínica.
- `apps/whatsapp-gateway/src/session-manager.ts` (`messages.upsert`) ignora `fromMe` e mídia, e só repassa texto/botão para `/api/whatsapp/inbound`, que só trata confirmação de consulta.
- `WhatsAppMessage` exige `patientId` — não serve para conversa com lead.

## Pendências com o dono do produto

1. Publicar etapa 1 + adicional em produção (banco **antes** do merge — ver abaixo).
2. Aprovar o desenho da etapa 2 (opção A) → escrever a spec.
3. **Link de acompanhamento na Vercel**: preview da branch com banco de teste na nuvem (Neon, gratuito) e Clerk de desenvolvimento, usando variáveis de Preview **restritas à branch** `feat/crm-etapa1`. O dono cria o Neon e cola os segredos na Vercel; depois roda-se `db push` + dados de exemplo no Neon.
   - Hoje o Preview da Vercel usa **as mesmas variáveis da produção** (banco, Clerk, Asaas): não usar previews para testes até separar.
4. Tarefas paralelas sugeridas: contraste da landing (`text-sky-600`) e do minicalendário da agenda (`#bbc1c8`) — problemas anteriores ao CRM.

## Preparar outro computador

1. `git clone https://github.com/viniherreira/clinicaIQ.git` e `git checkout feat/crm-etapa1`
2. Node 20+ e `npm i -g pnpm@11.4.0`; depois `pnpm install`
3. Postgres local (Windows: `winget install PostgreSQL.PostgreSQL.17`) e um banco `clinicaiq_dev`
4. Arquivos fora do git (copiar dos `.example`): `apps/web/.env.local`, `packages/db/.env`, `apps/web/.env.test`. Usar **Clerk de desenvolvimento** (`pk_test`/`sk_test`) e uma `ENCRYPTION_MASTER_KEY` nova, só de desenvolvimento.
5. `pnpm db:push`, `pnpm --filter @clinicaiq/db exec tsx prisma/seed-plans.ts`, `pnpm --filter @clinicaiq/web exec playwright install chromium`
6. `pnpm --filter @clinicaiq/web test:e2e` cria a clínica de teste (com CRM ligado) e roda tudo. Detalhes em `apps/web/e2e/README.md`.
7. `pnpm dev` → http://localhost:3000, entrar com a conta `+clerk_test` (código de verificação do Clerk de teste: 424242).

## Publicar em produção (ordem obrigatória)

**Não dar merge na `main` antes de aplicar o banco.** Várias consultas à assinatura e
aos usuários leem todas as colunas; com o código novo e o banco antigo, quebram o
onboarding, a tela de Planos, o webhook do Asaas e a rotina diária.

1. Cópia de segurança do banco de produção (`pg_dump`).
2. `prisma migrate diff` produção → schema da branch; conferir que só há `CREATE` e `ADD COLUMN` com padrão.
3. Aplicar no banco de produção (com autorização do dono).
4. `seed-plans.ts` em produção (grava `crmSeatPriceCents`).
5. Merge na `main` → deploy da Vercel.
6. Conferir o site; a clínica piloto experimenta o CRM.
