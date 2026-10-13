-- Unidades (várias clínicas na mesma conta): banco de produção (Supabase).
-- Só acrescenta: uma tabela nova e três colunas vazias. Cada clínica ganha a
-- "unidade principal" com o nome, o endereço e o telefone que já tem.
-- Nenhum paciente, agendamento ou orçamento muda (agendamento sem unidade = principal).
-- Rodar inteiro (numa transação: ou entra tudo, ou nada).
BEGIN;

ALTER TABLE "users" ADD COLUMN "unitIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "professional_schedules" ADD COLUMN "unitId" TEXT;
ALTER TABLE "appointments" ADD COLUMN "unitId" TEXT;

CREATE TABLE "clinic_units" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "zipCode" TEXT,
    "street" TEXT,
    "addressNumber" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "businessHours" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clinic_units_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "clinic_units_tenantId_order_idx" ON "clinic_units"("tenantId", "order");
CREATE INDEX "appointments_tenantId_unitId_startTime_idx" ON "appointments"("tenantId", "unitId", "startTime");
ALTER TABLE "professional_schedules" ADD CONSTRAINT "professional_schedules_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "clinic_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "clinic_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clinic_units" ADD CONSTRAINT "clinic_units_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_units" ENABLE ROW LEVEL SECURITY;

-- A unidade principal de cada clínica (mesmo id que o sistema criaria: un_<clínica>).
INSERT INTO "clinic_units" ("id", "tenantId", "name", "phone", "email", "address", "zipCode", "street", "addressNumber", "complement", "neighborhood", "city", "state", "order", "updatedAt")
SELECT 'un_' || "id", "id", "name", "phone", "email", "address", "zipCode", "street", "addressNumber", "complement", "neighborhood", "city", "state", 0, CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("id") DO NOTHING;

COMMIT;
