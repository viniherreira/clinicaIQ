import { decrypt, getTenantClient, prisma, type TenantPrismaClient } from '@clinicaiq/db';
import { botExpired, continueBot, isKeyword, parseSteps, startBot, type BotAction, type BotDecision } from './bot-engine';
import { dispatchChat } from './chat-dispatch';
import { writeChatMessage } from './conversations';
import { createLead, moveLead, OPEN_LEAD } from './leads';
import { decryptPhone } from './phone';

/**
 * O robô rodando nas conversas: decide se começa (gatilho), segue o menu com o
 * que a pessoa respondeu e age no CRM. As regras estão em `bot-engine.ts`.
 *
 * Chamado depois de cada mensagem do contato (`crm/inbound.ts`).
 */

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

const CLEAR = { botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0 } as const;

export async function runBotOnInbound(tenantId: string, conversationId: string, messageId: string, now: Date = new Date()): Promise<'started' | 'continued' | 'none'> {
  const db = getTenantClient(tenantId);
  const conv = await db.conversation.findFirst({
    where: { id: conversationId },
    select: { id: true, status: true, leadId: true, patientId: true, contactName: true, phoneEncrypted: true, botFlowId: true, botStepId: true, botStartedAt: true, botMisses: true },
  });
  if (!conv || conv.status === 'DECLINED') return 'none';
  const msg = await db.chatMessage.findFirst({ where: { id: messageId }, select: { textEncrypted: true } });
  let text = '';
  try {
    text = msg?.textEncrypted ? decrypt(msg.textEncrypted, masterKey(), tenantId) : '';
  } catch {
    text = '';
  }

  // Já há robô nesta conversa?
  if (conv.botFlowId && conv.botStepId && !botExpired(conv.botStartedAt, now)) {
    const flow = await db.chatbotFlow.findFirst({ where: { id: conv.botFlowId, active: true } });
    const steps = flow ? parseSteps(flow.steps) : null;
    if (steps) {
      const d = continueBot(steps, { stepId: conv.botStepId, misses: conv.botMisses }, { text });
      await apply(db, tenantId, conv, flow!.id, d, now);
      return 'continued';
    }
  }
  if (conv.botFlowId) await db.conversation.updateMany({ where: { id: conv.id }, data: CLEAR });

  // Começa um? Contato novo: primeira mensagem de um número da Entrada.
  const flows = await db.chatbotFlow.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
  if (flows.length === 0) return 'none';
  const primeira =
    conv.status === 'INBOX' && (await db.chatMessage.count({ where: { conversationId: conv.id, origin: 'CONTACT' } })) === 1;
  const flow =
    flows.find((f) => f.trigger === 'KEYWORD' && isKeyword(text, f.keywords)) ??
    (primeira ? flows.find((f) => f.trigger === 'NEW_CONTACT') : undefined);
  const steps = flow ? parseSteps(flow.steps) : null;
  if (!flow || !steps) return 'none';
  await apply(db, tenantId, conv, flow.id, startBot(steps), now);
  return 'started';
}

type Conv = { id: string; leadId: string | null; patientId: string | null; contactName: string | null; phoneEncrypted: string };

async function apply(db: TenantPrismaClient, tenantId: string, conv: Conv, flowId: string, d: BotDecision, now: Date): Promise<void> {
  const actor = { tenantId, userId: null };
  // Uma de cada vez, esperando sair: assim chegam na ordem (resposta, depois o menu).
  for (const m of d.messages) {
    const r = await writeChatMessage(db, actor, conv.id, m.text, new Date(), { origin: 'BOT', buttons: m.buttons });
    if (r.ok) await dispatchChat(tenantId, r.messageId).catch(() => undefined);
  }
  for (const a of d.actions) await act(db, tenantId, conv, a).catch((e) => console.error('[robô] ação falhou', e instanceof Error ? e.message : e));
  await db.conversation.updateMany({
    where: { id: conv.id },
    data: d.next ? { botFlowId: flowId, botStepId: d.next.stepId, botStartedAt: now, botMisses: d.next.misses } : CLEAR,
  });
}

/** O lead aberto desta conversa; cria um em Novo (ou na etapa pedida) se não houver. */
async function openLead(db: TenantPrismaClient, tenantId: string, conv: Conv, stageId?: string): Promise<string | null> {
  if (conv.leadId) {
    const l = await db.lead.findFirst({ where: { id: conv.leadId, ...OPEN_LEAD }, select: { id: true } });
    if (l) return l.id;
  }
  const patient = conv.patientId ? await db.patient.findFirst({ where: { id: conv.patientId }, select: { name: true } }) : null;
  const r = await createLead(db, { tenantId, userId: null }, {
    name: patient?.name ?? conv.contactName ?? 'Contato do WhatsApp',
    phone: decryptPhone(conv.phoneEncrypted, tenantId),
    source: 'WHATSAPP',
    patientId: conv.patientId,
    stageId: stageId ?? null,
  });
  if (!r.ok) return null;
  conv.leadId = r.leadId;
  return r.leadId;
}

async function act(db: TenantPrismaClient, tenantId: string, conv: Conv, a: BotAction): Promise<void> {
  if (a.type === 'handoff') return;
  if (a.type === 'createLead') {
    await openLead(db, tenantId, conv, a.stageId);
    return;
  }
  const leadId = await openLead(db, tenantId, conv);
  if (!leadId) return;
  if (a.type === 'tag') {
    const tag = await db.leadTag.findFirst({ where: { id: a.tagId }, select: { id: true } });
    if (!tag) return;
    const { count } = await db.leadTagOnLead.createMany({ data: [{ tenantId, leadId, tagId: tag.id }], skipDuplicates: true });
    if (count) await db.leadActivity.create({ data: { tenantId, leadId, type: 'TAG_ADDED', actorId: null, data: { tagId: tag.id } } });
  } else if (a.type === 'stage') {
    await moveLead(db, { tenantId, userId: null }, leadId, { stageId: a.stageId, origin: { event: 'bot' } });
  } else if (a.type === 'assign') {
    const user = await db.user.findFirst({ where: { id: a.userId, active: true }, select: { id: true } });
    if (user) await db.lead.updateMany({ where: { id: leadId }, data: { assignedToId: user.id } });
  }
}

/** Robôs parados há mais de 24 horas deixam de valer (relógio do CRM). */
export async function expireBots(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.conversation.updateMany({
    where: { botFlowId: { not: null }, botStartedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    data: CLEAR,
  });
  return count;
}
