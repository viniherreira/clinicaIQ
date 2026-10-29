-- F-15 (auditoria de 28/10/2026): conferir CPF repetido de verdade.
--
-- O CPF é cifrado com IV aleatório, então o mesmo CPF vira um texto diferente a
-- cada gravação, e o "CPF já cadastrado nesta clínica" nunca disparava. Esta
-- coluna guarda o índice cego do CPF (HMAC por clínica, igual ao phoneHash dos
-- leads): dá para achar o repetido sem guardar o número em claro.
--
-- Só acrescenta: coluna nova vazia + índice. Nenhum dado existente muda.
-- Quem preenche a coluna dos pacientes antigos é o próprio app (o relógio do
-- CRM, em lotes), porque só ele tem a chave para abrir o CPF.
--
-- Rodar ANTES do merge. A tabela "patients" já está com RLS ligado.

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "cpfHash" TEXT;

CREATE INDEX IF NOT EXISTS "patients_tenantId_cpfHash_idx" ON "patients" ("tenantId", "cpfHash");

-- Conferência (só leitura), depois do deploy: quantos ainda faltam preencher.
-- Deve chegar a 0 alguns minutos depois do deploy.
-- SELECT count(*) AS faltam FROM "patients" WHERE "cpf" IS NOT NULL AND "cpfHash" IS NULL;

-- Conferência (só leitura): CPFs repetidos que já existem, por clínica.
-- Não mostra CPF nem nome, só a quantidade. O que fazer com eles é decisão do dono.
-- SELECT "tenantId", count(*) AS cpfs_repetidos
-- FROM (
--   SELECT "tenantId", "cpfHash" FROM "patients"
--   WHERE "cpfHash" IS NOT NULL AND "deletedAt" IS NULL
--   GROUP BY 1, 2 HAVING count(*) > 1
-- ) d
-- GROUP BY 1;
