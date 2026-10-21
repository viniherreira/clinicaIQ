# CRM — API oficial, Transmissões, Robô e automações por etapa

Data: 2026-10-11
Status: decidido pelo time (o dono pediu para seguir com todas as etapas de uma vez)

Junta as etapas 2b, 3 e 4 do roadmap. Tudo continua só para clínicas com o CRM
ligado, e nada disso muda a agenda.

## Decisões

- **API oficial pronta para ligar.** O código da Cloud API da Meta fica pronto e
  testado, mas só funciona quando a Meta aprovar o ClinicaIQ como Tech Provider e as
  variáveis da Meta estiverem configuradas. Até lá, o CRM continua pelo QR code.
- **Um canal por clínica.** Com a conta oficial conectada e ativa, as conversas do
  CRM entram e saem pela Cloud API, e o gateway de QR deixa de gravar e de enviar
  conversas dessa clínica. Assim a mesma mensagem nunca aparece duas vezes. Os
  lembretes da agenda continuam como estão.
- **Coexistência.** O cadastro pede a coexistência, para o celular da clínica
  continuar funcionando. O que a recepção escreve no app WhatsApp Business chega como
  "eco" e aparece na conversa como "Pelo celular".
- **Conexão de teste.** Dono e admin podem colar à mão o token, o número e a conta da
  Meta. Serve para testar com o número de teste que a Meta dá a qualquer app, antes
  da aprovação.
- **Janela de 24 horas** (regra da Meta): fora dela, na Cloud API, só dá para
  mandar um modelo aprovado. A caixa de texto avisa e oferece os modelos.
- **Modelos (templates)** sincronizados da Meta e criados pela tela, com variáveis
  `{{1}}`… Os modelos ficam por clínica.
- **Mídia na Cloud API:** a foto, o áudio e o documento recebidos abrem no CRM. O
  app busca na Meta na hora; nada é guardado. No QR continua "abra no celular".
- **Transmissões** (etapa 3), para leads, filtrados por etapa, tag, origem e
  responsável.
  - Respeitam o "SAIR" da pessoa (`Lead.whatsappOptOut` e o opt-out do paciente).
  - No QR, saem devagar (12 a 28 s entre mensagens e pausa a cada 20), como as
    campanhas.
  - Na Cloud API, exigem um modelo aprovado de marketing ou utilidade.
  - Podem ser agendadas e canceladas.
  - Números: enviadas, entregues, lidas, respondidas e falhas.
- **Automações por etapa** (o "funil digital" do Kommo): quando um lead entra numa
  etapa, a clínica pode mandar uma mensagem, criar uma tarefa, pôr uma tag ou trocar o
  responsável, na hora ou depois de X minutos.
  - Se o lead já saiu da etapa quando chegar a hora, a ação não roda.
- **Robô por botões** (etapa 4): um menu com até 6 opções. Cada opção:
  - responde um texto;
  - pode abrir um submenu;
  - pode agir: criar o lead em uma etapa, pôr uma tag, passar para um atendente.

  Gatilhos:
  - **contato novo**: a primeira mensagem de um número desconhecido;
  - **palavra-chave** ("menu", "oi"…).

  O robô para quando alguém da clínica responde, quando a pessoa pede atendente,
  depois de 2 respostas que ele não entende ou depois de 24 horas parado.
  - Na Cloud API, as opções vão como botões (até 3) ou lista. No QR, como texto
    numerado ("1 - Agendar avaliação"), que sempre funciona.
- **Relógio do CRM:** o gateway, que fica sempre ligado, chama `/api/crm/tick` a cada
  minuto. Esse relógio roda as automações com atraso, as transmissões agendadas, o
  envio da Cloud API e o fim dos robôs parados.
  - Sem gateway (desenvolvimento), os testes chamam as mesmas funções direto.

## Dados (só acréscimos)

- `WhatsAppCloudAccount` (uma por clínica): `wabaId`, `phoneNumberId` (único no
  sistema, para saber de quem é o webhook), número e nome, token cifrado,
  `coexistence`, `active`, `status`, `lastError`.
- `MessageTemplate`: nome, idioma, categoria, situação na Meta, corpo, número de
  variáveis, componentes.
- `Conversation`:
  - `lastInboundAt`: a janela de 24 horas;
  - `botFlowId`, `botStepId`, `botStartedAt`, `botMisses`: o robô ativo.
- `ChatMessage`: `templateName`, `mediaRef` e `mimeType` (mídia da Cloud API),
  `buttons` (opções do robô).
- `ChatOrigin` ganha `BROADCAST` (transmissão) e `BOT` (robô e automações).
- `Lead.whatsappOptOut`.
- `Broadcast` e `BroadcastRecipient`.
- `StageAutomation` e `AutomationRun`.
- `ChatbotFlow`.

## Variáveis da Meta (só quando a aprovação sair)

| Variável | Para quê |
|---|---|
| `META_APP_ID` | o app do ClinicaIQ na Meta |
| `META_APP_SECRET` | trocar o código do cadastro pelo token, conferir a assinatura do webhook |
| `META_ES_CONFIG_ID` | a configuração do cadastro incorporado |
| `META_WEBHOOK_VERIFY_TOKEN` | o aperto de mão do webhook |
| `META_GRAPH_VERSION` | versão da Graph API (padrão `v23.0`) |

Webhook novo: `/api/webhooks/meta`. O antigo (`/api/webhooks/whatsapp`, um número
fixo) fica como está.

## Telas

- **CRM → WhatsApp** (`/crm/whatsapp`): o canal da clínica (QR ou oficial), conectar
  pela Meta, conexão de teste, desligar; os modelos (sincronizar e criar).
- **Conversas:**
  - aviso de janela fechada, com a escolha de modelo;
  - mídia aberta na Cloud API;
  - origens "Transmissão" e "Robô".
- **CRM → Transmissões** (`/crm/transmissoes`): a lista, uma nova (público com a
  contagem ao vivo, mensagem ou modelo, agora ou agendada) e os detalhes com os
  números.
- **Configurações do CRM:**
  - aba **Automações**, por etapa;
  - aba **Robô**: menus, opções, ações e gatilhos.

## Segurança

- O token da Meta é cifrado com a chave da clínica e nunca vai para a tela.
- O webhook confere `X-Hub-Signature-256`. Sem `META_APP_SECRET`, ele recusa tudo.
- `/api/crm/tick` exige o segredo do gateway (`WHATSAPP_GATEWAY_TOKEN`) ou o
  `CRON_SECRET`.
- Conectar, desligar, mexer em modelos, robô e automações exige `crm_config`. Enviar
  transmissão exige `crm_config`.
