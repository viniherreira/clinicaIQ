-- Planos por produto: Agenda, CRM e Completo (docs/specs/2026-10-26-planos-teste-e-funis-design.md).
--
-- Parte 1 (só acrescenta; roda antes do merge).
ALTER TABLE plans ADD COLUMN IF NOT EXISTS "crmOnlyPriceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS "clinicEnabled" BOOLEAN NOT NULL DEFAULT true;

-- O preço do CRM sozinho (coluna nova; só preenche onde ainda está zerado).
UPDATE plans SET "crmOnlyPriceCents" = CASE tier
    WHEN 'ESSENCIAL' THEN 11900
    WHEN 'PROFISSIONAL' THEN 21900
    WHEN 'CLINICA' THEN 31900
  END
WHERE "crmOnlyPriceCents" = 0 AND tier IN ('ESSENCIAL', 'PROFISSIONAL', 'CLINICA');

-- Parte 2 (MUDA texto existente; só com o "pode"): descrições dos tamanhos
-- sem falar de recursos, que agora dependem do produto.
-- UPDATE plans SET description = CASE tier
--     WHEN 'ESSENCIAL' THEN 'Para o consultório de um profissional.'
--     WHEN 'PROFISSIONAL' THEN 'Para clínicas em crescimento, com até 3 profissionais.'
--     WHEN 'CLINICA' THEN 'Para clínicas com equipe grande e várias cadeiras.'
--   END
-- WHERE tier IN ('ESSENCIAL', 'PROFISSIONAL', 'CLINICA');
