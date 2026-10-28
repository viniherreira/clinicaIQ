-- CRM: funil digital (gatilhos por etapa como no Kommo), 28/10/2026.
-- Só acréscimo: três ações novas, o gatilho (criado / movido / os dois) e as
-- condições. As automações que já existem ficam "quando entra" e sem condição,
-- exatamente como funcionavam.
ALTER TYPE "AutomationAction" ADD VALUE IF NOT EXISTS 'RUN_BOT';
ALTER TYPE "AutomationAction" ADD VALUE IF NOT EXISTS 'REMOVE_TAG';
ALTER TYPE "AutomationAction" ADD VALUE IF NOT EXISTS 'MOVE_STAGE';

DO $$ BEGIN
  CREATE TYPE "StageTrigger" AS ENUM ('ENTER', 'CREATED', 'MOVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "stage_automations" ADD COLUMN IF NOT EXISTS "trigger" "StageTrigger" NOT NULL DEFAULT 'ENTER';
ALTER TABLE "stage_automations" ADD COLUMN IF NOT EXISTS "conditions" JSONB NOT NULL DEFAULT '{}';
