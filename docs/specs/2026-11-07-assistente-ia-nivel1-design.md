# Assistente de IA, Nível 1: perguntar e receber dados reais (07/11/2026)

**Pedido do dono:** a funcionária entra no DreamClin e, em vez de navegar por várias páginas, pergunta: "me passe os dados dos últimos 5 clientes atendidos", "quais pacientes estão com pagamentos pendentes?", "quantos agendamentos temos para amanhã?". A IA consulta os dados reais, responde e entende o contexto da conversa ("quais deles ainda não pagaram?").

A evolução tem três níveis:
1. **Assistente:** encontra informações. É esta spec.
2. **Copiloto:** prepara ações e pede confirmação.
3. **Agentes:** acompanha pendências e age dentro de limites.

O trabalho fica na branch `feat/ia` até o Nível 1 estar pronto, e então volta para a `main` por PR.

## Decisões

### 1. Piloto grátis, ligado por clínica
- `subscriptions.assistantEnabled` (boolean, padrão `false`), ligado à mão por SQL nas clínicas escolhidas. O `plans.assistantEnabled`, que já existe, também libera: liberado = assinatura OU plano. Quando houver preço, liga-se no plano.
- Sem item na cobrança. O preço é decidido depois, com o uso real do piloto.
- Clínica sem a chave não vê o botão, e a rota responde 404.

### 2. Só leitura, e só agenda, pacientes e financeiro
- Nada grava no banco da clínica: a IA não marca, não envia e não cadastra. Pedido de ação recebe "isso chega no próximo nível".
- **Fora:** prontuário (anamnese, evolução, odontograma, arquivos) e o CRM.

### 3. Ferramentas fixas, nunca SQL gerado pela IA
O Claude escolhe entre funções de consulta escritas por nós. A IA nunca escreve SQL, porque:
- CPF, telefone e texto das conversas são cifrados, e o SQL não consegue lê-los;
- o isolamento entre clínicas não pode depender de a IA acertar o `tenantId`;
- a permissão de cada papel precisa de um ponto fixo onde ser conferida.

Toda ferramenta:
- usa `getTenantClient(tenantId)`;
- exige uma `Capability` de `lib/permissions.ts`. Uma ferramenta que o usuário não pode usar **nem é enviada** ao Claude;
- devolve no máximo 50 linhas e avisa quando cortou;
- recebe datas como AAAA-MM-DD. O modelo recebe a data de hoje no fuso da clínica e converte "amanhã" e "mês passado" sozinho;

| Ferramenta | Responde | Permissão | Base |
|---|---|---|---|
| `buscarPacientes(nome?, ids?)` | "dados da Maria", "esses 5" | `pacientes` | `Patient` |
| `ultimosAtendidos(n)` | "últimos 5 atendidos" | `agenda` | `Appointment` ATTENDED, por `finishedAt`/`startTime` |
| `agendaDoDia(data, profissional?)` | "quantos agendamentos amanhã?" | `agenda` | `Appointment` do dia, sem CANCELLED |
| `horariosLivres(profissional, data)` | "horários da Dra. Ana" | `agenda` | `lib/availability` |
| `cancelamentos(minimo, periodo)` | "cancelaram mais de duas" | `agenda` | `Appointment` CANCELLED e MISSED por paciente |
| `semRetorno(meses)` | "não retornam há 6 meses" | `pacientes` | última visita ATTENDED antes do corte e nenhum agendamento futuro (a mesma ideia do recall) |
| `saldoDevedor(pacienteIds?)` | "quem está devendo?", "quais deles não pagaram?" | `financeiro` | orçamentos aprovados menos `Payment`, a mesma conta do recall |
| `faturamento(periodo)` | "faturamento do mês passado" | `financeiro` | `Payment.amount` por `paidAt`, igual ao relatório do financeiro |
| `listarProfissionais()` | traduz "Dra. Ana" para o id | `agenda` | `Professional` |

- O CPF não sai em nenhuma ferramenta. O telefone só sai com incluirContato: true, sempre sob a permissão pacientes.

### 4. O modelo
- **Claude Opus 5.5** (`claude-opus-5-5`), pela API da Anthropic com o SDK oficial `@anthropic-ai/sdk`. A chave fica em `ANTHROPIC_API_KEY` na Vercel.
- O loop roda no servidor, com o tool runner do SDK e resposta em streaming.
- O prompt do sistema e a lista de ferramentas são fixos e vão com cache (`cache_control`). Data de hoje, clínica e usuário entram depois do cache, como mensagem.
- Os fallbacks do lado do servidor ficam ligados (`fallbacks: "default"`), para uma recusa por engano não deixar a funcionária sem resposta.
- Custo estimado: cerca de US$ 0,06 (R$ 0,35) por pergunta com cache. Trocar para Sonnet 5.5 ou Haiku 5.5 é decisão do dono, depois de medir no piloto.

### 5. Contexto da conversa
- Cada pergunta leva o histórico inteiro da conversa, incluindo os resultados das ferramentas. É assim que "quais deles" e "esses 5" funcionam.
- O histórico só cresce: nada é editado no meio, o que mantém o cache e o pensamento do modelo válidos.

### 6. Histórico salvo por 30 dias, cifrado
Tabelas novas, com SQL à mão em `docs/producao/AAAA-MM-DD-assistente.sql` (com a data em que rodar em produção), com RLS ligado e `tenantId`:
- `assistant_conversations`: id, tenantId, userId, title, createdAt, updatedAt.
- `assistant_messages`: id, conversationId, tenantId, role, content (cifrado com a chave versionada, como o texto das conversas do CRM), tools (os nomes das ferramentas usadas), inputTokens, outputTokens, createdAt.

Regras:
- Cada usuário vê só as próprias conversas.
- O cron `reminders`, que já existe, apaga o que tem mais de 30 dias. Não gasta um cron novo do plano Hobby.
- Exportar e anonimizar o paciente (LGPD) não precisa mexer nisso: as conversas somem sozinhas em 30 dias. A Política de Privacidade passa a citar esse prazo.

### 7. Painel lateral
- Um botão fixo no `AppShell` da gestão (`space="clinic"`) abre um painel à direita, sem sair da página.
- O painel mostra a conversa atual, um botão "Nova conversa", a lista das conversas recentes e sugestões de perguntas.
- A resposta aparece em streaming, e as listas de pacientes viram tabela simples.
- Acessível no padrão do site (WCAG 2.1 AA): foco preso no painel, Esc fecha e há anúncio para o leitor de tela.

### 8. Rota
`POST /api/assistente`, protegida pelo Clerk (o middleware já cobre `/api/*`, fora webhooks e crons):
1. Usuário, clínica e papel pelo Clerk. Confere `assistantEnabled` e a assinatura ativa (`getTenantAccess`).
2. Limite: 100 perguntas por dia por clínica e 30 por hora por usuário, com `lib/rate-limit`.
3. Carrega a conversa, chama o Claude com as ferramentas permitidas e devolve a resposta em streaming.
4. Grava a pergunta e a resposta cifradas, e um `AuditLog` (`action: "assistant.query"`, `entity: "AssistantConversation"`) com as ferramentas chamadas e sem o conteúdo.
- `maxDuration = 60`.

### 9. Erros
- Pergunta fora das ferramentas: a IA diz que ainda não sabe responder isso. A pergunta fica gravada (é a própria conversa) e vira sugestão de ferramenta nova.
- A IA nunca inventa número. O prompt manda citar só o que veio das ferramentas e dizer quando a lista foi cortada.
- Erro da API (429, 5xx, rede): mensagem amigável ("o assistente está ocupado, tente de novo em instantes") e envio ao Sentry.
- Limite atingido: "limite de perguntas de hoje atingido".

### 10. Privacidade e Termos
- A Anthropic entra em `/privacidade` como operadora de dados (suboperadora) do assistente. Pela API, ela não usa os dados para treinar modelos.
- O assistente só aparece nas clínicas do piloto, que são avisadas antes de ser ligado.

## Fora do Nível 1
- Preparar mensagens, cobranças ou qualquer ação que grave (Nível 2).
- O CRM e o prontuário.
- A IA tomando iniciativa (Nível 3).
- Escolha de modelo por clínica, preço e item na cobrança.

## Testes
- **Ferramentas:** uma suíte `*.db.test.ts` por ferramenta, com Prisma real e casos por tabela. Inclui:
  - a clínica A não vê dados da B;
  - datas no fuso da clínica;
  - o corte em 50 linhas.
- **Permissões:** a lista de ferramentas por papel. A recepção sem financeiro não recebe `saldoDevedor` nem `faturamento`.
- **Loop:** cliente do Claude falso, que chama a ferramenta X e confere o resultado devolvido e a gravação. Também cobre a pergunta seguinte usando a anterior.
- **Rota:** sem chave do piloto dá 404; acima do limite dá 429; o histórico é de cada usuário.
- **Exclusão de 30 dias:** teste da função chamada pelo cron.
- **Playwright e axe:** o painel abre, envia a pergunta e mostra a resposta (com a API do Claude falsa), sem violação de acessibilidade.
- **Avaliação manual antes do piloto:** as 7 perguntas do pedido, numa clínica de teste com dados de exemplo.
