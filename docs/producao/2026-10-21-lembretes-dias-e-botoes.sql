-- Lembretes da agenda em mais de um dia (1 semana, 3 dias, 2 dias, 1 dia antes,
-- no dia) e botões escolhidos pela clínica em cada aviso.
-- Só acréscimos: colunas novas; quem já existe fica com o lembrete de 1 dia antes
-- e os botões Confirmar e Reagendar, como hoje.

ALTER TABLE "whatsapp_sessions" ADD COLUMN IF NOT EXISTS "reminderDays" INTEGER[] NOT NULL DEFAULT ARRAY[1]::INTEGER[];
ALTER TABLE "whatsapp_sessions" ADD COLUMN IF NOT EXISTS "createdButtons" JSONB;
ALTER TABLE "whatsapp_sessions" ADD COLUMN IF NOT EXISTS "reminderButtons" JSONB;
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "buttons" JSONB;
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "reminderDays" INTEGER;
