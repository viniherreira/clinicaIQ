import type { TenantPrismaClient } from '@clinicaiq/db';
import { CRM_COLORS } from './defaults';
import { canDeleteStage, isClosedStage } from './pipeline';
import { MAX_QUICK_REPLY, normalizeShortcut } from './quick-replies';

/**
 * O que dono e admin mudam no CRM: etapas, tags, motivos de perda e
 * respostas rápidas.
 * Quem chama já passou por `guardCrmAction('crm_config')`.
 */

type Result = { ok: true } | { ok: false; message: string };
const ok: Result = { ok: true };
const isColor = (c: string) => (CRM_COLORS as readonly string[]).includes(c);
const cleanName = (n: string) => n.trim().replace(/\s+/g, ' ').slice(0, 40);

// ─── Etapas ──────────────────────────────────────────────────────────────────

/** Nova etapa entra por último entre as colunas — antes de Fechou e Perdeu. */
export async function createStage(db: TenantPrismaClient, tenantId: string, name: string, color: string): Promise<Result> {
  const nome = cleanName(name);
  if (!nome) return { ok: false, message: 'Escreva o nome da etapa.' };
  if (!isColor(color)) return { ok: false, message: 'Cor inválida.' };
  const stages = await db.pipelineStage.findMany();
  if (stages.some((s) => s.name.toLowerCase() === nome.toLowerCase())) {
    return { ok: false, message: 'Já existe uma etapa com esse nome.' };
  }
  const ultima = Math.max(0, ...stages.filter((s) => !isClosedStage(s)).map((s) => s.order));
  await db.pipelineStage.create({ data: { tenantId, name: nome, color, order: ultima + 10, role: null } });
  return ok;
}

export async function updateStage(
  db: TenantPrismaClient,
  stageId: string,
  patch: { name?: string; color?: string },
): Promise<Result> {
  const stage = await db.pipelineStage.findFirst({ where: { id: stageId } });
  if (!stage) return { ok: false, message: 'Etapa não encontrada.' };
  const data: { name?: string; color?: string } = {};
  if (patch.name !== undefined) {
    const nome = cleanName(patch.name);
    if (!nome) return { ok: false, message: 'Escreva o nome da etapa.' };
    const igual = await db.pipelineStage.findFirst({ where: { id: { not: stageId }, name: { equals: nome, mode: 'insensitive' } } });
    if (igual) return { ok: false, message: 'Já existe uma etapa com esse nome.' };
    data.name = nome;
  }
  if (patch.color !== undefined) {
    if (!isColor(patch.color)) return { ok: false, message: 'Cor inválida.' };
    data.color = patch.color;
  }
  await db.pipelineStage.updateMany({ where: { id: stageId }, data });
  return ok;
}

/**
 * Sobe ou desce uma coluna. Fechou e Perdeu não entram na conta — ficam
 * sempre no fim, como barra de "solte aqui".
 */
export async function moveStage(db: TenantPrismaClient, tenantId: string, stageId: string, direction: -1 | 1): Promise<Result> {
  const colunas = (await db.pipelineStage.findMany({ orderBy: { order: 'asc' } })).filter((s) => !isClosedStage(s));
  const i = colunas.findIndex((s) => s.id === stageId);
  const j = i + direction;
  if (i < 0) return { ok: false, message: 'Etapa não encontrada.' };
  if (j < 0 || j >= colunas.length) return ok;
  [colunas[i], colunas[j]] = [colunas[j], colunas[i]];
  await db.$transaction(
    colunas.map((s, k) => db.pipelineStage.updateMany({ where: { id: s.id, tenantId }, data: { order: (k + 1) * 10 } })),
  );
  return ok;
}

/** Apaga uma etapa criada pela clínica, levando os leads para `targetId`. */
export async function deleteStage(
  db: TenantPrismaClient,
  tenantId: string,
  stageId: string,
  targetId: string | null,
): Promise<Result> {
  return db.$transaction(async (tx) => {
    const stage = await tx.pipelineStage.findFirst({ where: { id: stageId, tenantId } });
    if (!stage) return { ok: false as const, message: 'Etapa não encontrada.' };
    const target = targetId ? await tx.pipelineStage.findFirst({ where: { id: targetId, tenantId } }) : null;
    const leads = await tx.lead.count({ where: { tenantId, stageId } });

    const check = canDeleteStage(stage, leads, target);
    if (!check.ok) return check;

    if (leads > 0 && target) {
      // No fim da coluna de destino, na ordem em que estavam.
      const ultimo = await tx.lead.findFirst({ where: { tenantId, stageId: target.id }, orderBy: { position: 'desc' }, select: { position: true } });
      const movidos = await tx.lead.findMany({ where: { tenantId, stageId }, orderBy: { position: 'asc' }, select: { id: true } });
      let pos = (ultimo?.position ?? -1) + 1;
      for (const l of movidos) {
        await tx.lead.updateMany({ where: { id: l.id, tenantId }, data: { stageId: target.id, position: pos++, stageEnteredAt: new Date() } });
      }
      await tx.leadActivity.createMany({
        data: movidos.map((l) => ({
          tenantId,
          leadId: l.id,
          type: 'STAGE_CHANGED' as const,
          actorId: null,
          data: { from: stageId, to: target.id, reason: 'stage_deleted' },
        })),
      });
    }
    await tx.pipelineStage.deleteMany({ where: { id: stageId, tenantId } });
    return ok;
  });
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export async function upsertTag(
  db: TenantPrismaClient,
  tenantId: string,
  input: { id?: string; name: string; color: string },
): Promise<Result> {
  const nome = cleanName(input.name).toLowerCase().slice(0, 30);
  if (!nome) return { ok: false, message: 'Escreva o nome da tag.' };
  if (!isColor(input.color)) return { ok: false, message: 'Cor inválida.' };
  const igual = await db.leadTag.findFirst({ where: { name: nome, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (igual) return { ok: false, message: 'Já existe uma tag com esse nome.' };
  if (input.id) {
    const r = await db.leadTag.updateMany({ where: { id: input.id }, data: { name: nome, color: input.color } });
    return r.count ? ok : { ok: false, message: 'Tag não encontrada.' };
  }
  await db.leadTag.create({ data: { tenantId, name: nome, color: input.color } });
  return ok;
}

/** Apaga a tag e tira ela de todos os leads. */
export async function deleteTag(db: TenantPrismaClient, tenantId: string, tagId: string): Promise<Result> {
  return db.$transaction(async (tx) => {
    const tag = await tx.leadTag.findFirst({ where: { id: tagId, tenantId } });
    if (!tag) return { ok: false as const, message: 'Tag não encontrada.' };
    await tx.leadTagOnLead.deleteMany({ where: { tenantId, tagId } });
    await tx.leadTag.deleteMany({ where: { id: tagId, tenantId } });
    return ok;
  });
}

// ─── Motivos de perda ────────────────────────────────────────────────────────

export async function upsertLostReason(
  db: TenantPrismaClient,
  tenantId: string,
  input: { id?: string; name: string; active?: boolean },
): Promise<Result> {
  const nome = cleanName(input.name).slice(0, 60);
  if (!nome) return { ok: false, message: 'Escreva o motivo.' };
  const igual = await db.lostReason.findFirst({ where: { name: nome, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (igual) return { ok: false, message: 'Esse motivo já existe.' };
  if (input.id) {
    const r = await db.lostReason.updateMany({
      where: { id: input.id },
      data: { name: nome, ...(input.active !== undefined ? { active: input.active } : {}) },
    });
    return r.count ? ok : { ok: false, message: 'Motivo não encontrado.' };
  }
  const ultimo = await db.lostReason.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
  await db.lostReason.create({ data: { tenantId, name: nome, order: (ultimo?.order ?? 0) + 10 } });
  return ok;
}

/**
 * Motivo não se apaga: os leads perdidos continuam apontando para ele, e o
 * relatório de "por que perdemos" precisa do histórico. Desativar tira da
 * lista de escolha.
 */
export async function toggleLostReason(db: TenantPrismaClient, reasonId: string, active: boolean): Promise<Result> {
  const r = await db.lostReason.updateMany({ where: { id: reasonId }, data: { active } });
  return r.count ? ok : { ok: false, message: 'Motivo não encontrado.' };
}

// ─── Respostas rápidas ───────────────────────────────────────────────────────

export async function upsertQuickReply(
  db: TenantPrismaClient,
  tenantId: string,
  input: { id?: string; title: string; body: string },
): Promise<Result> {
  const title = normalizeShortcut(input.title);
  const body = input.body.trim();
  if (!title) return { ok: false, message: 'Escreva o atalho (ex.: horarios).' };
  if (!body) return { ok: false, message: 'Escreva o texto da resposta.' };
  if (body.length > MAX_QUICK_REPLY) return { ok: false, message: `O texto passa de ${MAX_QUICK_REPLY} caracteres.` };
  const igual = await db.quickReply.findFirst({ where: { title, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (igual) return { ok: false, message: `Já existe a resposta /${title}.` };
  if (input.id) {
    const r = await db.quickReply.updateMany({ where: { id: input.id }, data: { title, body } });
    return r.count ? ok : { ok: false, message: 'Resposta não encontrada.' };
  }
  const ultima = await db.quickReply.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
  await db.quickReply.create({ data: { tenantId, title, body, order: (ultima?.order ?? 0) + 10 } });
  return ok;
}

export async function deleteQuickReply(db: TenantPrismaClient, id: string): Promise<Result> {
  const r = await db.quickReply.deleteMany({ where: { id } });
  return r.count ? ok : { ok: false, message: 'Resposta não encontrada.' };
}
