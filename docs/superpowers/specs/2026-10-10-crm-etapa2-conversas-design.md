# CRM etapa 2 — Conversas do WhatsApp

Data: 2026-10-10
Status: aprovado (opção A, "pode seguir com o desenvolvimento")

## Objetivo

Trazer o WhatsApp da clínica para dentro do CRM, como a caixa de chats do Kommo:
ver e responder todas as conversas sem sair do sistema, com cada conversa
ligada ao lead ou ao paciente, e os números novos chegando numa coluna
**Entrada** para a recepção aceitar ou recusar.

## Decisões (com o dono do produto)

- **QR code agora, API oficial depois.** A caixa de entrada não depende do
  provedor: começa no gateway de QR que as clínicas já usam. A Cloud API da Meta
  (com coexistência) entra depois, gravando nas mesmas tabelas.
- **Todas as conversas** aparecem: pacientes, leads e números novos.
  Lembretes e confirmações continuam automáticos e também aparecem na conversa.
- Escopo: tela **Conversas**, **aba Conversa na ficha do lead**, **coluna
  Entrada** no funil, **respostas rápidas** com `/`.
- Mídia fica para depois: aparece como "Foto recebida — abra no celular".
- Só para clínicas com o CRM ligado. Sem o CRM, o gateway não grava nada novo.

## O que fica de fora

Envio de mídia, áudio e figurinha; grupos; histórico anterior à ativação (o
WhatsApp não manda); marcar como lida no celular; chatbot (etapa 4);
transmissões (etapa 3); API oficial (depois).

## Dados (só acréscimos)

Três tabelas novas, todas com `tenantId`:

**`Conversation`**: um número de WhatsApp = uma conversa, como no celular.
- `phoneEncrypted` + `phoneHash` (índice cego da **chave de conversa**, ver abaixo), únicos por clínica.
- `contactName`: o nome que a pessoa usa no WhatsApp.
- `status`: `INBOX` (Entrada), `ACTIVE`, `DECLINED`.
- `leadId?`: o negócio ligado; `patientId?`: o paciente ligado.
- `classifiedAt?`: quando o app já tentou ligar a lead ou paciente.
- `unreadCount`, `awaitingReply` (a última palavra é do contato), `lastMessageAt`, `lastPreviewEncrypted`.

**`ChatMessage`**: cada mensagem da conversa.
- `direction` (`INBOUND`/`OUTBOUND`) e `origin`: `CONTACT`, `CRM` (escrita no CRM, com `sentById`), `PHONE` (escrita no celular da clínica), `AUTOMATION` (lembrete, confirmação, campanha).
- `kind`: `TEXT`, `IMAGE`, `AUDIO`, `VIDEO`, `DOCUMENT`, `STICKER`, `LOCATION`, `CONTACT`, `OTHER`.
- `textEncrypted?`: **o texto é cifrado**, porque conversa de clínica é dado de saúde (LGPD).
- `externalId`: id da mensagem no WhatsApp, único por clínica. É o que impede gravar duas vezes.
- `status` (`MessageStatus`), `at`.
- Fila do envio: `acceptedAt`, `attempts`, `nextAttemptAt`, `claimedUntil`, `errorMessage`.

**`QuickReply`**: `title` (o atalho), `body` (aceita `{nome}`), `order`.

### Chave de conversa

O WhatsApp identifica celulares antigos sem o 9 (`55 11 9999-8888`), e o
cadastro tem com o 9. A chave de conversa é o telefone normalizado com o 9
acrescentado em celular de 8 dígitos. Gateway e app calculam igual: o código fica
duplicado, com testes pela mesma tabela. Para achar lead, o app procura pelas
duas formas do número.

## Como funciona

### Recebimento (gateway)

No `messages.upsert` (`notify` e `append`), para cada mensagem 1:1 de clínica com CRM:

1. Descreve a mensagem (função pura testada): texto, legenda, tipo de mídia ou botão
   tocado. Ignora reação, edição, apagamento e mensagens de protocolo.
2. Telefone do contato pelo jid (o mesmo `senderPhone` de hoje). Sem telefone, não grava (fica no rastro de debug).
3. Grava a conversa e a mensagem **sem duplicar** (`tenantId + externalId`).
   - Entrada: `unreadCount + 1` e `awaitingReply = true`.
   - Saída pelo celular ou pelo CRM: `unreadCount = 0` e `awaitingReply = false`, porque quem responde leu.
   - Automação não mexe em nenhum dos dois.
4. Origem de quem sai: o `send()` passa a gerar o id da mensagem antes de mandar e
   anota a origem (`AUTOMATION` ou `CRM`). Saída sem anotação é `PHONE`.
5. Conversa nova: avisa o app (`POST /api/whatsapp/conversation`) para ligar a lead ou paciente.

A confirmação de consulta por resposta continua igual e vem **antes** de gravar. Erro
ao gravar nunca derruba o socket nem a confirmação.

### Classificação (app)

`classifyConversation`:
- Tem lead aberto com esse número → liga ao lead (e ao paciente dele), `ACTIVE`.
- Tem paciente com esse número → liga ao paciente, `ACTIVE`.
- Senão → `INBOX`.

Também roda ao abrir a tela de Conversas para as que ficaram sem classificar
(o aviso do gateway pode falhar).

Criar lead com um telefone que já tem conversa liga a conversa e a tira da Entrada.
Converter o lead em paciente liga também o paciente.

### Entrada

Coluna fixa à esquerda no funil (só aparece quando há alguém nela) e filtro na
tela de Conversas. Cada cartão traz o nome do WhatsApp, o número mascarado e a
última mensagem. Ações:
- **Aceitar**: cria o lead na etapa Novo, com origem WhatsApp, e liga.
- **Recusar**: `DECLINED`. Se a pessoa escrever de novo, volta para a Entrada.
- **Ligar a lead ou paciente** existente: pela tela da conversa.

### Envio pelo CRM

1. A action cria a `ChatMessage` (`PENDING`, `externalId` gerado no app) e responde na hora.
2. Depois de responder, pede ao gateway `POST /sessions/:tenantId/chat` com o id.
3. O gateway **reserva** a linha (`claimedUntil`), decifra, manda com o mesmo id e marca `acceptedAt`.
4. Se não deu, uma rotina no gateway tenta de novo a cada 30s: no máximo 5 vezes, até 1 hora.
   Depois disso, `FAILED` com "Tentar de novo" na tela.
5. Os acks do WhatsApp (`messages.update`) avançam o status: enviada, entregue, lida.

Sem gateway configurado (desenvolvimento), a mensagem é marcada como enviada na hora.

### Telas

- **Conversas** (`/crm/conversas`, no menu do CRM com o total de não lidas):
  - lista à esquerda: filtros Todas / Minhas / Sem resposta / Entrada, busca por nome, não lidas em destaque;
  - conversa à direita: cabeçalho com nome, número mascarado e link para o lead ou paciente;
  - ações da Entrada; caixa de texto com respostas rápidas.
  - Atualiza a cada 4s enquanto a aba está visível.
  - Aviso quando o WhatsApp da clínica está desconectado.
- **Ficha do lead**: abas **Histórico | Conversa** na metade direita. A conversa usa o mesmo componente.
- **Configurações do CRM**: seção Respostas rápidas (criar, editar, apagar).
- "Minhas" = conversas cujo lead está com a pessoa.

### Acessibilidade

- Lista de conversas navegável por teclado; não lidas anunciadas no nome do item.
- Mensagens em lista (`<ol>`) com quem falou e a hora no texto.
- Mensagem nova anunciada em região `polite`.
- Respostas rápidas como combobox (`aria-expanded`, `aria-activedescendant`).
- Status da mensagem em texto ("Lida"), não só ícone.

## Segurança e LGPD

- Texto e telefone cifrados com a chave da clínica, igual ao resto.
- O gateway só grava para clínica com `crmEnabled` (consulta em cache de 60s).
- Tudo passa por `guardCrmAction` / `requireCrm` (CRM ligado, perfil, acesso da pessoa).
- O número inteiro continua escondido na tela (só os últimos 4 dígitos).

## Publicação

Banco antes (só `CREATE`), app depois, **gateway por último** no Fly.io. Gateway
antigo com banco novo: nada muda. Gateway novo com banco antigo: a gravação falha
em silêncio e a confirmação de consulta continua funcionando.
