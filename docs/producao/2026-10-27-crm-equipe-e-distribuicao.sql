-- CRM: cargos, distribuição de leads e responsável da conversa (27/10/2026).
-- Spec: docs/specs/2026-10-27-crm-equipe-e-distribuicao-design.md
--
-- Parte 1: só acréscimos (tipo, colunas, índice, chave estrangeira).
-- Parte 2: preenche o responsável das conversas que já têm negócio com dono.
-- Parte 3: o "pode deixar o CRM para todo mundo" do dono (27/10/2026): o CRM
--          ligado na clínica de cortesia e o acesso para toda a equipe dela.

-- ─── Parte 1 ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "CrmRole" AS ENUM ('MANAGER', 'AGENT', 'AGENT_OWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "crmAvailable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "crmLastAssignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "crmReceivesLeads" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "crmRole" "CrmRole";

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;

CREATE INDEX IF NOT EXISTS "conversations_tenantId_assignedToId_idx" ON "conversations"("tenantId", "assignedToId");

DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Parte 2 ────────────────────────────────────────────────────────────────
-- A conversa passa a ser de quem já é responsável pelo negócio dela (só onde
-- ainda está vazia: nada que alguém escolheu é sobrescrito).
UPDATE "conversations" c
SET "assignedToId" = l."assignedToId"
FROM "leads" l
WHERE c."leadId" = l."id"
  AND c."tenantId" = l."tenantId"
  AND c."assignedToId" IS NULL
  AND l."assignedToId" IS NOT NULL
  AND l."deletedAt" IS NULL;

-- ─── Parte 3 (autorizada pelo dono em 27/10/2026) ────────────────────────────
UPDATE "subscriptions" SET "crmEnabled" = true WHERE "complimentary" = true AND "crmEnabled" = false;

UPDATE "users" u
SET "crmSeat" = true
FROM "subscriptions" s
WHERE s."tenantId" = u."tenantId"
  AND (s."complimentary" = true OR s."crmEnabled" = true)
  AND u."active" = true
  AND u."crmSeat" = false;
