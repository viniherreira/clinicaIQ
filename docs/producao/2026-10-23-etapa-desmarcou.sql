-- Etapa "Desmarcou" no funil do CRM: desmarcar ou faltar na avaliação leva o
-- card para ela, e agendar de novo devolve para "Avaliação agendada".
-- Só acrescenta: um valor no enum e uma etapa nova em cada funil que tem
-- "Avaliação agendada" (papel SCHEDULED) e ainda não tem a de desmarcou.
-- Rodar em DUAS partes: o Postgres não deixa usar o valor novo do enum na
-- mesma transação em que ele foi criado.

-- Parte 1
ALTER TYPE "StageRole" ADD VALUE IF NOT EXISTS 'CANCELLED' AFTER 'SCHEDULED';

-- Parte 2
INSERT INTO pipeline_stages (id, "tenantId", "pipelineId", name, color, "order", role, "createdAt", "updatedAt")
SELECT 'stgdesm' || substr(md5(s."pipelineId"), 1, 18), s."tenantId", s."pipelineId", 'Desmarcou', 'orange', s."order" + 5, 'CANCELLED', now(), now()
FROM pipeline_stages s
WHERE s.role = 'SCHEDULED'
  AND NOT EXISTS (SELECT 1 FROM pipeline_stages c WHERE c."pipelineId" = s."pipelineId" AND c.role = 'CANCELLED');
