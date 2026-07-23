# WhatsApp por QR code (número próprio de cada clínica)

Cada clínica conecta o **próprio número** lendo um QR code, igual ao WhatsApp Web.
A partir daí, confirmações de agendamento, lembretes, orçamentos e mensagens de
aniversário saem do número que o paciente já conhece.

## Como funciona

```
Next.js (Vercel)  ──HTTP──►  whatsapp-gateway  ──WhatsApp Web──►  celular da clínica
      │                            │
      └──────── Postgres ──────────┘
        (status + credenciais)
```

- **`apps/whatsapp-gateway`** mantém um socket WhatsApp Web por clínica, vivo o
  tempo todo. É um processo Node comum — **não roda na Vercel**, que é serverless.
- As credenciais de pareamento ficam na tabela `whatsapp_auth_keys`, criptografadas
  com a mesma `ENCRYPTION_MASTER_KEY` usada no CPF/telefone. Assim um redeploy do
  gateway não obriga ninguém a parear de novo.
- O app Next lê o status em `whatsapp_sessions` e nunca fala WhatsApp direto.

## Onde hospedar o gateway

Qualquer lugar que rode um container 24h: Railway, Render, Fly.io, Hetzner, EC2.
O `Dockerfile` já está pronto em `apps/whatsapp-gateway/`.

Requisitos: ~512 MB de RAM para as primeiras dezenas de clínicas, disco não é
necessário (o estado vive no Postgres).

### Variáveis do gateway

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | mesmo Postgres do app |
| `ENCRYPTION_MASTER_KEY` | **a mesma** do app, senão as credenciais não abrem |
| `WHATSAPP_GATEWAY_TOKEN` | segredo compartilhado com o app |
| `PORT` | porta HTTP (padrão 8080) |
| `WHATSAPP_QR_TTL_MS` | validade do QR (padrão 60000) |

### Variáveis do app (Vercel)

| Variável | Valor |
|---|---|
| `WHATSAPP_GATEWAY_URL` | `https://seu-gateway.exemplo.com` |
| `WHATSAPP_GATEWAY_TOKEN` | o mesmo segredo do gateway |

Sem essas duas, a página `/whatsapp` mostra o aviso de "serviço não configurado"
e o botão de conectar fica desabilitado — o resto do sistema segue normal.

Gere o token com:

```bash
openssl rand -hex 32
```

## Rodando local

```bash
pnpm --filter @clinicaiq/whatsapp-gateway dev
```

E no `.env.local` do app:

```
WHATSAPP_GATEWAY_URL=http://localhost:8080
WHATSAPP_GATEWAY_TOKEN=<o mesmo do gateway>
```

## Fluxo na tela

1. A clínica abre **WhatsApp** no menu lateral.
2. Clica em **Conectar WhatsApp** → o app pede ao gateway para abrir o socket.
3. O QR aparece e se renova sozinho enquanto o modal estiver aberto.
4. A clínica lê pelo celular em *Aparelhos conectados → Conectar um aparelho*.
5. Assim que conecta, o número aparece na tela e as automações passam a valer.

Há um botão de **mensagem de teste** para provar que o envio funciona antes de
confiar nele.

## Automações

| Automação | Quando dispara | Precisa do número próprio? |
|---|---|---|
| Confirmação ao agendar | na hora que o horário é marcado | não (cai no provider global) |
| Lembrete na véspera | cron diário `/api/cron/reminders` | não |
| Orçamento enviado | ao enviar o orçamento | não |
| Aniversário | cron diário `/api/cron/aniversarios` | **sim** |

Aniversário só sai pelo número da clínica: pela política da Meta, mensagem não
transacional exige template aprovado, e um "feliz aniversário" não passa como
transacional.

Cada clínica liga e desliga o que quiser na própria página `/whatsapp`.

## Roteamento de envio

`resolveProvider()` em `apps/web/lib/whatsapp.ts` decide quem envia:

1. Clínica com número pareado e conectado → **gateway** (texto puro, sem template).
2. Caso contrário → provider do ambiente (Meta Cloud API, ou mock em dev).

Isso quer dizer que quem não conectou continua funcionando como antes.

## Limitações que você precisa saber

- **É WhatsApp Web, não a API oficial.** A Meta não autoriza automação por esse
  caminho; existe risco real de bloqueio do número, especialmente com volume alto
  ou se pacientes marcarem como spam. Use o número comercial da clínica, nunca um
  pessoal, e evite disparos em massa.
- **O celular precisa ficar online.** Se ficar muitos dias sem internet, o
  WhatsApp derruba a sessão e a clínica precisa ler o QR de novo. A tela mostra o
  estado e o gateway tenta reconectar sozinho algumas vezes antes de desistir.
- **Botões de resposta não existem** nesse caminho — o texto pede a resposta
  escrita ("CONFIRMAR"), que o webhook já entende.
- **Uma sessão por clínica.** Trocar de número exige desconectar e parear de novo.

Se em algum momento você quiser o caminho oficial (sem risco de bloqueio), é o
Embedded Signup da Meta descrito em `docs/WHATSAPP_SETUP.md` — mas ele exige
conta Facebook Business por clínica e aprovação de templates.
