# Lembretes e confirmações da agenda pela API oficial

## Por quê

Os avisos da agenda (agendamento criado e confirmação da véspera) saíam pelo
gateway de QR, parado. Nos 30 dias até 21/10/2026, 114 mensagens ficaram
"pendentes" e nenhuma saiu. A API oficial já funciona para as conversas do CRM
(`WhatsAppCloudAccount`); agora ela leva também os avisos da agenda, pelo
número da própria clínica.

## Decisões do dono

- A conexão da API oficial é da **clínica**, não do CRM: quem não assina o CRM
  conecta em WhatsApp (menu da gestão) e recebe só os avisos da agenda.
- A clínica **pode editar o texto**. Cada texto novo vira um modelo enviado à
  Meta; até ser aprovado, sai o último aprovado.

## Como funciona

### Modelos da agenda

- Dois propósitos: `APPOINTMENT_CREATED` e `APPOINTMENT_REMINDER`, os dois
  "Utilidade", `pt_BR`, com os botões de resposta rápida **Confirmar** e
  **Reagendar** (payloads `confirm` e `reschedule`, os mesmos de
  `CONFIRMATION_BUTTONS`).
- O texto da clínica (o mesmo de Configurações › Comunicação, com `{nome}`,
  `{clinica}`, `{data}`, `{hora}`, `{profissional}`, `{procedimento}`) vira o
  corpo do modelo: cada variável vira `{{n}}` na ordem em que aparece, e a
  ordem fica guardada (`MessageTemplate.varKeys`). Função pura e testada:
  `lib/agenda-templates.ts`.
- Regras da Meta conferidas antes de mandar: sem variável no começo nem no
  fim, sem duas variáveis coladas, até 1024 caracteres. Sem procedimento, a
  variável vai como "consulta" (a Meta não aceita parâmetro vazio).
- Nome do modelo: `dc_agendamento_<n>` / `dc_lembrete_<n>`, com `n` crescente
  (a Meta não deixa reaproveitar nome recém-apagado).
- Quando: ao conectar a conta e ao salvar um texto diferente do último
  enviado. A situação (em análise, aprovado, recusado e o motivo) aparece no
  painel de mensagens.
- A Meta avisa a aprovação pelo webhook (`message_template_status_update`,
  ligado à conta pelo `entry.id` = WABA). A tela e o relógio diário também
  perguntam à Meta enquanto houver modelo em análise.

### Envio

- `resolveProvider` (`lib/whatsapp.ts`): conta oficial ativa ganha de tudo. Com
  modelo aprovado do propósito, manda o modelo com os parâmetros na ordem de
  `varKeys` e os botões; sem modelo aprovado, registra "aguardando a Meta
  aprovar o texto" (fica no histórico, não fica pendente para sempre).
- O conteúdo gravado em `WhatsAppMessage` é o texto já preenchido, como hoje.
- Aniversário (marketing) e orçamento ficam como estão (fora deste passo).

### Respostas

- `/api/webhooks/meta` passa a atender clínica sem CRM: com CRM, a mensagem
  entra nas Conversas como hoje; com ou sem CRM, a resposta a um aviso da
  agenda confirma ou remarca (`resolveAppointmentByPhone` +
  `applyAppointmentResponse`).
- Resposta pelos botões da agenda (`confirm`/`reschedule`) não dispara o robô
  do CRM (`afterInbound` com `skipBot`).
- Status (enviada, entregue, lida, falhou) atualiza também `WhatsAppMessage`
  (`applyMessageStatus`), além das conversas.

### Conexão fora do CRM

- O núcleo da conta oficial sai de `crm/` para `lib/cloud-account.ts`
  (conta ativa, cliente, conectar, desligar, testar); `crm/cloud.ts` e
  `crm/cloud-admin.ts` passam a usar o `lib`. Assim a agenda não importa nada
  de `crm/`.
- A página WhatsApp da gestão (`/whatsapp`) mostra a API oficial: conectada
  (número, testar, desligar) ou o formulário de conexão (botão da Meta quando
  configurado; token manual). Permissão `configuracoes`.

## Banco (produção, só acréscimo)

`docs/producao/2026-10-21-lembretes-api-oficial.sql`:

```sql
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "purpose" TEXT;
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "varKeys" JSONB;
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "sourceText" TEXT;
CREATE INDEX IF NOT EXISTS "message_templates_tenantId_purpose_idx" ON "message_templates" ("tenantId", "purpose");
```

## Testes

- Unitários (por tabela): texto → modelo (variáveis, ordem, regras da Meta),
  parâmetros na ordem, parser do webhook com status de modelo.
- Banco: envio pela conta oficial com modelo aprovado; sem aprovado, registra
  e não manda; resposta pelo botão confirma o agendamento numa clínica sem CRM;
  salvar texto novo cria versão nova.
- E2E: painel de mensagens com a situação do modelo, com axe.
