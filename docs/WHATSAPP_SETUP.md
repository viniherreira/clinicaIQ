# WhatsApp em produção (número real + templates)

Guia para sair da sandbox e enviar mensagens **que entregam de verdade** — confirmação
de agendamento, lembrete e orçamento — usando templates aprovados (mensagens iniciadas
pela clínica, sem depender da janela de 24h).

O código já está pronto: com `WHATSAPP_USE_TEMPLATES=true` o app envia o template
estruturado com as variáveis `{{1}}..{{5}}`. **Os textos abaixo precisam ser submetidos
na Meta exatamente com essas variáveis nessa ordem** — senão o envio falha.

---

## Parte A — Número real (Etapa 2 / Configuração da produção)

1. Meta for Developers → seu app → **WhatsApp → Configuração da API**
2. Seção **"Etapa 2. Configuração da produção"** → **Adicionar número de telefone**
3. ⚠️ O número **não pode ter WhatsApp ativo** (nem WhatsApp normal, nem Business). Use um
   **chip dedicado** ou apague a conta de WhatsApp do número antes.
4. Preencha nome de exibição + categoria e **verifique por SMS/ligação**
5. Anote o **Phone Number ID** novo (é diferente do da sandbox)

## Parte B — Token permanente (System User)

O token da tela de teste expira em ~24h. O permanente **nunca expira**:

1. **business.facebook.com/settings** → **Usuários → Usuários do sistema** → **Adicionar**
2. Crie um System User com papel **Admin**; associe o **app** e a **conta do WhatsApp (WABA)**
3. **Gerar novo token** → escolha o app → permissões:
   `whatsapp_business_messaging` **e** `whatsapp_business_management`
4. Copie o token (não expira) e guarde num lugar seguro

## Parte C — Criar e aprovar os 3 templates

Meta → **WhatsApp Manager → Modelos de mensagem → Criar modelo**.
Para os três: **Categoria = Utilidade (Utility)** · **Idioma = Português (BR)**.
Cole o corpo exatamente como abaixo (com as `{{n}}`), e informe os exemplos.

### 1) `appointment_created` — confirmação ao agendar
```
Olá, {{1}}! ✅ Seu agendamento na {{2}} foi registrado.

📅 {{3}} às {{4}}
👩‍⚕️ {{5}}

Qualquer dúvida, é só responder por aqui. Até breve!
```
Exemplos: `{{1}}` Maria · `{{2}}` Clínica Sorriso · `{{3}}` sexta-feira, 10/07 · `{{4}}` 14:00 · `{{5}}` Dra. Ana (Limpeza)

### 2) `appointment_confirmation` — lembrete (dia anterior)
```
Olá, {{1}}! 🗓️ Lembrete do seu horário na {{2}}:

📅 {{3}} às {{4}}
👩‍⚕️ {{5}}

Você confirma sua presença? Responda CONFIRMAR para confirmar ou REMARCAR se precisar mudar.
```
Exemplos: os mesmos acima. *(O paciente responde em texto; o webhook já entende
"confirmar"/"remarcar"/"cancelar".)*

### 3) `quote_sent` — envio de orçamento
```
Olá, {{1}}! 😊 A {{2}} preparou um orçamento de {{3}} para você. Veja os detalhes e responda aqui: {{4}} — válido até {{5}}.
```
Exemplos: `{{1}}` Maria · `{{2}}` Clínica Sorriso · `{{3}}` R$ 2.450,00 · `{{4}}` https://clinicaiq.com.br/orcamento/abc123 · `{{5}}` 15/07/2026

> A aprovação costuma levar de minutos a algumas horas. Enquanto um template estiver
> "Em análise", ele não pode ser enviado.

## Parte D — Ligar no Vercel

Em **Settings → Environment Variables** (Production):

| Variável | Valor |
|---|---|
| `WHATSAPP_PROVIDER` | `meta` |
| `WHATSAPP_ACCESS_TOKEN` | o token permanente (Parte B) |
| `WHATSAPP_PHONE_NUMBER_ID` | o Phone Number ID novo (Parte A) |
| `WHATSAPP_USE_TEMPLATES` | `true` |

Depois **Redeploy**. Pronto: ao criar um agendamento com "Enviar confirmação por WhatsApp",
a mensagem sai como template (iniciada pela clínica, **sem** precisar do paciente mandar "oi").

## Observações

- **Verificação da empresa (Business Verification):** sem ela você envia para um número
  limitado de destinatários/dia — suficiente para o piloto. Para escala, faça a verificação
  (documentos/CNPJ) no Business Manager.
- **Webhook (respostas do paciente):** para o CONFIRMAR/REMARCAR atualizar o status na
  agenda automaticamente, configure o webhook do app apontando para
  `/api/webhooks/whatsapp` com o `WHATSAPP_VERIFY_TOKEN`. Opcional para o piloto.
- **Multi-clínica:** hoje as credenciais são globais (uma WABA para o piloto). Quando
  entrar a 2ª clínica, migrar para credenciais por tenant (ver plano "WhatsApp por-clínica").
