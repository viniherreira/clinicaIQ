# CRM — Pacote A: dados e lista (no jeito do Kommo)

Data: 2026-10-16 · Aprovado pelo dono na conversa ("aprovar, mas só traz do Kommo o que for relevante").

## Objetivo

Trazer do Kommo o que mais pesa no dia a dia de quem vende: campos personalizados,
lista com colunas e ações em massa, exportar e importar planilha (inclusive a do
Kommo) e as Conversas com o lead completo ao lado. Só o que for relevante para
clínica; nada de copiar tela por copiar.

Fora deste pacote: filtro de transmissão por campo, tela de Contatos/Empresas,
tipos de tarefa e calendário (pacote B), gatilhos novos e mesclar duplicados
(pacote C), relatórios (pacote D), Instagram/Messenger e formulário do site (E), IA (F).

## 1. Campos personalizados

**Dados.** Modelo novo `LeadField` (com `tenantId`): `name`, `type`
(`TEXT`, `NUMBER`, `DATE`, `SELECT`, `MULTISELECT`, `BOOLEAN`), `options String[]`
(só listas), `order`, `showOnCard Boolean`, `active Boolean`. Os valores ficam no
próprio lead: `Lead.fields Json @default("{}")`, um mapa `fieldId → valor`
(texto, número, `AAAA-MM-DD`, opção, lista de opções, `true/false`). Campo
desativado some das telas mas o valor fica guardado. Limite: 40 campos ativos.

**Regras puras** (`crm/custom-fields.ts`, testadas por tabela): normalizar e
validar um valor pelo tipo (número com vírgula, data brasileira, opção que não
existe é recusada), formatar para mostrar, montar o filtro do Prisma por caminho
JSON, comparar valor antigo e novo para o histórico.

**Telas.**
- CRM › Configurações: aba **Campos** (criar, renomear, tipo, opções, ordem, "mostrar no card", desativar). Só `crm_config`.
- Ficha do lead (e o painel ao lado da conversa, que é o mesmo `LeadPanel`): seção **Campos**, editável no lugar. Cada mudança vira atividade `FIELD_CHANGED` no histórico ("Convênio: Amil → Unimed").
- Card do funil: até 3 campos com "mostrar no card", em linha pequena.
- Novo lead: os campos ativos, opcionais.
- Filtros (`crm/filters.ts`): campos de lista e sim/não entram no painel de filtros e na URL (`campo_<id>=valor`). Valem no quadro e na lista.
- Robô: a pergunta pode guardar a resposta num campo (`saveTo: 'field:<id>'`), como o Salesbot.

## 2. Lista de leads

- **Colunas escolhidas**: negócio, pessoa, telefone (mascarado), etapa, funil, responsável, valor, origem, tags, criado em, próxima tarefa e os campos ativos. A escolha fica no cookie `crm-colunas` (lido no servidor).
- **Ordenar** clicando no cabeçalho: recentes, nome, valor, etapa, criado em.
- **Páginas** de 100 (`pagina=`), com o total do filtro.

## 3. Ações em massa

- Caixa de seleção em cada linha, "selecionar esta página" e "**selecionar todos os N do filtro**" (como o Gmail). A seleção "todos do filtro" vai ao servidor como os próprios filtros, não como lista de ids.
- Ações: mover de etapa (qualquer funil), trocar responsável, pôr tag, tirar tag, criar tarefa (texto, prazo, responsável), preencher um campo, marcar como perdido (motivo obrigatório) e **excluir** (só `crm_config`; exclusão lógica, `deletedAt`).
- Cada lead passa pelas mesmas regras de sempre (`moveLead`, `setLeadTags`, `createTask`…), com histórico. **Mover em massa não roda as automações das etapas**, a não ser que a pessoa marque "rodar automações".
- Até 2 mil leads por ação. Resposta com o resumo ("312 movidos; 3 não: motivo") e auditoria `LEADS_BULK_<AÇÃO>` com a quantidade.
- Regras em `crm/bulk.ts` (testado contra o banco).

## 4. Exportar

- Botão **Exportar** na lista: CSV com `;` e BOM UTF-8 (abre direto no Excel em português), com o filtro e a situação atuais e todas as colunas, inclusive campos.
- Só `crm_config`, porque sai o telefone completo. Grava `LEADS_EXPORTED` na auditoria com a quantidade e os filtros.
- Rota `GET /crm/leads/exportar?…filtros` (route handler), até 20 mil linhas.
- Escrita do CSV em `crm/csv.ts` (puro, testado: aspas, `;`, quebra de linha, números e datas).

## 5. Importar (Kommo ou planilha própria)

Tela **CRM › Leads › Importar**, só `crm_config`. Aceita CSV e XLSX (`read-excel-file`, MIT), até 5 mil linhas e 5 MB.

1. **Arquivo** → o navegador lê e mostra as colunas.
2. **Correspondência de colunas**: automática para os nomes que o Kommo usa em português, inglês e espanhol (título do lead, venda/orçamento, funil, etapa/status, responsável, criado em, fechado em, tags, contato principal/nome, celular/telefone comercial, e-mail, empresa, nota); editável. Coluna desconhecida: **criar campo personalizado** (tipo texto, ou lista se tiver até 30 valores distintos) ou ignorar.
3. **Funil e etapa**: casa pelo nome (sem acento e maiúscula) com os nossos; opção "criar funis e etapas que faltam". "Venda ganha"/"Closed - won" → ganho; "Venda perdida"/"Closed - lost" → perdido (motivo "Importado"). Sem coluna de etapa: escolher o destino.
4. **Duplicados**: telefone igual ao de um lead aberto → pular, atualizar (preenche o que estiver vazio e soma as tags) ou criar mesmo assim.
5. **Prévia** ("1.240 novos, 35 duplicados, 12 sem telefone") e importar em lotes de 200 por chamada, com barra de progresso.

Regras: responsável casa por nome ou e-mail da equipe (senão fica sem); tags separadas por vírgula, cria as que faltam; data de criação original é mantida; notas viram atividade `NOTE`; origem "Importado do Kommo" (`OUTRO`) quando não houver. **Nenhuma automação, robô ou mensagem dispara na importação.** Auditoria `LEADS_IMPORTED`.

Regras puras em `crm/import-map.ts` (sinônimos de colunas, leitura de valor, data e telefone, status ganho/perdido), testadas por tabela; gravação em `crm/import.ts` (testado contra o banco).

## 6. Conversas com o lead completo (Kommo)

- O lead ao lado da conversa aparece a partir de telas médias-grandes (`lg`); nas menores, um botão "Lead" abre o mesmo painel por cima.
- No topo do painel: nome, **tags em destaque** (pôr e tirar ali), etapa e funil; depois os campos personalizados.
- Conversa da **Entrada** (sem lead): o painel mostra o contato e "**Criar lead**" com funil, etapa e tags, ou "Recusar".
- Na lista de conversas: as tags do lead em cada item e **filtro por tag**.

## Banco

Só acréscimos: tabela `lead_fields`, coluna `leads.fields jsonb default '{}'`,
valor `FIELD_CHANGED` no enum `LeadActivityType`. SQL em
`docs/producao/2026-10-16-crm-campos.sql`, rodado por mim antes do merge.

## Testes

Unitários (tabela): `custom-fields`, `csv`, `import-map`, filtros novos.
Banco: `bulk`, `import`, campos na criação e no histórico.
E2E: criar campo e preencher na ficha; escolher colunas; mover em massa;
exportar (baixa o arquivo, sem permissão para recepção); importar um CSV no
formato do Kommo; Conversas com tags e "Criar lead". Acessibilidade (axe) em
todas as telas novas.
