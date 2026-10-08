import type { LeadSource, Prisma, TenantPrismaClient } from '@clinicaiq/db';
import { isClosedStage, stageByRole, type StageLike } from './pipeline';
import { encryptPhone, phoneHash } from './phone';

/**
 * Operações do lead. Cada uma grava a mudança e o registro no histórico na
 * mesma transação: o card e a linha do tempo nunca discordam.
 *
 * Quem chama já passou pela guarda (`guardCrmAction`) e validou a entrada.
 * O `db` é o da clínica (`getTenantClient`), então nada aqui escapa dela.
 */

export interface Actor {
  tenantId: string;
  /** Null quando quem age é a automação. */
  userId: string | null;
}

/** Um lead está aberto enquanto não foi ganho, perdido nem excluído. */
export const OPEN_LEAD = { wonAt: null, lostAt: null, deletedAt: null } as const;

// ─── Mover ───────────────────────────────────────────────────────────────────

export interface LeadState {
  stageId: string;
  wonAt: Date | null;
  lostAt: Date | null;
}

export type MovePlan =
  | {
      ok: true;
      data: { stageId: string; wonAt: Date | null; lostAt: Date | null; lostReasonId: string | null };
      /** O que entra no histórico além da troca de etapa. */
      event: 'won' | 'lost' | 'reopened' | 'moved' | 'none';
    }
  | { ok: false; message: string };

/**
 * Decide o que muda quando um lead vai para outra etapa. Puro, para testar
 * as regras sem banco:
 *
 * - Perdeu exige motivo, e o motivo fica gravado.
 * - Fechou marca a data do ganho.
 * - Sair de Fechou ou Perdeu para uma coluna reabre o lead e limpa as datas.
 * - Ir de Fechou direto para Perdeu (ou o contrário) troca uma marca pela outra.
 */
export function planMove(
  lead: LeadState,
  stages: readonly StageLike[],
  targetStageId: string,
  lostReasonId: string | null | undefined,
  now: Date = new Date(),
): MovePlan {
  const target = stages.find((s) => s.id === targetStageId);
  if (!target) return { ok: false, message: 'Etapa não encontrada.' };

  if (target.role === 'LOST') {
    if (!lostReasonId) return { ok: false, message: 'Escolha o motivo da perda.' };
    return {
      ok: true,
      data: { stageId: target.id, wonAt: null, lostAt: now, lostReasonId },
      event: 'lost',
    };
  }

  if (target.role === 'WON') {
    return {
      ok: true,
      data: { stageId: target.id, wonAt: lead.wonAt ?? now, lostAt: null, lostReasonId: null },
      event: lead.wonAt ? 'none' : 'won',
    };
  }

  const reabrindo = Boolean(lead.wonAt || lead.lostAt);
  if (!reabrindo && lead.stageId === target.id) {
    return { ok: true, data: { stageId: target.id, wonAt: null, lostAt: null, lostReasonId: null }, event: 'none' };
  }
  return {
    ok: true,
    data: { stageId: target.id, wonAt: null, lostAt: null, lostReasonId: null },
    event: reabrindo ? 'reopened' : 'moved',
  };
}

/**
 * Nova ordem da coluna com o lead na posição pedida (0 = topo). Devolve os
 * ids na ordem final; quem grava numera de 0 em diante.
 */
export function reorderColumn(columnIds: readonly string[], leadId: string, index: number): string[] {
  const semEle = columnIds.filter((id) => id !== leadId);
  const i = Math.max(0, Math.min(index, semEle.length));
  return [...semEle.slice(0, i), leadId, ...semEle.slice(i)];
}

/** O cliente dentro de `db.$transaction(...)`, já com a extensão da clínica. */
type Tx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];

async function renumberColumn(tx: Tx, tenantId: string, stageId: string, orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, position) => tx.lead.updateMany({ where: { id, tenantId, stageId }, data: { position } })),
  );
}

export async function moveLead(
  db: TenantPrismaClient,
  actor: Actor,
  leadId: string,
  input: { stageId: string; index?: number; lostReasonId?: string | null; origin?: Record<string, unknown> },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { tenantId } = actor;
  return db.$transaction(async (tx) => {
    const [lead, stages] = await Promise.all([
      tx.lead.findFirst({ where: { id: leadId, tenantId, deletedAt: null } }),
      tx.pipelineStage.findMany({ where: { tenantId } }),
    ]);
    if (!lead) return { ok: false as const, message: 'Lead não encontrado.' };

    if (input.lostReasonId) {
      const motivo = await tx.lostReason.findFirst({ where: { id: input.lostReasonId, tenantId } });
      if (!motivo) return { ok: false as const, message: 'Motivo de perda não encontrado.' };
    }

    const plan = planMove(lead, stages, input.stageId, input.lostReasonId);
    if (!plan.ok) return plan;

    const mudouEtapa = plan.data.stageId !== lead.stageId;
    await tx.lead.update({
      where: { id: lead.id, tenantId },
      data: {
        ...plan.data,
        ...(mudouEtapa ? { stageEnteredAt: new Date() } : {}),
        updatedById: actor.userId,
      },
    });

    // Fechou e Perdeu não são colunas: não há ordem a manter lá.
    const target = stages.find((s) => s.id === plan.data.stageId)!;
    if (!isClosedStage(target)) {
      const coluna = await tx.lead.findMany({
        where: { tenantId, stageId: target.id, ...OPEN_LEAD },
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
        select: { id: true },
      });
      const ordem = reorderColumn(
        coluna.map((l) => l.id),
        lead.id,
        input.index ?? (mudouEtapa ? 0 : coluna.findIndex((l) => l.id === lead.id)),
      );
      await renumberColumn(tx, tenantId, target.id, ordem);
    }

    if (mudouEtapa) {
      await tx.leadActivity.create({
        data: {
          tenantId,
          leadId: lead.id,
          type: plan.event === 'lost' ? 'LOST' : plan.event === 'reopened' ? 'REOPENED' : 'STAGE_CHANGED',
          actorId: actor.userId,
          data: {
            from: lead.stageId,
            to: plan.data.stageId,
            ...(plan.data.lostReasonId ? { lostReasonId: plan.data.lostReasonId } : {}),
            ...(input.origin ?? {}),
          } as Prisma.InputJsonValue,
        },
      });
    }
    return { ok: true as const };
  });
}

// ─── Criar e editar ──────────────────────────────────────────────────────────

export interface NewLeadInput {
  name: string;
  phone: string;
  title?: string | null;
  email?: string | null;
  source?: LeadSource;
  interestProcedureId?: string | null;
  estimatedValueCents?: number | null;
  notes?: string | null;
  assignedToId?: string | null;
  patientId?: string | null;
  /** Etapa inicial; padrão: a de papel NEW. */
  stageId?: string | null;
}

export async function createLead(
  db: TenantPrismaClient,
  actor: Actor,
  input: NewLeadInput,
): Promise<{ ok: true; leadId: string } | { ok: false; message: string }> {
  const { tenantId } = actor;
  return db.$transaction(async (tx) => {
    const stages = await tx.pipelineStage.findMany({ where: { tenantId } });
    const stage = input.stageId ? stages.find((s) => s.id === input.stageId) : stageByRole(stages, 'NEW');
    if (!stage || isClosedStage(stage)) return { ok: false as const, message: 'Escolha uma etapa aberta do funil.' };

    // Novo entra no topo da coluna, como no Kommo: é o que precisa de atenção.
    const topo = await tx.lead.findFirst({
      where: { tenantId, stageId: stage.id, ...OPEN_LEAD },
      orderBy: { position: 'asc' },
      select: { position: true },
    });

    const lead = await tx.lead.create({
      data: {
        tenantId,
        name: input.name.trim(),
        title: input.title?.trim() || null,
        phoneEncrypted: encryptPhone(input.phone, tenantId),
        phoneHash: phoneHash(input.phone, tenantId),
        email: input.email?.trim() || null,
        source: input.source ?? 'MANUAL',
        interestProcedureId: input.interestProcedureId || null,
        estimatedValueCents: input.estimatedValueCents ?? null,
        notes: input.notes?.trim() || null,
        assignedToId: input.assignedToId === undefined ? actor.userId : input.assignedToId,
        patientId: input.patientId || null,
        stageId: stage.id,
        position: (topo?.position ?? 1) - 1,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });

    await tx.leadActivity.create({
      data: {
        tenantId,
        leadId: lead.id,
        type: 'CREATED',
        actorId: actor.userId,
        data: { source: lead.source, stageId: stage.id },
      },
    });
    return { ok: true as const, leadId: lead.id };
  });
}

export type LeadPatch = Partial<
  Pick<NewLeadInput, 'name' | 'title' | 'email' | 'source' | 'interestProcedureId' | 'estimatedValueCents' | 'notes'>
> & { phone?: string; assignedToId?: string | null };

export async function updateLead(
  db: TenantPrismaClient,
  actor: Actor,
  leadId: string,
  patch: LeadPatch,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { tenantId } = actor;
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id: leadId, tenantId, deletedAt: null } });
    if (!lead) return { ok: false as const, message: 'Lead não encontrado.' };

    const data: Prisma.LeadUncheckedUpdateInput = { updatedById: actor.userId };
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.title !== undefined) data.title = patch.title?.trim() || null;
    if (patch.email !== undefined) data.email = patch.email?.trim() || null;
    if (patch.source !== undefined) data.source = patch.source;
    if (patch.interestProcedureId !== undefined) data.interestProcedureId = patch.interestProcedureId || null;
    if (patch.estimatedValueCents !== undefined) data.estimatedValueCents = patch.estimatedValueCents;
    if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
    if (patch.phone !== undefined) {
      data.phoneEncrypted = encryptPhone(patch.phone, tenantId);
      data.phoneHash = phoneHash(patch.phone, tenantId);
    }
    if (patch.assignedToId !== undefined) data.assignedToId = patch.assignedToId;

    await tx.lead.update({ where: { id: lead.id, tenantId }, data });

    if (patch.assignedToId !== undefined && patch.assignedToId !== lead.assignedToId) {
      await tx.leadActivity.create({
        data: { tenantId, leadId, type: 'ASSIGNED', actorId: actor.userId, data: { to: patch.assignedToId } },
      });
    }
    return { ok: true as const };
  });
}

/** Liga o lead a um paciente (depois de converter ou vincular). */
export async function linkPatient(
  db: TenantPrismaClient,
  actor: Actor,
  leadId: string,
  patientId: string,
  how: 'converted' | 'linked',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { tenantId } = actor;
  return db.$transaction(async (tx) => {
    const [lead, patient] = await Promise.all([
      tx.lead.findFirst({ where: { id: leadId, tenantId, deletedAt: null } }),
      tx.patient.findFirst({ where: { id: patientId, tenantId, deletedAt: null }, select: { id: true, name: true } }),
    ]);
    if (!lead) return { ok: false as const, message: 'Lead não encontrado.' };
    if (!patient) return { ok: false as const, message: 'Paciente não encontrado.' };

    await tx.lead.update({
      where: { id: lead.id, tenantId },
      data: { patientId: patient.id, name: patient.name, updatedById: actor.userId },
    });
    await tx.leadActivity.create({
      data: { tenantId, leadId, type: 'CONVERTED', actorId: actor.userId, data: { patientId: patient.id, how } },
    });
    return { ok: true as const };
  });
}

export async function addNote(db: TenantPrismaClient, actor: Actor, leadId: string, text: string) {
  const { tenantId } = actor;
  const lead = await db.lead.findFirst({ where: { id: leadId, deletedAt: null }, select: { id: true } });
  if (!lead) return { ok: false as const, message: 'Lead não encontrado.' };
  await db.leadActivity.create({
    data: { tenantId, leadId, type: 'NOTE', actorId: actor.userId, data: { text: text.trim() } },
  });
  return { ok: true as const };
}

/** Troca as tags do lead pela lista dada, registrando o que entrou e saiu. */
export async function setTags(db: TenantPrismaClient, actor: Actor, leadId: string, tagIds: string[]) {
  const { tenantId } = actor;
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id: leadId, tenantId, deletedAt: null }, select: { id: true } });
    if (!lead) return { ok: false as const, message: 'Lead não encontrado.' };

    const validas = await tx.leadTag.findMany({ where: { tenantId, id: { in: tagIds } }, select: { id: true } });
    const queridas = new Set(validas.map((t) => t.id));
    const atuais = new Set(
      (await tx.leadTagOnLead.findMany({ where: { tenantId, leadId }, select: { tagId: true } })).map((t) => t.tagId),
    );

    const entram = [...queridas].filter((id) => !atuais.has(id));
    const saem = [...atuais].filter((id) => !queridas.has(id));

    if (saem.length) await tx.leadTagOnLead.deleteMany({ where: { tenantId, leadId, tagId: { in: saem } } });
    if (entram.length) {
      await tx.leadTagOnLead.createMany({ data: entram.map((tagId) => ({ tenantId, leadId, tagId })) });
    }
    const historico = [
      ...entram.map((tagId) => ({ type: 'TAG_ADDED' as const, tagId })),
      ...saem.map((tagId) => ({ type: 'TAG_REMOVED' as const, tagId })),
    ];
    if (historico.length) {
      await tx.leadActivity.createMany({
        data: historico.map((h) => ({ tenantId, leadId, type: h.type, actorId: actor.userId, data: { tagId: h.tagId } })),
      });
    }
    return { ok: true as const };
  });
}

export async function softDeleteLead(db: TenantPrismaClient, actor: Actor, leadId: string) {
  const r = await db.lead.updateMany({
    where: { id: leadId, deletedAt: null },
    data: { deletedAt: new Date(), updatedById: actor.userId },
  });
  return r.count ? { ok: true as const } : { ok: false as const, message: 'Lead não encontrado.' };
}
