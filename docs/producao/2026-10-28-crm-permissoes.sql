-- CRM: quadro de permissões por usuário (Configurações › Equipe e permissões), 28/10/2026.
-- Só acréscimo: a coluna nasce vazia, e vazio quer dizer "as permissões do cargo".
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "crmRights" JSONB;
