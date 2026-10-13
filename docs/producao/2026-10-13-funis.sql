-- Vários funis no CRM (como no Kommo): banco de produção (Supabase).
-- Cria a tabela de funis, põe as etapas de cada clínica num "Funil principal"
-- e troca a regra "cada papel uma vez por clínica" por "uma vez por funil".
-- Nenhum lead muda de etapa. Rodar inteiro (numa transação: ou entra tudo, ou nada).
BEGIN;

CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pipelines_tenantId_order_idx" ON "pipelines"("tenantId", "order");
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pipelines" ENABLE ROW LEVEL SECURITY;

-- Um "Funil principal" para cada clínica que já tem etapas.
INSERT INTO "pipelines" ("id", "tenantId", "name", "order", "updatedAt")
SELECT 'pl_' || md5("tenantId"), "tenantId", 'Funil principal', 10, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenantId" FROM "pipeline_stages") t;

ALTER TABLE "pipeline_stages" ADD COLUMN "pipelineId" TEXT;
UPDATE "pipeline_stages" SET "pipelineId" = 'pl_' || md5("tenantId");
ALTER TABLE "pipeline_stages" ALTER COLUMN "pipelineId" SET NOT NULL;

DROP INDEX "pipeline_stages_tenantId_role_key";
CREATE UNIQUE INDEX "pipeline_stages_pipelineId_role_key" ON "pipeline_stages"("pipelineId", "role");
CREATE INDEX "pipeline_stages_pipelineId_order_idx" ON "pipeline_stages"("pipelineId", "order");
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
