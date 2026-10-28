-- Odontograma por faces e procedimentos (ficha do paciente), 28/10/2026.
-- Só acréscimo: tabela nova e cópia das marcações antigas (tooth_records fica
-- como está). Pode rodar de novo: a cópia usa o id antigo e não duplica.
DO $$ BEGIN
  CREATE TYPE "ToothFindingStatus" AS ENUM ('PLANNED', 'DONE', 'EXISTING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "tooth_findings" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "toothNumber" INTEGER NOT NULL,
  "surfaces" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "kind" TEXT NOT NULL,
  "status" "ToothFindingStatus" NOT NULL DEFAULT 'PLANNED',
  "note" TEXT,
  "procedureId" TEXT,
  "professionalId" TEXT,
  "doneAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tooth_findings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tooth_findings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tooth_findings_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tooth_findings_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tooth_findings_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "tooth_findings_tenantId_patientId_idx" ON "tooth_findings"("tenantId", "patientId");

-- As marcações antigas (uma situação por dente) viram marcações do dente todo.
INSERT INTO "tooth_findings" ("id", "tenantId", "patientId", "toothNumber", "kind", "status", "note", "doneAt", "createdById", "createdAt", "updatedAt")
SELECT
  'tr_' || t."id",
  t."tenantId",
  t."patientId",
  t."toothNumber",
  CASE t."status" WHEN 'EXTRACTED' THEN 'EXTRACTION' WHEN 'MISSING' THEN 'MISSING' ELSE 'NOTE' END,
  (CASE t."status" WHEN 'EXTRACTED' THEN 'DONE' WHEN 'TREATED' THEN 'DONE' WHEN 'MISSING' THEN 'EXISTING' ELSE 'PLANNED' END)::"ToothFindingStatus",
  CASE t."status"
    WHEN 'TO_TREAT' THEN 'Precisa tratar' || COALESCE(': ' || t."note", '')
    WHEN 'IN_TREATMENT' THEN 'Em tratamento' || COALESCE(': ' || t."note", '')
    WHEN 'TREATED' THEN 'Tratado' || COALESCE(': ' || t."note", '')
    ELSE t."note"
  END,
  CASE WHEN t."status" IN ('EXTRACTED', 'TREATED') THEN t."updatedAt" END,
  t."updatedById",
  t."createdAt",
  t."updatedAt"
FROM "tooth_records" t
ON CONFLICT ("id") DO NOTHING;
