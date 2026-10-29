# Trocar a chave de criptografia (ENCRYPTION_MASTER_KEY)

Use só se a chave vazou ou houver suspeita (print, arquivo `.env` exposto, pessoa que saiu com
acesso). Nada aqui roda sozinho: enquanto `ENCRYPTION_KEY_VERSION` não existir na Vercel, o app usa a
chave 1, como sempre.

**O que a chave protege:** CPF e telefones dos pacientes, telefones dos leads e das conversas,
mensagens do chat, o token da API oficial do WhatsApp e as credenciais antigas do QR.

**Como funciona:** `ENCRYPTION_MASTER_KEY` é sempre a chave ATUAL, e `ENCRYPTION_KEY_VERSION` diz o
número dela. As anteriores ficam em `ENCRYPTION_MASTER_KEY_V<n>` até tudo ser recifrado. Enquanto
isso, o app abre o texto antigo com a chave antiga, grava o novo com a atual e procura pelos índices
cegos das duas. O relógio do CRM recifra cerca de 300 linhas por tabela a cada minuto.

## Passo a passo (exemplo: da chave 1 para a 2)

Antes de começar, confira que o relógio do CRM está respondendo 200 (`relogio-crm.sql`, consulta no fim).

1. **Guardar a antiga com outro nome.** Na Vercel (Settings › Environment Variables, ambiente
   Production), crie `ENCRYPTION_MASTER_KEY_V1` com **o mesmo valor** da `ENCRYPTION_MASTER_KEY` atual.
   Se a variável for do tipo Secret e não der para ver o valor, pare: sem ele, os dados antigos não abrem.
2. **Pôr a nova.** Gere uma chave nova no seu computador:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   Troque o valor da `ENCRYPTION_MASTER_KEY` por ela e crie `ENCRYPTION_KEY_VERSION` = `2`.
   **Faça o redeploy.**
3. **Esperar o relógio recifrar.** No SQL Editor do Supabase, rode a conferência abaixo a cada poucos
   minutos, até tudo dar 0:

   ```sql
   SELECT 'patients' AS tabela, count(*) FROM patients
     WHERE (cpf IS NOT NULL AND cpf NOT LIKE 'k2.%') OR phone NOT LIKE 'k2.%' OR (phone2 IS NOT NULL AND phone2 NOT LIKE 'k2.%')
   UNION ALL SELECT 'leads', count(*) FROM leads WHERE phone NOT LIKE 'k2.%'
   UNION ALL SELECT 'conversations', count(*) FROM conversations
     WHERE phone NOT LIKE 'k2.%' OR ("lastPreview" IS NOT NULL AND "lastPreview" NOT LIKE 'k2.%')
   UNION ALL SELECT 'chat_messages', count(*) FROM chat_messages WHERE text IS NOT NULL AND text NOT LIKE 'k2.%'
   UNION ALL SELECT 'whatsapp_cloud_accounts', count(*) FROM whatsapp_cloud_accounts WHERE "accessToken" NOT LIKE 'k2.%'
   UNION ALL SELECT 'whatsapp_auth_keys', count(*) FROM whatsapp_auth_keys WHERE value NOT LIKE 'k2.%';
   ```

   Se uma tabela parar num número acima de 0, são linhas que não abriram com nenhuma chave. Não siga
   para o passo 4: investigue antes.
4. **Apagar a antiga.** Com tudo em 0, apague `ENCRYPTION_MASTER_KEY_V1` na Vercel e faça o redeploy.
   A chave vazada deixa de abrir qualquer coisa nova.

Para uma próxima troca (da 2 para a 3): o mesmo, com `ENCRYPTION_MASTER_KEY_V2`, `ENCRYPTION_KEY_VERSION`
= `3` e `k3.%` na conferência.

## Se der errado no meio

Volte `ENCRYPTION_MASTER_KEY` para o valor antigo, `ENCRYPTION_KEY_VERSION` para `1`, e crie
`ENCRYPTION_MASTER_KEY_V2` com a chave nova (o que já foi recifrado continua abrindo por ela). Faça o
redeploy. O relógio só recifra quando a versão é 2 ou mais, então para sozinho.

## Também precisa da chave

- Ambiente **Preview** da Vercel: tem chave própria (banco separado), não precisa trocar junto.
- O gateway de QR (`apps/whatsapp-gateway`) saiu do ar e não entende o formato `k2.`. Não religue
  sem atualizar.
