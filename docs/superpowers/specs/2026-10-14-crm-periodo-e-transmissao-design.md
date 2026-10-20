# CRM: período por data no filtro e na transmissão

Data: 2026-10-14
Pedido do dono: o filtro de data como o do Kommo (Criada | Fechadas, calendário de
um dia a outro), o painel de filtros mais bonito e a mesma busca servindo para
puxar a lista de uma transmissão.

## O que muda para quem usa

- **Período** no painel de filtros: *Criados* (dia em que o lead entrou) ou
  *Fechados* (dia em que foi ganho ou perdido). Atalhos com os dias ao lado
  (hoje, ontem, últimos 7 e 30 dias, este mês, mês passado, este ano) ou um
  calendário: clique no primeiro e no último dia, ou digite dd/mm/aaaa.
- **Filtros ligados viram etiquetas** na busca, cada uma com o seu "x".
- O painel **conta quantos leads** a busca vai mostrar antes do "Aplicar" e tem
  **"Transmissão para estes leads"**. A barra do topo também ganhou o botão
  **Transmissão**.
- **Transmissão** recebe a busca inteira: período (criados ou fechados), tarefas,
  valor de venda, nome e "Meus leads", além do que já ia (funil, etapa, tags,
  origem, responsável, situação). Ao lado, o resumo dos critérios em palavras.
- **Lista**: datas completas (dd/mm/aaaa), coluna "Fechado em" para ganhos e
  perdidos, e a contagem real de leads (antes, a lista parava em 500 e o topo
  contava só os carregados).
- **Card do funil**: título em até duas linhas e data curta no ano corrente.

## Decisões

- **URL**: `periodo=hoje|ontem|7d|30d|mes|mes-passado|ano` (relativo, um link
  salvo continua valendo) ou `de=AAAA-MM-DD&ate=AAAA-MM-DD`; `data=fechado` para
  fechamento. O `criado=7d` dos links antigos continua funcionando.
- **Fechados não ficam no quadro** (o quadro só tem leads abertos): período de
  fechamento no quadro abre a Lista com `situacao=todos`. Na lista, "Abertos"
  com período de fechamento vira "Todos"; clicar em "Abertos" volta a contar
  pela entrada.
- **Dias no horário da clínica** (Brasília, UTC−3 o ano todo), inclusivos nas
  duas pontas. Lógica pura em `crm/period.ts`, usada pela busca e pelo público.
- **Público da transmissão guarda dias fixos**: a transmissão agendada para
  amanhã manda para quem estava no período escolhido hoje. Transmissões antigas
  (com `createdFrom/createdTo`) são lidas com o mesmo período.
- **Tarefas no banco**: "sem tarefa" e "atrasadas" passaram de filtro em memória
  (depois de carregar 1.000 leads) para o `where` do Prisma, com as mesmas regras
  de `taskStatus`. Assim a contagem é exata e o limite de carga não esconde lead.
- **Calendário acessível**: tabela com nomes dos dias, foco itinerante (setas,
  PageUp/PageDown, Home/End, Enter), Esc fecha só o calendário, Tab circula no
  painel. Abre num portal (o painel de filtros corta o que passa da borda); quem
  tem "clique fora" próprio ignora `[data-crm-popover]`.

## Conferência

- Unitários: `crm/period.test.ts` (18), `crm/audience.test.ts` (13),
  `crm/filters.test.ts` (5). Os testes de banco precisam do Postgres local.
- axe (WCAG 2.1 AA) sem violações no painel de filtros, no calendário aberto
  (desktop e celular) e na nova transmissão, numa vitrine local sem banco nem
  Clerk. Teclado conferido com Playwright.
- `tsc`, lint e `next build` sem erros.
- Falta rodar os E2E (`pnpm --filter @clinicaiq/web test:e2e`) na máquina com o
  banco local: os de filtro e transmissão mantêm os mesmos nomes acessíveis.
