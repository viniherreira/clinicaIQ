# Plano — API oficial, Transmissões, Robô e automações

Spec: [`docs/superpowers/specs/2026-10-11-crm-api-oficial-transmissoes-robo-design.md`](../specs/2026-10-11-crm-api-oficial-transmissoes-robo-design.md)
Branch: `feat/crm-etapa1`. Mesmas regras: um commit por tarefa, testes verdes, banco só o local.

### 1. Schema
Todas as tabelas e colunas da spec. Diff só de acréscimos.

### 2. Cloud API (`packages/whatsapp`)
Cliente por clínica (texto, botões, lista, modelo, marcar lida, mídia, modelos, troca de
código, inscrição no webhook, registro). Leitura do webhook e assinatura. Testes com
`fetch` simulado e por tabela.

### 3. Canal e entrada pela Cloud API (app)
`crm/channel.ts`, `crm/chat-ingest.ts` (gravar mensagem e status no app),
`/api/webhooks/meta`, despacho pela Cloud API com a janela de 24 h, mídia sob
demanda, `/api/crm/tick`. Gateway: não grava nem envia para clínica no oficial, avisa o
app a cada mensagem recebida, `lastInboundAt`, novas origens, botões, relógio de 1
minuto.

### 4. Telas do canal
`/crm/whatsapp`: canal, cadastro incorporado, conexão de teste, modelos. Caixa de texto
com janela de 24 h e modelos; mídia na conversa.

### 5. Transmissões
Regras (público, saída espaçada, cancelar, números), opt-out por "SAIR", telas.

### 6. Automações por etapa
`StageAutomation` e `AutomationRun`, ganchos em `createLead` e `moveLead`, execução
pelo relógio, aba Automações.

### 7. Robô
Motor puro (gatilho, escolha da opção, ações), ganchos na entrada, aba Robô.

### 8. E2E, acessibilidade e documentação
