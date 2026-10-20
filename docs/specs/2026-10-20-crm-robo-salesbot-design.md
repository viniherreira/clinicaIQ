# Robô do CRM no jeito do Salesbot do Kommo

Pedido do dono (20/10/2026): "o nosso bot igual o do Kommo, toda essa
estrutura de mensagens de robô igual a deles". Editor escolhido: **quadro com
setas**, como o Kommo (com uma vista em lista para teclado e leitor de tela).

Referência: documentação do Salesbot (support.kommo.com — salesbot overview,
triggers overview, create a salesbot; developers.kommo.com — salesbot dp).

## O que muda

Hoje o robô é um menu de botões com submenu, pergunta aberta e respostas
personalizadas por palavra. Passa a ser um **fluxo de passos numerados ligados
por setas**: cada passo tem saídas (ramos) e cada saída aponta para outro
passo. É o modelo do Kommo.

## Passos (os do Kommo que servem para clínica)

| Passo | O que faz | Saídas |
|---|---|---|
| **Mensagem** | Texto com variáveis; até 10 botões (3 aparecem como botões no WhatsApp, mais viram lista), cada botão com sinônimos; arquivo (API oficial). Pode só mandar ou **esperar resposta** com tempo-limite. | sem esperar: `seguir`; esperando: um ramo por botão, `outra resposta`, `sem resposta` (depois do tempo) |
| **Condição** | Vários casos, cada um com regras: mensagem do cliente (contém / igual / começa com / vazia), tag (tem / não tem), etapa, origem, campo personalizado (igual / preenchido / vazio), horário de atendimento (dentro / fora). Vale o primeiro caso que bater. | um ramo por caso + `senão` |
| **Esperar** (Pausa) | Espera chegar mensagem e/ou passar um tempo (minutos a dias). Vale o que acontecer primeiro. | `mensagem recebida`, `tempo esgotado` |
| **Validar** | Confere a última mensagem do cliente: e-mail, telefone, número, CPF, contém, igual, tamanho. | `válido`, `inválido` |
| **Ação** | Uma ou várias: mudar etapa (cria o lead se não houver), pôr/tirar tag, preencher campo (nome, e-mail, campo personalizado — com valor fixo ou a **última mensagem do cliente**), trocar responsável, criar tarefa, anotar no histórico, avisar a equipe (mensagem interna no histórico). | `seguir` |
| **Ir para o passo** | Volta ou pula para outro passo (evita setas cruzando o quadro). | — |
| **Iniciar outro robô** | Passa a conversa para outro robô, do começo. | — |
| **Rodízio** (Round Robin) | Alterna entre 2 a 10 saídas, em ordem (distribuir responsáveis, testar mensagens). | uma por opção |
| **Passar para a equipe** | Para o robô e deixa a conversa com a equipe (mensagem opcional). | — |
| **Parar o robô** | Termina. | — |

Fora (não serve para clínica ou exige o que não temos): código, widgets,
comentário do Instagram, inscrição Meta, formulário, webhook (fica para depois).

**Variáveis** nas mensagens: `{{nome}}`, `{{primeiro_nome}}`, `{{clinica}}`,
`{{telefone}}` (mascarado não — o do próprio contato), `{{campo:<nome>}}` e
`{{ultima_mensagem}}`. As antigas `{primeiro_nome}` continuam valendo.

## Gatilhos (quando começa)

Os de hoje continuam: **número novo** (primeira mensagem) e **palavra-chave**.
Entram os do Kommo que valem para clínica:

- **Lead entra numa etapa** (criado ou movido), em um ou mais funis/etapas;
- **Tag adicionada** ao lead;
- **Sem resposta do cliente há X horas** (a última mensagem foi da clínica).

Filtros (já existem como "Para quem"): só com estas tags / nunca com estas
tags, e horário. Gatilhos que mandam mensagem sem a pessoa ter escrito
respeitam a janela de 24 h da API oficial: fora dela, o passo de mensagem
precisa ter um **modelo aprovado** escolhido, senão o robô não começa.

## Editor

- **Quadro** (`@xyflow/react` 12.11.6, MIT): caixas numeradas, saídas com
  bolinhas que se ligam arrastando, zoom, mini-mapa, organizar automaticamente.
  Clicar numa caixa abre o **painel do passo** à direita. Barra de cima: nome,
  gatilho, ligado/desligado, Testar, Salvar.
- **"+ Passo"** em cada saída livre: escolhe o tipo e já liga.
- **Vista em lista** (mesmo dado): passos numerados, cada saída como um seletor
  "vai para o passo N". É a vista de teclado e leitor de tela (WCAG 2.1 AA).
- **Testar**: o simulador de hoje, com o passo atual destacado no quadro, botão
  "passar o tempo" (para testar "sem resposta" e "esperar") e as ações que
  aconteceriam no CRM.
- **Modelos prontos** reescritos no formato novo (boas-vindas, fora do horário,
  qualificação com perguntas, reativação de quem sumiu).

## Dados

- `ChatbotFlow.steps` passa a guardar `{ version: 2, start, steps: { [id]: passo },
  layout: { [id]: {x, y} }, trigger, audience, hours }`. Robôs antigos (sem
  `version`) são convertidos na leitura (menu → mensagem com botões; submenu e
  pergunta → mensagens que esperam; respostas personalizadas → condição na
  "outra resposta"). Ao salvar, gravam no formato novo.
- `Conversation.botWakeAt` (novo, opcional): quando o robô que espera resposta
  ou tempo deve acordar; o relógio do CRM acorda.
- `ChatbotFlow.state` (novo, jsonb `{}`): contador do rodízio.
- `ChatbotTrigger` ganha `STAGE`, `TAG` e `NO_REPLY`.
- Tudo acréscimo: `docs/producao/2026-10-20-robo-salesbot.sql`, rodado por mim
  antes do merge.

## Motor

`crm/flow-engine.ts`, puro e testado por tabela: recebe o fluxo, o estado
(passo atual), o evento (`começar`, `mensagem`, `tempo`) e o contexto (tags,
etapa, origem, campos, horário, variáveis) e devolve mensagens, ações e o novo
estado (esperando em qual passo, até quando). Anda pelos passos até precisar
esperar ou parar, com teto de 50 passos por vez (laço sem saída para). Ações
mudam o contexto na hora (uma tag posta vale para a condição seguinte).
`crm/bot.ts` executa, como hoje.

## Fases

1. Motor novo + conversão dos antigos + execução + banco (testes de unidade e de banco).
2. Quadro + painel + vista em lista + simulador destacando o passo.
3. Gatilhos novos (etapa, tag, sem resposta) e modelos prontos.
4. E2E + axe, SQL de produção, GUIA-DO-PROJETO.md, fotos.
