-- Avisos da agenda (agendamento criado e lembrete) pela API oficial da Meta.
-- Só acréscimos: os modelos dos avisos guardam o propósito, a ordem das
-- variáveis e o texto da clínica que gerou cada versão.
-- Spec: docs/specs/2026-10-21-lembretes-api-oficial-design.md

ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "purpose" TEXT;
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "varKeys" JSONB;
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "sourceText" TEXT;
CREATE INDEX IF NOT EXISTS "message_templates_tenantId_purpose_idx" ON "message_templates" ("tenantId", "purpose");
