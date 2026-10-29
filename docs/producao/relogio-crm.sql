-- Relógio do CRM pelo Supabase (pg_cron), sem depender do gateway do Fly.
--
-- Chama o site a cada minuto, mesmo sem ninguém usando o CRM: automações com
-- atraso, transmissões agendadas, fila da API oficial e robôs parados.
-- (Enquanto alguém usa o CRM, o próprio site já dá esse compasso.)
--
-- Até 29/10/2026 este SQL nunca tinha rodado em produção (o pg_cron não estava
-- instalado): quem dava o compasso era o gateway do Fly, com o
-- WHATSAPP_GATEWAY_TOKEN. Rode este antes de desligar o gateway.
--
-- Como rodar, no SQL Editor do Supabase:
--   1. Troque COLE_AQUI_O_CRON_SECRET (aparece duas vezes) pelo valor da
--      variável CRON_SECRET da Vercel (Settings → Environment Variables). Não
--      mande esse valor para ninguém, nem no chat. Se ela não existir, crie uma
--      lá com um texto longo e aleatório e use o mesmo aqui.
--   2. Run.
--   3. Não salve esta consulta com o segredo dentro: depois de rodar, apague o
--      texto do editor (ou a consulta salva, se o editor tiver guardado).
--
-- O endereço é o www: o domínio sem www redireciona (308), e o pg_net não segue
-- redirecionamento. O segredo fica guardado cifrado no Vault do Supabase, não no
-- texto do agendamento.
--
-- Pode rodar de novo: troca o segredo e refaz o agendamento.
-- Para desligar depois:  select cron.unschedule('crm-tick');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from vault.secrets where name = 'crm_cron_secret') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'crm_cron_secret'),
      'COLE_AQUI_O_CRON_SECRET'
    );
  else
    perform vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'crm_cron_secret', 'Segredo do relógio do CRM (CRON_SECRET da Vercel)');
  end if;
end $$;

select cron.unschedule('crm-tick') where exists (select 1 from cron.job where jobname = 'crm-tick');

select cron.schedule(
  'crm-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://www.dreamclin.com/api/cron/crm-tick',
    headers := jsonb_build_object(
      'authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- Conferência (só leitura), uns 2 minutos depois de rodar. O esperado é 200;
-- 401 quer dizer que o segredo não bate com o CRON_SECRET da Vercel.
--
-- select status_code, created from net._http_response order by created desc limit 5;
