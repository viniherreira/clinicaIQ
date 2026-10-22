-- Planos novos: Essencial R$ 139, Profissional R$ 239, Clínica R$ 339.
-- Cada um tem a versão "com CRM" por um valor fechado, com usuários do CRM
-- incluídos (1, 3 e 5); usuário a mais no CRM: R$ 39/mês.
--   Essencial + CRM    R$ 199 (139 + 60)
--   Profissional + CRM R$ 359 (239 + 120)
--   Clínica + CRM      R$ 519 (339 + 180)
--
-- 1ª parte só acrescenta colunas. 2ª parte muda o preço dos planos (pedido do
-- dono em 2026-10-22). Não mexe em nenhuma assinatura: o valor no Asaas de
-- quem já assina só muda quando a clínica troca de plano ou mexe no CRM.

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "crmPackagePriceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "crmIncludedSeats" INTEGER NOT NULL DEFAULT 0;

UPDATE "plans" SET
  "monthlyPriceCents" = 13900,
  "crmPackagePriceCents" = 6000,
  "crmIncludedSeats" = 1,
  "crmSeatPriceCents" = 3900,
  "description" = 'Para o consultório de um profissional. Agenda, prontuário, orçamentos e WhatsApp oficial.'
WHERE "tier" = 'ESSENCIAL';

UPDATE "plans" SET
  "monthlyPriceCents" = 23900,
  "crmPackagePriceCents" = 12000,
  "crmIncludedSeats" = 3,
  "crmSeatPriceCents" = 3900,
  "description" = 'Para clínicas em crescimento. Até 3 profissionais e campanhas em massa.'
WHERE "tier" = 'PROFISSIONAL';

UPDATE "plans" SET
  "monthlyPriceCents" = 33900,
  "crmPackagePriceCents" = 18000,
  "crmIncludedSeats" = 5,
  "crmSeatPriceCents" = 3900,
  "description" = 'Para clínicas com muitos profissionais. Equipe ilimitada e relatórios completos.'
WHERE "tier" = 'CLINICA';
