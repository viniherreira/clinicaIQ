-- Relógio do CRM pelo Supabase (pg_cron), sem depender do gateway do Fly.
--
-- Chama o site a cada minuto, mesmo sem ninguém usando o CRM: automações com
-- atraso, transmissões agendadas, fila da API oficial e robôs parados.
-- (Enquanto alguém usa o CRM, o próprio site já dá esse compasso.)
--
-- Como rodar, no SQL Editor do Supabase:
--   1. Troque COLE_AQUI_O_CRON_SECRET pelo valor da variável CRON_SECRET da
--      Vercel (Settings → Environment Variables). Não mande esse valor para
--      ninguém, nem no chat. Se ela não existir, crie uma lá com um texto
--      longo e aleatório e use o mesmo aqui.
--   2. Se o site tiver domínio próprio, troque o endereço abaixo por ele.
--   3. Run.
--
-- O segredo fica guardado cifrado no Vault do Supabase, não no texto do agendamento.
-- Para desligar depois:  select cron.unschedule('crm-tick');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'crm_cron_secret', 'Segredo do relógio do CRM (CRON_SECRET da Vercel)');

select cron.schedule(
  'crm-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://clinica-iq-web.vercel.app/api/cron/crm-tick',
    headers := jsonb_build_object(
      'authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);
