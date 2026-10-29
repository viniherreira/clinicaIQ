-- RLS no odontograma (achado F-02 da auditoria de segurança), 28/10/2026.
--
-- O 2026-10-28-odontograma.sql criou "tooth_findings" sem ligar o RLS, ao
-- contrário de todas as outras tabelas novas. No Supabase, tabela do schema
-- public sem RLS fica aberta à API REST para quem tiver a chave anon/publishable.
--
-- Não apaga nem muda dado: só liga a trava. O app não sente nada, porque o
-- Prisma conecta como "postgres", que ignora o RLS. Sem política nenhuma,
-- anon e authenticated não leem nem gravam. Pode rodar de novo.

ALTER TABLE "tooth_findings" ENABLE ROW LEVEL SECURITY;

-- Conferência (só leitura): tabelas do public ainda sem RLS. O esperado é
-- nenhuma linha. Se aparecer alguma (por exemplo, das criadas pelo prisma db
-- push no começo), ligar o RLS nela do mesmo jeito.
--
-- select c.relname
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
-- order by 1;
