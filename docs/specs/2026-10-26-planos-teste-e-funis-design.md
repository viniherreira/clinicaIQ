# Planos por produto, teste de 14 dias e funis Captação → Agendados

Data: 26/10/2026. Decisões do dono, nesta ordem:
1. Agendar leva o card para o funil **Agendados**.
2. Contato novo **vira lead sozinho**; paciente não vira lead.
3. Preços da tabela abaixo.
4. O teste começa no plano escolhido no site; quem não assina fica em só leitura.

## 1. Funis

**Funis de toda clínica nova**
- **Captação**: Novo [NEW] · Em conversa · Fechou [WON] · Perdeu [LOST].
- **Agendados**: Avaliação agendada [SCHEDULED] · Desmarcou ou faltou [CANCELLED] · Compareceu [ATTENDED] · Em negociação [NEGOTIATION] · Fechou [WON] · Perdeu [LOST].

**Papéis da agenda**
- Os papéis SCHEDULED, CANCELLED, ATTENDED e NEGOTIATION valem **uma vez por clínica**, e não mais uma vez por funil.
- Cada evento da agenda tem uma etapa de destino: a etapa com aquele papel, em qualquer funil.
- NEW, WON e LOST continuam um por funil.

**Regras**, em `crm/automation.ts`, que segue puro:
- **Mesmo funil:** só avança, como já era.
- **Outro funil:** o card muda de funil. É a passagem da Captação para Agendados.
- **Agendou:** vai para a etapa SCHEDULED. De "Desmarcou" volta sempre.
- **Desmarcou ou faltou:** só se o card estiver na SCHEDULED e não houver outro agendamento futuro. Nesse caso vai para a CANCELLED, como já era.
- **Compareceu (novo):**
  - Da SCHEDULED ou da CANCELLED, vai para a ATTENDED, se ela existir.
  - Sem orçamento aberto, mantém a tarefa "Enviar orçamento".
- **Orçamento criado:** vai para a NEGOTIATION.
- **Aprovado:** vai para a WON do funil do card.
- **Perder:** nunca é automático.

**Configurações do CRM › Funis › "Agenda e orçamentos"**
- Um seletor "Funil › Etapa" para cada evento: Agendou, Desmarcou ou faltou, Compareceu, Orçamento criado.
- Trocar a etapa move o papel. A etapa antiga fica sem papel, e por isso volta a poder ser apagada.
- Um funil que tem papel da agenda não pode ser apagado. A mensagem diz onde trocar.

**Clínicas existentes**
- Continuam com o "Funil principal", que já tem todos os papéis. Nada quebra.
- A conversão para Captação + Agendados é um script à parte e só roda com o "pode" do dono.

## 2. Lead automático

- **Número novo:** já vira lead em Novo (`crm/inbound.ts`). Fica assim.
- **Fim do formulário "Criar lead / Criar negócio"** ao lado da conversa:
  - **Paciente sem negócio aberto:** cartão do paciente com "Ficha do paciente" e um botão de um clique, "Abrir negócio". O negócio é criado em Captação › Novo.
  - **Conversa arquivada ("Não é lead") que voltou a escrever:** volta para a lista como ACTIVE, **sem** lead, com o aviso "Sem negócio aberto" e o botão "Abrir negócio". Se virasse lead sozinha, o spam voltaria para o funil a cada mensagem.
  - **Entrada:** some a aba. Uma conversa antiga em INBOX vira lead quando a tela classifica as pendentes.
  - **"Não é lead"** (spam ou engano): fica na ficha do lead aberto pela conversa. Apaga o lead e arquiva a conversa.

## 3. Produtos e preços

**Os três produtos**
- **Agenda:** gestão clínica.
- **CRM:** captação.
- **Completo:** os dois, integrados.

**Tamanhos**
- Essencial: 1 profissional · 1 usuário no CRM.
- Profissional: até 3 profissionais · 3 usuários.
- Clínica: ilimitado · 5 usuários.
- Usuário extra no CRM: R$ 39.

**Preços por mês**

| Tamanho      | Agenda | CRM   | Completo |
|--------------|--------|-------|----------|
| Essencial    | 139    | 119   | 199      |
| Profissional | 239    | 219   | 359      |
| Clínica      | 339    | 319   | 519      |

**Banco** (só acréscimos)
- `plans.crmOnlyPriceCents`.
- `subscriptions.clinicEnabled` (padrão `true`).
- `crmEnabled` já existe.
- O produto se deriva das duas bandeiras.

**Mensalidade**
- `(clinicEnabled ? plano : 0) + CRM`.
- O CRM custa o pacote quando vem junto com a Agenda, ou `crmOnlyPriceCents` quando é sozinho, mais os usuários extras.
- No produto só CRM, o CRM sempre conta: o teste de 14 dias do CRM é só para quem acrescenta o CRM à Agenda.

**Clínica só com o CRM**
- `getTenantModules().clinic = clinicEnabled || cortesia`.
- O espaço da gestão só abre Configurações e Plano. O resto redireciona para `/crm`, com o caminho lido do cabeçalho `x-pathname` posto pelo middleware.
- O seletor de módulos some.
- No CRM somem "Agendar" e "Virar paciente", e a área "Agenda e orçamentos" das configurações.

## 4. Teste grátis e troca de plano

**Cadastro**
1. O site leva para `/sign-up?plano=completo&tamanho=profissional`.
2. O Clerk volta para `/onboarding` com os mesmos parâmetros.
3. O onboarding mostra o plano do teste já marcado, e a pessoa pode trocar.
4. A clínica nasce TRIALING com esse produto e tamanho.
5. Sem parâmetro, vem marcado Completo Profissional.

**Durante o teste**
- Escolher um plano abre duas opções:
  - **Assinar agora.** A primeira cobrança vence no fim do teste.
  - **Continuar testando com este plano.** Troca grátis e na hora.

**Fim do teste**
- **Assinou:** vale a tolerância de 7 dias da fatura, como já era.
- **Não assinou:** só leitura na hora, com a mensagem "Seu teste grátis terminou. Escolha um plano para voltar a usar. Seus dados estão guardados."
- O aviso aparece nos últimos 5 dias, como já era.

**Depois de assinar**
- **Trocar** de produto ou tamanho vale na hora. O valor novo entra na próxima fatura, sem proporcional.
- **Descer** confere os limites: profissionais ativos.
- **Cancelar** mantém o acesso até o fim do período pago, como já era.

## 5. Página de vendas

**Estrutura**
1. Hero com a promessa e o CTA "Começar 14 dias grátis".
2. Os três produtos.
3. A integração: o funil que anda sozinho.
4. Recursos de cada produto.
5. WhatsApp oficial.
6. Preços com a chave Agenda / CRM / Completo e o cálculo da economia do Completo.
7. Comparativo.
8. Perguntas: teste, troca, cancelamento, Meta.
9. CTA final.

**Regras**
- Preços lidos do banco, como hoje.
- Nada de depoimento ou número inventado.
