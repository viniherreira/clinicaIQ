-- Assistente de IA, Nível 1 (docs/specs/2026-11-07-assistente-ia-nivel1-design.md).
-- Rodar no SQL Editor do Supabase antes do deploy da feat/ia.

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "assistantEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "assistant_conversations" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id"),
  "userId" TEXT NOT NULL REFERENCES "users"("id"),
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "assistant_conversations_tenantId_userId_updatedAt_idx"
  ON "assistant_conversations" ("tenantId", "userId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "assistant_conversations_updatedAt_idx" ON "assistant_conversations" ("updatedAt");

CREATE TABLE IF NOT EXISTS "assistant_messages" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id"),
  "conversationId" TEXT NOT NULL REFERENCES "assistant_conversations"("id") ON DELETE CASCADE,
  "seq" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_messages_conversationId_seq_key" ON "assistant_messages" ("conversationId", "seq");
CREATE INDEX IF NOT EXISTS "assistant_messages_tenantId_idx" ON "assistant_messages" ("tenantId");

-- Trava contra a API REST do Supabase (o Prisma conecta como postgres e ignora o RLS).
ALTER TABLE "assistant_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assistant_messages" ENABLE ROW LEVEL SECURITY;

-- Piloto: ligar por clínica.
-- UPDATE "subscriptions" SET "assistantEnabled" = true WHERE "tenantId" = '<id da clínica>';
