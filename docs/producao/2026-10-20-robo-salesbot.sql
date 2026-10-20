-- Robô no jeito do Salesbot do Kommo (docs/specs/2026-10-20-crm-robo-salesbot-design.md).
-- Só acréscimos: novos gatilhos, quando o robô acorda e o contador do rodízio.
-- Os robôs que já existem continuam funcionando: o app converte o formato antigo na leitura.

ALTER TYPE "ChatbotTrigger" ADD VALUE IF NOT EXISTS 'STAGE';
ALTER TYPE "ChatbotTrigger" ADD VALUE IF NOT EXISTS 'TAG';
ALTER TYPE "ChatbotTrigger" ADD VALUE IF NOT EXISTS 'NO_REPLY';

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "botWakeAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "conversations_botWakeAt_idx" ON "conversations" ("botWakeAt");

ALTER TABLE "chatbot_flows" ADD COLUMN IF NOT EXISTS "state" JSONB NOT NULL DEFAULT '{}';
