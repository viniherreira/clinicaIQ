-- Agenda no padrão Clínica nas Nuvens: banco de produção (Supabase). Só acréscimos.
-- Horas de chegada/início/fim e rótulo no agendamento, tabela de rótulos e comissão do profissional.
-- Rodar inteiro no SQL Editor do Supabase (numa transação: ou entra tudo, ou nada).
BEGIN;
-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "commissionPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "labelId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "appointment_labels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_labels_tenantId_order_idx" ON "appointment_labels"("tenantId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_labels_tenantId_name_key" ON "appointment_labels"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "appointment_labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_labels" ADD CONSTRAINT "appointment_labels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "appointment_labels" ENABLE ROW LEVEL SECURITY;
COMMIT;
