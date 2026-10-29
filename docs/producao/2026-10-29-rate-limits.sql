-- Limite de tentativas no banco (achado F-05 da auditoria de segurança), 29/10/2026.
--
-- O limite das rotas públicas (agendamento online, orçamento, webhook antigo)
-- ficava na memória de cada instância da Vercel e, na prática, não limitava.
-- Agora os contadores ficam aqui. Só acréscimo: tabela nova, sem mexer em dado.
-- Pode rodar de novo.
--
-- Se o deploy chegar antes deste SQL, o app não quebra: sem a tabela, o
-- limitador volta a contar na memória até ela existir.

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key"     TEXT    NOT NULL,
  "count"   INTEGER NOT NULL,
  "resetAt" BIGINT  NOT NULL,
  CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "rate_limits_resetAt_idx" ON "rate_limits"("resetAt");

ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
