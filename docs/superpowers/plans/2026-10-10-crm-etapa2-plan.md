# Plano — CRM etapa 2: Conversas do WhatsApp

Spec: [`docs/superpowers/specs/2026-10-10-crm-etapa2-conversas-design.md`](../specs/2026-10-10-crm-etapa2-conversas-design.md)
Branch: `feat/crm-etapa1` (a etapa 1 ainda não foi publicada; segue na mesma branch)

Mesmas regras das etapas anteriores: um commit por tarefa; lint, typecheck e unitários verdes;
regressão E2E verde; banco só o local.

### 1. Schema e chave de conversa ✅
`Conversation`, `ChatMessage`, `QuickReply` e enums. Diff só de acréscimos.
`chatKey` no app e no gateway, com a mesma tabela de testes.

### 2. Gateway: gravar as conversas ✅
`chat-log.ts`: `describeMessage` (pura, testada por tabela) e `recordChatMessage`
(sem duplicar, só com CRM ligado). `send()` gera o id e anota a origem. Acks avançam
a `ChatMessage`. Aviso ao app quando a conversa é nova.

### 3. Gateway: enviar pelo CRM ✅
`POST /sessions/:tenantId/chat`, reserva da linha, rotina de reenvio, desistência em 1 hora.

### 4. App: regras das conversas (`crm/conversations.ts`) ✅
Classificar, lista com filtros, abrir (zerar não lidas), mandar (com despacho ao gateway
ou simulação em desenvolvimento), aceitar, recusar, ligar. Criar lead e converter ligam a
conversa. Rota `/api/whatsapp/conversation`. Testes contra o banco.

### 5. Tela Conversas ✅
`/crm/conversas`: lista, conversa, caixa de texto, atualização periódica, aviso de
desconectado. Item no menu com as não lidas.

### 6. Ficha do lead e coluna Entrada ✅
Abas Histórico | Conversa. Coluna Entrada no funil, com aceitar e recusar.

### 7. Respostas rápidas ✅
CRUD em Configurações do CRM e `/` na caixa de texto.

### 8. E2E, a11y e documentação ✅
Specs E2E com conversas semeadas, axe nas telas novas, `CONTEXTO.md`, `ROADMAP.md` e `CLAUDE.md`.
