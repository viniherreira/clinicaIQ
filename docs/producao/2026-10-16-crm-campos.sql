-- CRM pacote A: campos personalizados do lead. Banco de produção (Supabase).
-- Só acrescenta: um tipo novo, um valor novo no histórico, uma coluna com
-- padrão vazio nos leads e a tabela dos campos. Nada que existe muda.
CREATE TYPE "LeadFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTISELECT', 'BOOLEAN');
ALTER TYPE "LeadActivityType" ADD VALUE IF NOT EXISTS 'FIELD_CHANGED';
ALTER TABLE "leads" ADD COLUMN "fields" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "lead_fields" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LeadFieldType" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "showOnCard" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lead_fields_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lead_fields_tenantId_order_idx" ON "lead_fields"("tenantId", "order");
ALTER TABLE "lead_fields" ADD CONSTRAINT "lead_fields_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_fields" ENABLE ROW LEVEL SECURITY;
