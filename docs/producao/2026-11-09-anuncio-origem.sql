-- Origem do anúncio (09/11/2026): o card do anúncio na conversa e a origem
-- Facebook. Só acrescenta: uma coluna nova e um valor novo na lista de origens.

-- O anúncio de onde a pessoa veio (referral da Meta), na 1ª mensagem.
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "ad" JSONB;

-- Origem do lead: anúncio do Facebook.
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'FACEBOOK';
