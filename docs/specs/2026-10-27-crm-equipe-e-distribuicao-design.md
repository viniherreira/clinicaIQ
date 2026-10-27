# CRM: equipe, cargos e distribuição de leads (27/10/2026)

**Pedido do dono:** "pode deixar o CRM para todo mundo… quero as funcionalidades iguais às do Kommo… no CRM tem que ver quais usuários são quais cargos e distribuir as mensagens por usuários".

## Decisões

### 1. O CRM é da equipe toda
- O perfil Profissional passa a entrar no CRM. Antes só entravam dono, administração e recepção.
- Quem aceita convite numa clínica com o CRM ligado já entra com acesso, e a mensalidade é recalculada. A chave de acesso continua em Configurações › Equipe, para a clínica desligar e não pagar usuário a mais.
- Em produção, por autorização do dono:
  - o CRM foi ligado na clínica de cortesia;
  - toda a equipe ativa das clínicas com CRM ganhou acesso.

### 2. Cargos no CRM (como os papéis do Kommo)
`users.crmRole` fica separado do perfil da clínica. Nulo significa o padrão do perfil.

| Cargo | Padrão de | Pode |
|---|---|---|
| Gestor | dono (sempre) e administrador | tudo, mais configurar: funis, robôs, modelos, WhatsApp, equipe e distribuição; excluir, importar e exportar |
| Atendente | recepção e profissional | atender e mover os negócios de todos |
| Atendente (só os dele) | escolha do gestor | vê só os negócios, conversas e tarefas dele, e os que estão sem responsável |

- O `crm_config` agora sai do cargo, e não mais do perfil. Ver `lib/crm-roles.ts` e `crm/guard.ts`.
- Ninguém tira o próprio cargo de Gestor, e o dono não perde o dele.
- O "só os dele" vale nas listas: funil, Leads, Conversas, Tarefas, Painel e o número de não lidas. Vale também em toda action que mira um negócio ou uma conversa (`crm/scope.ts`). Esconder na tela não basta.

### 3. Responsável da conversa
- `conversations.assignedToId` fica sempre junto com o responsável do negócio aberto (`crm/assignment.ts`):
  - transferir a conversa leva o negócio junto;
  - trocar o responsável do negócio leva as conversas dele.
- Conversa de paciente sem negócio tem o responsável dela.
- Nas Conversas:
  - o cabeçalho mostra "Atende:", com troca pela lista da equipe;
  - conversa sem responsável ganha o botão "Assumir";
  - abas: Todas, Minhas (as que você atende), Sem dono e Sem resposta.

### 4. Distribuição (CRM › Equipe e distribuição)
- Começa desligada: a clínica escolhe quando ligar.
- Modos:
  - **Rodízio:** recebe quem recebeu há mais tempo.
  - **Menos ocupado:** recebe quem tem menos negócios abertos; no empate, vale o rodízio.
- "Só para quem está disponível": quem marcou Ausente na chave do topo do CRM fica de fora. Se ninguém estiver disponível, distribui entre todos que recebem.
- Por pessoa, dá para escolher se ela recebe leads.
- Quando roda: a cada mensagem de contato (`afterInbound`).
  - A conversa já tem responsável: fica com ele.
  - O negócio aberto tem dono: a conversa vai para esse dono. Cliente que volta fica com quem já atendia.
  - Senão, é a vez de alguém da distribuição.
- Concorrência: a vez é marcada com escrita condicional em `crmLastAssignedAt`. Duas mensagens chegando juntas não caem na mesma pessoa.
- No robô e nas automações por etapa, "Trocar o responsável" ganhou a opção "Distribuir pela equipe".
- Ferramentas do gestor:
  - "Distribuir agora" para as conversas sem responsável;
  - "Passar carteira" de alguém (negócios abertos, conversas e tarefas) para outra pessoa ou pela distribuição. É o equivalente de desativar um usuário no Kommo.

## Banco
- `docs/producao/2026-10-27-crm-equipe-e-distribuicao.sql`:
  - tipo `CrmRole`;
  - colunas em `users` e `conversations`;
  - índice e chave estrangeira;
  - preenchimento do responsável das conversas a partir do negócio;
  - a parte 3, autorizada pelo dono.
- Já aplicado em produção em 27/10/2026.

## Próximos passos estilo Kommo (fora deste pacote)
- Grupos de usuários (equipes) com visão "do grupo".
- Direitos por etapa.
- Lista de contatos separada dos negócios.
- Notificação para o responsável quando recebe um lead.
- Metas de vendas por pessoa.
- Horário de trabalho por pessoa na distribuição.
