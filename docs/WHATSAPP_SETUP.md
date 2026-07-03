# WhatsApp — como ligar as mensagens de verdade

O ClinicaIQ envia a confirmação de agendamento via **WhatsApp Cloud API (Meta)**.
Em dev o provider é um **mock** (só registra no banco). Para enviar de verdade,
configure as variáveis abaixo — o código já está pronto.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Valor |
|---|---|
| `WHATSAPP_PROVIDER` | `meta` |
| `WHATSAPP_ACCESS_TOKEN` | Token de acesso do app Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número (não é o telefone, é o ID numérico) |
| `WHATSAPP_VERIFY_TOKEN` | Uma senha qualquer que você inventa (usada no webhook) |
| `WHATSAPP_USE_TEMPLATES` | `false` para testar · `true` quando os templates forem aprovados |

Depois de salvar: **Deployments → ⋯ → Redeploy**.

## Passo a passo — teste GRÁTIS (número de teste da Meta)

1. Acesse https://developers.facebook.com → **My Apps → Create App** → tipo **Business**.
2. No app, adicione o produto **WhatsApp**. A Meta te dá:
   - Um **número de teste** (From) e o **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - Um **token temporário** (24h) → `WHATSAPP_ACCESS_TOKEN`
3. Em **To**, adicione seu celular como destinatário de teste (recebe um código no WhatsApp).
   O número de teste envia para até **5 números verificados** — suficiente pra validar.
4. Configure as variáveis na Vercel com `WHATSAPP_USE_TEMPLATES=false` e faça Redeploy.
5. **Importante (modo texto):** a Meta só permite texto livre dentro de uma "janela de
   24h" aberta pelo cliente. Antes de testar, **mande um "oi" do seu celular para o
   número de teste**. Depois, crie um agendamento no ClinicaIQ com o seu celular no
   cadastro do paciente — a mensagem chega formatada.

> Token temporário expira em 24h. Para um token permanente: Business Settings →
> System Users → crie um usuário de sistema → gere token com permissão
> `whatsapp_business_messaging`.

## Produção (quando for pra valer)

1. **Número próprio**: um chip/fixo que NÃO esteja registrado no app do WhatsApp
   (o Cloud API "toma" o número). Registre em WhatsApp → API Setup → Add phone number.
2. **Templates**: mensagens iniciadas pela clínica fora da janela de 24h exigem
   template aprovado. Crie em WhatsApp Manager → Message Templates (categoria
   *Utility*, aprovação geralmente em minutos):
   - `appointment_created` — aviso de agendamento criado
   - `appointment_confirmation` — lembrete com botões Confirmar/Remarcar/Cancelar
   - `quote_sent` — link do orçamento
   Depois ligue `WHATSAPP_USE_TEMPLATES=true`.
3. **Webhook (respostas do paciente)**: em WhatsApp → Configuration → Webhook:
   - Callback URL: `https://SEU-APP.vercel.app/api/webhooks/whatsapp`
   - Verify token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
   - Subscribe: `messages`
   Quando o paciente toca em **Confirmar**, o agendamento muda para CONFIRMADO sozinho.
4. **Custo**: conversas *utility* custam centavos por mensagem no Brasil; há cota
   gratuita mensal de conversas de serviço.

## Limitação atual (lembrete de 24h antes)

- A mensagem **"agendamento criado"** é enviada na hora, direto do app (funciona na Vercel).
- O **lembrete 24h antes** usa fila (BullMQ) e precisa de um worker rodando
  (`pnpm worker`) + Redis — a Vercel não roda processos contínuos. Para ativar:
  Redis gerenciado (ex. Upstash) + worker em um host (ex. Railway/Render).
  Sem isso, o restante funciona normalmente — só o lembrete agendado não dispara.
