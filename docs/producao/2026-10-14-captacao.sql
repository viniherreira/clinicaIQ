-- Captação pela primeira mensagem (CRM → Automações → Bots): banco de produção (Supabase).
-- Só cria uma tabela nova; nada que já existe muda. Rodar inteiro.
BEGIN;

CREATE TABLE "capture_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pipelineId" TEXT,
    "source" "LeadSource",
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "capture_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "capture_rules_tenantId_active_idx" ON "capture_rules"("tenantId", "active");
ALTER TABLE "capture_rules" ADD CONSTRAINT "capture_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "capture_rules" ENABLE ROW LEVEL SECURITY;

COMMIT;
