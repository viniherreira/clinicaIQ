import { getTenantClient, prisma, type AutomationAction, type Prisma, type TenantPrismaClient } from '@clinicaiq/db';
import { assignLead, pickAssignee } from './assignment';
import { DISTRIBUTE } from './distribution-rules';
import { renderTemplateBody } from '@clinicaiq/whatsapp';
import { activeCloudAccount, windowOpen } from './cloud';
import { ensureConversationForLead, writeChatMessage } from './conversations';
import { createTask } from './tasks';
import { moveLead } from './leads';
import { queueTriggeredBot } from './bot-queue';
import { startBotOnConversation } from './bot';
import { parseConditions, type StageTriggerKind } from './stage-automation-rules';

export { queueStageAutomations } from './stage-queue';

/**
 * Automações por etapa — o "funil digital" do Kommo. Quando um lead entra numa
 * etapa (criado nela, movido para ela, ou os dois), e se as condições baterem
 * (dia, horário, origem, tag), a clínica pode mandar uma mensagem, rodar um
 * bot, criar uma tarefa, pôr ou tirar tags, trocar o responsável ou mudar o
 * lead de etapa, na hora ou depois de um tempo.
 *
 * Entrar na etapa agenda uma execução por automação (`AutomationRun`); o
 * relógio do CRM roda as que chegaram na hora. Se o lead já saiu da etapa
 * quando a hora chegar, a ação não roda.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export type AutomationConfig =
  | { action: 'SEND_MESSAGE'; text?: string; templateId?: string; params?: string[] }
  | { action: 'CREATE_TASK'; text: string; dueHours: number; assignTo: string }
  | { action: 'ADD_TAG' | 'REMOVE_TAG'; tagIds: string[] }
  | { action: 'ASSIGN_USER'; userId: string }
  | { action: 'RUN_BOT'; flowId: string }
  | { action: 'MOVE_STAGE'; stageId: string };

/** As tags da automação (as antigas guardavam uma só, em `tagId`). */
export function configTagIds(cfg: Record<string, unknown>): string[] {
  if (Array.isArray(cfg.tagIds)) return cfg.tagIds.filter((t): t is string => typeof t === 'string' && t.length > 0);
  return typeof cfg.tagId === 'string' && cfg.tagId ? [cfg.tagId] : [];
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';
const fill = (s: string, name: string) => s.replace(/\{nome\}/gi, firstName(name));

/** Confere e limpa o que veio da tela. */
export function parseConfig(action: AutomationAction, raw: unknown): Result<{ config: Record<string, unknown> }> {
  const c = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  switch (action) {
    case 'SEND_MESSAGE': {
      const text = str(c.text).slice(0, 1000);
      const templateId = str(c.templateId);
      const params = Array.isArray(c.params) ? c.params.map(str).slice(0, 10) : [];
      if (!text && !templateId) return { ok: false, message: 'Escreva a mensagem ou escolha um modelo.' };
      return { ok: true, config: { ...(text ? { text } : {}), ...(templateId ? { templateId, params } : {}) } };
    }
    case 'CREATE_TASK': {
      const text = str(c.text).slice(0, 300);
      const dueHours = Number(c.dueHours);
      if (!text) return { ok: false, message: 'Escreva a tarefa.' };
      if (!Number.isFinite(dueHours) || dueHours < 0 || dueHours > 24 * 60) return { ok: false, message: 'Prazo da tarefa inválido.' };
      return { ok: true, config: { text, dueHours: Math.round(dueHours), assignTo: str(c.assignTo) || 'responsible' } };
    }
    case 'ADD_TAG':
    case 'REMOVE_TAG': {
      const tagIds = [...new Set(configTagIds(c).map((t) => t.trim()).filter(Boolean))].slice(0, 20);
      return tagIds.length ? { ok: true, config: { tagIds } } : { ok: false, message: 'Escolha ao menos uma tag.' };
    }
    case 'ASSIGN_USER':
      return str(c.userId) ? { ok: true, config: { userId: str(c.userId) } } : { ok: false, message: 'Escolha a pessoa.' };
    case 'RUN_BOT':
      return str(c.flowId) ? { ok: true, config: { flowId: str(c.flowId) } } : { ok: false, message: 'Escolha o bot.' };
    case 'MOVE_STAGE':
      return str(c.stageId) ? { ok: true, config: { stageId: str(c.stageId) } } : { ok: false, message: 'Escolha a etapa.' };
  }
}

const TRIGGERS: readonly StageTriggerKind[] = ['ENTER', 'CREATED', 'MOVED'];

// ─── Cadastro ────────────────────────────────────────────────────────────────

export async function saveAutomation(
  db: TenantPrismaClient,
  tenantId: string,
  input: {
    id?: string;
    stageId: string;
    action: AutomationAction;
    config: unknown;
    delayMinutes: number;
    trigger?: StageTriggerKind;
    conditions?: unknown;
  },
): Promise<Result> {
  const stage = await db.pipelineStage.findFirst({ where: { id: input.stageId }, select: { id: true } });
  if (!stage) return { ok: false, message: 'Etapa não encontrada.' };
  const parsed = parseConfig(input.action, input.config);
  if (!parsed.ok) return parsed;
  const delayMinutes = Math.max(0, Math.min(60 * 24 * 30, Math.round(Number(input.delayMinutes) || 0)));
  const trigger = TRIGGERS.includes(input.trigger as StageTriggerKind) ? (input.trigger as StageTriggerKind) : 'ENTER';
  const conditions = parseConditions(input.conditions);
  const cfg = parsed.config as Record<string, string>;

  // O que a automação aponta precisa ser desta clínica.
  const tagIds = new Set([...(input.action === 'ADD_TAG' || input.action === 'REMOVE_TAG' ? configTagIds(parsed.config) : []), ...(conditions.tagIds ?? [])]);
  if (tagIds.size && (await db.leadTag.count({ where: { id: { in: [...tagIds] } } })) !== tagIds.size) {
    return { ok: false, message: 'Tag não encontrada.' };
  }
  if (input.action === 'RUN_BOT' && !(await db.chatbotFlow.findFirst({ where: { id: cfg.flowId }, select: { id: true } }))) {
    return { ok: false, message: 'Bot não encontrado.' };
  }
  if (input.action === 'MOVE_STAGE') {
    const destino = await db.pipelineStage.findFirst({ where: { id: cfg.stageId }, select: { id: true, role: true } });
    if (!destino) return { ok: false, message: 'Etapa de destino não encontrada.' };
    if (destino.id === stage.id) return { ok: false, message: 'Escolha outra etapa: o lead já está nesta.' };
    if (destino.role === 'LOST') return { ok: false, message: 'Perder o lead não é automático: falta o motivo.' };
  }
  if (input.action === 'ASSIGN_USER' && cfg.userId !== DISTRIBUTE && !(await db.user.findFirst({ where: { id: cfg.userId, active: true } }))) {
    return { ok: false, message: 'Pessoa não encontrada.' };
  }
  if (input.action === 'CREATE_TASK' && cfg.assignTo !== 'responsible' && !(await db.user.findFirst({ where: { id: cfg.assignTo, active: true } }))) {
    return { ok: false, message: 'Pessoa não encontrada.' };
  }
  if (input.action === 'SEND_MESSAGE' && cfg.templateId && !(await db.messageTemplate.findFirst({ where: { id: cfg.templateId } }))) {
    return { ok: false, message: 'Modelo não encontrado.' };
  }

  if (input.id) {
    const r = await db.stageAutomation.updateMany({
      where: { id: input.id },
      data: {
        stageId: stage.id,
        action: input.action,
        config: parsed.config as Prisma.InputJsonValue,
        delayMinutes,
        trigger,
        conditions: conditions as Prisma.InputJsonValue,
      },
    });
    return r.count ? { ok: true } : { ok: false, message: 'Automação não encontrada.' };
  }
  const ultima = await db.stageAutomation.findFirst({ where: { stageId: stage.id }, orderBy: { order: 'desc' }, select: { order: true } });
  await db.stageAutomation.create({
    data: {
      tenantId,
      stageId: stage.id,
      action: input.action,
      config: parsed.config as Prisma.InputJsonValue,
      delayMinutes,
      trigger,
      conditions: conditions as Prisma.InputJsonValue,
      order: (ultima?.order ?? 0) + 10,
    },
  });
  return { ok: true };
}

export async function toggleAutomation(db: TenantPrismaClient, id: string, active: boolean): Promise<Result> {
  const r = await db.stageAutomation.updateMany({ where: { id }, data: { active } });
  return r.count ? { ok: true } : { ok: false, message: 'Automação não encontrada.' };
}

/** Uma cópia logo abaixo da original, desligada para a pessoa ajustar antes. */
export async function duplicateAutomation(db: TenantPrismaClient, tenantId: string, id: string): Promise<Result> {
  const a = await db.stageAutomation.findFirst({ where: { id } });
  if (!a) return { ok: false, message: 'Automação não encontrada.' };
  await db.stageAutomation.create({
    data: {
      tenantId,
      stageId: a.stageId,
      action: a.action,
      config: a.config as Prisma.InputJsonValue,
      trigger: a.trigger,
      conditions: a.conditions as Prisma.InputJsonValue,
      delayMinutes: a.delayMinutes,
      active: false,
      order: a.order + 1,
    },
  });
  return { ok: true };
}

export async function deleteAutomation(db: TenantPrismaClient, id: string): Promise<Result> {
  await db.automationRun.deleteMany({ where: { automationId: id, status: 'PENDING' } });
  const r = await db.stageAutomation.deleteMany({ where: { id } });
  return r.count ? { ok: true } : { ok: false, message: 'Automação não encontrada.' };
}

// ─── Rodar ───────────────────────────────────────────────────────────────────

async function execute(
  db: TenantPrismaClient,
  tenantId: string,
  run: { id: string; leadId: string; stageEnteredAt: Date },
  automation: { stageId: string; action: AutomationAction; config: Prisma.JsonValue },
): Promise<{ status: 'DONE' | 'SKIPPED' | 'FAILED'; error?: string }> {
  const lead = await db.lead.findFirst({
    where: { id: run.leadId },
    select: {
      id: true,
      name: true,
      stageId: true,
      stageEnteredAt: true,
      deletedAt: true,
      assignedToId: true,
      whatsappOptOut: true,
      patient: { select: { whatsappOptOut: true } },
    },
  });
  if (!lead || lead.deletedAt) return { status: 'SKIPPED', error: 'Lead excluído.' };
  if (lead.stageId !== automation.stageId || lead.stageEnteredAt.getTime() !== run.stageEnteredAt.getTime()) {
    return { status: 'SKIPPED', error: 'O lead saiu da etapa antes da hora.' };
  }
  const cfg = automation.config as Record<string, unknown>;
  const actor = { tenantId, userId: null };

  switch (automation.action) {
    case 'SEND_MESSAGE': {
      if (lead.whatsappOptOut || lead.patient?.whatsappOptOut) return { status: 'SKIPPED', error: 'Pediu para não receber mensagens.' };
      const conv = await ensureConversationForLead(db, tenantId, lead.id);
      if (!conv.ok) return { status: 'FAILED', error: conv.message };
      const cloud = await activeCloudAccount(tenantId);
      const c = await db.conversation.findFirst({ where: { id: conv.conversationId }, select: { lastInboundAt: true } });
      const template = typeof cfg.templateId === 'string' ? await db.messageTemplate.findFirst({ where: { id: cfg.templateId, status: 'APPROVED' } }) : null;
      const text = typeof cfg.text === 'string' ? fill(cfg.text, lead.name) : '';

      // API oficial: texto livre só dentro das 24 horas; fora, o modelo.
      const useTemplate = cloud && (!text || !windowOpen(c?.lastInboundAt ?? null)) ? template : null;
      if (cloud && !useTemplate && !(text && windowOpen(c?.lastInboundAt ?? null))) {
        return { status: 'FAILED', error: 'Fora das 24 horas da API oficial e sem modelo aprovado na automação.' };
      }
      if (!cloud && !text) return { status: 'FAILED', error: 'No QR code, a automação precisa de texto (modelo é só da API oficial).' };

      const params = ((cfg.params as string[] | undefined) ?? []).map((p) => fill(p, lead.name));
      const r = useTemplate
        ? await writeChatMessage(db, actor, conv.conversationId, renderTemplateBody(useTemplate.body, params), new Date(), {
            origin: 'BOT',
            template: { name: useTemplate.name, lang: useTemplate.language, params },
          })
        : await writeChatMessage(db, actor, conv.conversationId, text, new Date(), { origin: 'BOT' });
      return r.ok ? { status: 'DONE' } : { status: 'FAILED', error: r.message };
    }
    case 'CREATE_TASK': {
      const assignTo = cfg.assignTo === 'responsible' ? lead.assignedToId : String(cfg.assignTo);
      const r = await createTask(db, actor, lead.id, {
        text: fill(String(cfg.text ?? ''), lead.name),
        dueAt: new Date(Date.now() + Number(cfg.dueHours ?? 0) * 3_600_000),
        assignedToId: assignTo ?? undefined,
        origin: 'AUTOMATION',
      });
      return r.ok ? { status: 'DONE' } : { status: 'FAILED', error: r.message };
    }
    case 'ADD_TAG': {
      const tags = await db.leadTag.findMany({ where: { id: { in: configTagIds(cfg) } }, select: { id: true } });
      if (tags.length === 0) return { status: 'FAILED', error: 'Tag apagada.' };
      const ja = new Set((await db.leadTagOnLead.findMany({ where: { leadId: lead.id }, select: { tagId: true } })).map((t) => t.tagId));
      const novas = tags.map((t) => t.id).filter((t) => !ja.has(t));
      if (novas.length === 0) return { status: 'DONE' };
      await db.leadTagOnLead.createMany({ data: novas.map((tagId) => ({ tenantId, leadId: lead.id, tagId })), skipDuplicates: true });
      await db.leadActivity.createMany({ data: novas.map((tagId) => ({ tenantId, leadId: lead.id, type: 'TAG_ADDED' as const, actorId: null, data: { tagId } })) });
      // Bot com gatilho "ganhou a tag".
      await queueTriggeredBot(db, tenantId, lead.id, { tagIds: novas });
      return { status: 'DONE' };
    }
    case 'REMOVE_TAG': {
      const tem = (await db.leadTagOnLead.findMany({ where: { leadId: lead.id, tagId: { in: configTagIds(cfg) } }, select: { tagId: true } })).map((t) => t.tagId);
      if (tem.length === 0) return { status: 'DONE' };
      await db.leadTagOnLead.deleteMany({ where: { leadId: lead.id, tagId: { in: tem } } });
      await db.leadActivity.createMany({ data: tem.map((tagId) => ({ tenantId, leadId: lead.id, type: 'TAG_REMOVED' as const, actorId: null, data: { tagId } })) });
      return { status: 'DONE' };
    }
    case 'RUN_BOT': {
      if (lead.whatsappOptOut || lead.patient?.whatsappOptOut) return { status: 'SKIPPED', error: 'Pediu para não receber mensagens.' };
      const flow = await db.chatbotFlow.findFirst({ where: { id: String(cfg.flowId ?? '') }, select: { id: true, active: true } });
      if (!flow) return { status: 'FAILED', error: 'Bot apagado.' };
      if (!flow.active) return { status: 'FAILED', error: 'O bot está desligado.' };
      const conv = await ensureConversationForLead(db, tenantId, lead.id);
      if (!conv.ok) return { status: 'FAILED', error: conv.message };
      return (await startBotOnConversation(tenantId, conv.conversationId, flow.id))
        ? { status: 'DONE' }
        : { status: 'FAILED', error: 'Não foi possível começar o bot nesta conversa.' };
    }
    case 'MOVE_STAGE': {
      // Trava contra o vaivém (A move para B, B move para A).
      const recentes = await db.automationRun.count({
        where: { leadId: lead.id, status: 'DONE', automation: { action: 'MOVE_STAGE' }, doneAt: { gte: new Date(Date.now() - 10 * 60_000) } },
      });
      if (recentes >= 5) return { status: 'SKIPPED', error: 'O lead já mudou de etapa sozinho muitas vezes seguidas.' };
      const r = await moveLead(db, actor, lead.id, { stageId: String(cfg.stageId ?? ''), origin: { automation: true } });
      return r.ok ? { status: 'DONE' } : { status: 'FAILED', error: r.message };
    }
    case 'ASSIGN_USER': {
      // "Distribuir pela equipe": a vez de alguém, pelas regras da distribuição.
      const distribuir = cfg.userId === DISTRIBUTE;
      const userId = distribuir ? await pickAssignee(tenantId) : String(cfg.userId ?? '');
      if (!userId) return { status: 'FAILED', error: 'Ninguém da equipe está recebendo leads.' };
      const r = await assignLead(db, { tenantId, userId: null }, lead.id, userId, distribuir ? 'distribution' : 'automation');
      return r.ok ? { status: 'DONE' } : { status: 'FAILED', error: r.message };
    }
  }
}

/** As execuções que chegaram na hora. Pelo relógio, ou logo depois de mover (uma clínica só). */
export async function runDueAutomations(now: Date = new Date(), opts: { tenantId?: string; limit?: number } = {}): Promise<number> {
  const due = await prisma.automationRun.findMany({
    where: { status: 'PENDING', doneAt: null, dueAt: { lte: now }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
    select: { id: true, tenantId: true, leadId: true, stageEnteredAt: true, automation: { select: { stageId: true, action: true, config: true, active: true } } },
    orderBy: { dueAt: 'asc' },
    take: opts.limit ?? 100,
  });
  let n = 0;
  for (const run of due) {
    // Reserva (o relógio e o "logo depois de mover" podem pegar a mesma).
    const claim = await prisma.automationRun.updateMany({ where: { id: run.id, status: 'PENDING', doneAt: null }, data: { doneAt: now } });
    if (claim.count === 0) continue;
    let result: { status: 'DONE' | 'SKIPPED' | 'FAILED'; error?: string };
    if (!run.automation.active) result = { status: 'SKIPPED', error: 'Automação desligada.' };
    else {
      try {
        result = await execute(getTenantClient(run.tenantId), run.tenantId, run, run.automation);
      } catch (e) {
        result = { status: 'FAILED', error: e instanceof Error ? e.message.slice(0, 200) : 'erro' };
      }
    }
    await prisma.automationRun.update({ where: { id: run.id }, data: { status: result.status, error: result.error ?? null } });
    if (result.status === 'DONE') n += 1;
  }
  return n;
}
