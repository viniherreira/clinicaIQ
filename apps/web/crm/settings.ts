import type { TenantPrismaClient } from '@clinicaiq/db';
import { AGENDA_ROLE_LABEL, CRM_COLORS, NEW_PIPELINE_STAGES, type AgendaRole } from './defaults';
import { boardStages, canDeleteStage, isAgendaRole, isClosedStage, mainPipeline } from './pipeline';
import { MAX_QUICK_REPLY, normalizeShortcut } from './quick-replies';

/**
 * O que dono e admin mudam no CRM: funis, etapas, tags, motivos de perda e
 * respostas rápidas.
 * Quem chama já passou por `guardCrmAction('crm_config')`.
 */

type Result = { ok: true } | { ok: false; message: string };
const ok: Result = { ok: true };
const isColor = (c: string) => (CRM_COLORS as readonly string[]).includes(c);
const cleanName = (n: string) => n.trim().replace(/\s+/g, ' ').slice(0, 40);

// ─── Funis ───────────────────────────────────────────────────────────────────

/** Um funil novo já nasce com entrada, duas colunas, ganho e perda. */
export async function createPipeline(
  db: TenantPrismaClient,
  tenantId: string,
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const nome = cleanName(name);
  if (!nome) return { ok: false, message: 'Escreva o nome do funil.' };
  const funis = await db.pipeline.findMany();
  if (funis.some((p) => p.name.toLowerCase() === nome.toLowerCase())) {
    return { ok: false, message: 'Já existe um funil com esse nome.' };
  }
  if (funis.length >= 20) return { ok: false, message: 'Limite de 20 funis.' };
  const ordem = Math.max(0, ...funis.map((p) => p.order)) + 10;
  const funil = await db.$transaction(async (tx) => {
    const p = await tx.pipeline.create({ data: { tenantId, name: nome, order: ordem } });
    await tx.pipelineStage.createMany({
      data: NEW_PIPELINE_STAGES.map((s) => ({ tenantId, pipelineId: p.id, name: s.name, color: s.color, order: s.order, role: s.role })),
    });
    return p;
  });
  return { ok: true, id: funil.id };
}

export async function renamePipeline(db: TenantPrismaClient, pipelineId: string, name: string): Promise<Result> {
  const nome = cleanName(name);
  if (!nome) return { ok: false, message: 'Escreva o nome do funil.' };
  const funil = await db.pipeline.findFirst({ where: { id: pipelineId } });
  if (!funil) return { ok: false, message: 'Funil não encontrado.' };
  const igual = await db.pipeline.findFirst({ where: { id: { not: pipelineId }, name: { equals: nome, mode: 'insensitive' } } });
  if (igual) return { ok: false, message: 'Já existe um funil com esse nome.' };
  await db.pipeline.updateMany({ where: { id: pipelineId }, data: { name: nome } });
  return ok;
}

/**
 * Apaga um funil levando todos os leads para outro: os ganhos para o "Fechou"
 * de lá, os perdidos para o "Perdeu" e os abertos para a entrada (ou, num funil
 * sem entrada como Agendados, para a primeira coluna). Não se apagam o
 * principal, onde entra o lead novo, nem um funil com etapa que a agenda move.
 */
export async function deletePipeline(
  db: TenantPrismaClient,
  tenantId: string,
  pipelineId: string,
  targetId: string,
): Promise<Result> {
  return db.$transaction(async (tx) => {
    const funis = await tx.pipeline.findMany({ where: { tenantId } });
    const funil = funis.find((p) => p.id === pipelineId);
    const destino = funis.find((p) => p.id === targetId);
    if (!funil) return { ok: false as const, message: 'Funil não encontrado.' };
    if (mainPipeline(funis)?.id === funil.id) return { ok: false as const, message: 'O funil principal não pode ser apagado.' };
    if (!destino || destino.id === funil.id) return { ok: false as const, message: 'Escolha para qual funil vão os leads.' };

    const [daqui, dela] = await Promise.all([
      tx.pipelineStage.findMany({ where: { tenantId, pipelineId: funil.id } }),
      tx.pipelineStage.findMany({ where: { tenantId, pipelineId: destino.id } }),
    ]);
    const daAgenda = daqui.find((s) => isAgendaRole(s.role));
    if (daAgenda && isAgendaRole(daAgenda.role)) {
      return {
        ok: false as const,
        message: `"${daAgenda.name}" recebe quem ${AGENDA_ROLE_LABEL[daAgenda.role].toLowerCase()}. Escolha outra etapa para isso em "Agenda e orçamentos" antes de apagar o funil.`,
      };
    }
    const papel = (role: 'NEW' | 'WON' | 'LOST') => dela.find((s) => s.role === role);
    const entrada = papel('NEW') ?? boardStages(dela)[0];
    if (!entrada || !papel('WON') || !papel('LOST')) return { ok: false as const, message: 'O funil de destino está incompleto.' };

    for (const s of daqui) {
      const para = s.role === 'WON' ? papel('WON')! : s.role === 'LOST' ? papel('LOST')! : entrada;
      const leads = await tx.lead.findMany({ where: { tenantId, stageId: s.id }, select: { id: true } });
      if (!leads.length) continue;
      await tx.lead.updateMany({ where: { tenantId, stageId: s.id }, data: { stageId: para.id, stageEnteredAt: new Date() } });
      await tx.leadActivity.createMany({
        data: leads.map((l) => ({
          tenantId,
          leadId: l.id,
          type: 'STAGE_CHANGED' as const,
          actorId: null,
          data: { from: s.id, to: para.id, reason: 'pipeline_deleted' },
        })),
      });
    }
    await tx.pipelineStage.deleteMany({ where: { tenantId, pipelineId: funil.id } });
    await tx.pipeline.deleteMany({ where: { id: funil.id, tenantId } });
    return ok;
  });
}

// ─── Agenda e orçamentos ─────────────────────────────────────────────────────

/**
 * Escolhe a etapa que recebe um evento da agenda ou dos orçamentos, em qualquer
 * funil. O papel é um por clínica: sai da etapa de antes, que volta a poder ser
 * apagada. `null` desliga o evento — a agenda deixa de mover o card nele.
 */
export async function setAgendaStage(
  db: TenantPrismaClient,
  tenantId: string,
  role: AgendaRole,
  stageId: string | null,
): Promise<Result> {
  if (!isAgendaRole(role)) return { ok: false, message: 'Evento inválido.' };
  return db.$transaction(async (tx) => {
    const stage = stageId ? await tx.pipelineStage.findFirst({ where: { id: stageId, tenantId } }) : null;
    if (stageId && !stage) return { ok: false as const, message: 'Etapa não encontrada.' };
    if (stage?.role === role) return ok;
    if (stage && isClosedStage(stage)) return { ok: false as const, message: 'Escolha uma etapa aberta do funil.' };
    if (stage?.role) {
      const outro = isAgendaRole(stage.role) ? `já recebe quem ${AGENDA_ROLE_LABEL[stage.role].toLowerCase()}` : 'é a entrada do funil';
      return { ok: false as const, message: `"${stage.name}" ${outro}. Escolha outra etapa.` };
    }
    await tx.pipelineStage.updateMany({ where: { tenantId, role }, data: { role: null } });
    if (stage) await tx.pipelineStage.updateMany({ where: { id: stage.id, tenantId }, data: { role } });
    return ok;
  });
}

// ─── Etapas ──────────────────────────────────────────────────────────────────

/**
 * Nova etapa entra por último entre as colunas do funil — antes de Fechou e
 * Perdeu. Sem funil, vai para o principal.
 */
export async function createStage(
  db: TenantPrismaClient,
  tenantId: string,
  name: string,
  color: string,
  pipelineId?: string,
): Promise<Result> {
  const nome = cleanName(name);
  if (!nome) return { ok: false, message: 'Escreva o nome da etapa.' };
  if (!isColor(color)) return { ok: false, message: 'Cor inválida.' };
  const funil = pipelineId ? await db.pipeline.findFirst({ where: { id: pipelineId } }) : mainPipeline(await db.pipeline.findMany());
  if (!funil) return { ok: false, message: 'Funil não encontrado.' };
  const stages = await db.pipelineStage.findMany({ where: { pipelineId: funil.id } });
  if (stages.some((s) => s.name.toLowerCase() === nome.toLowerCase())) {
    return { ok: false, message: 'Já existe uma etapa com esse nome neste funil.' };
  }
  if (stages.length >= 30) return { ok: false, message: 'Limite de 30 etapas por funil.' };
  const ultima = Math.max(0, ...stages.filter((s) => !isClosedStage(s)).map((s) => s.order));
  await db.pipelineStage.create({ data: { tenantId, pipelineId: funil.id, name: nome, color, order: ultima + 10, role: null } });
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
    const igual = await db.pipelineStage.findFirst({
      where: { id: { not: stageId }, pipelineId: stage.pipelineId, name: { equals: nome, mode: 'insensitive' } },
    });
    if (igual) return { ok: false, message: 'Já existe uma etapa com esse nome neste funil.' };
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
  const stage = await db.pipelineStage.findFirst({ where: { id: stageId }, select: { pipelineId: true } });
  if (!stage) return { ok: false, message: 'Etapa não encontrada.' };
  const colunas = (await db.pipelineStage.findMany({ where: { pipelineId: stage.pipelineId }, orderBy: { order: 'asc' } })).filter(
    (s) => !isClosedStage(s),
  );
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
    // Os leads ficam no mesmo funil.
    const target = targetId ? await tx.pipelineStage.findFirst({ where: { id: targetId, tenantId, pipelineId: stage.pipelineId } }) : null;
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
