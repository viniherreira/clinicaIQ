-- Limpeza do WhatsApp por QR code (10/11/2026), depois da aprovação da Meta.
--
-- ⚠️ APAGA DADOS. Só rodar com o "pode" do dono e DEPOIS do deploy do PR que
-- tirou o QR do código (o código novo já não lê nada disto). O banco é do
-- plano gratuito, sem backup automático: o passo 0 guarda uma cópia.
--
-- O que sai:
--   - whatsapp_auth_keys  (1.718 chaves das sessões antigas do QR, cifradas)
--   - gateway_heartbeat   (sinal de vida do servidor do QR, parado desde 24/08)
--   - tooth_records       (odontograma antigo; as 11 marcações já estão em
--                          tooth_findings com o id tr_<antigo>, conferido em 10/11)
--   - tipo "ToothStatus"  (só a tabela antiga usava)
-- O que muda:
--   - as mensagens da agenda presas em "Saindo…" (PENDING) da época do QR, que
--     ninguém mais vai mandar, viram "Falhou" com o motivo.
-- O que fica: whatsapp_sessions (guarda também as preferências da agenda de
-- cada clínica: lembrete ligado, textos, botões).

BEGIN;

-- 0. Cópia de segurança, no próprio banco (apagar depois de uns dias).
CREATE TABLE IF NOT EXISTS "_bkp_20261110_tooth_records" AS TABLE "tooth_records";
CREATE TABLE IF NOT EXISTS "_bkp_20261110_whatsapp_auth_keys" AS TABLE "whatsapp_auth_keys";
ALTER TABLE "_bkp_20261110_tooth_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_bkp_20261110_whatsapp_auth_keys" ENABLE ROW LEVEL SECURITY;

-- 1. Conferência: nenhuma marcação antiga sem cópia (se der erro, nada é apagado).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "tooth_records" r
    WHERE NOT EXISTS (SELECT 1 FROM "tooth_findings" f WHERE f."id" = 'tr_' || r."id")
  ) THEN
    RAISE EXCEPTION 'há marcação do odontograma antigo sem cópia em tooth_findings';
  END IF;
END $$;

-- 2. Mensagens presas da época do QR.
UPDATE "whatsapp_messages"
SET "status" = 'FAILED',
    "nextAttemptAt" = NULL,
    "errorMessage" = COALESCE("errorMessage", 'Não enviada: a conexão antiga por QR code saiu do sistema')
WHERE "status" = 'PENDING' AND "direction" = 'OUTBOUND' AND "createdAt" < now() - interval '1 hour';

-- 3. Tabelas e tipo antigos.
DROP TABLE IF EXISTS "whatsapp_auth_keys";
DROP TABLE IF EXISTS "gateway_heartbeat";
DROP TABLE IF EXISTS "tooth_records";
DROP TYPE IF EXISTS "ToothStatus";

COMMIT;
