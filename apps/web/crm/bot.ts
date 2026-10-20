import { decrypt, getTenantClient, prisma, type TenantPrismaClient } from '@clinicaiq/db';
import { BOT_IDLE_MS, DEFAULT_HOURS, fitsAudience, isOpenAt, pickBot, shouldStart } from './bot-engine';
import { START_PENDING } from './bot-queue';
import { dispatchChat } from './chat-dispatch';
import { writeChatMessage } from './conversations';
import { runFlow, type FlowContext, type FlowDoc, type FlowEffect, type FlowEvent, type FlowResult, type FlowState } from './flow-engine';
import { readFlow } from './flow-legacy';
import { createLead, moveLead, OPEN_LEAD } from './leads';
import { setLeadFields } from './lead-fields';
import { decryptPhone } from './phone';

/**
 * O robô rodando nas conversas, no jeito do Salesbot do Kommo: decide se
 * começa (gatilho), anda pelos passos com o que a pessoa respondeu (ou quando
 * o tempo passa) e age no CRM. As regras estão em `flow-engine.ts`; robôs do
 * formato antigo são convertidos na leitura (`flow-legacy.ts`).
 *
 * Chamado depois de cada mensagem do contato (`crm/inbound.ts`) e pelo relógio
 * do CRM (`wakeBots`, para "sem resposta" e pausas).
 */

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

const CLEAR = { botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0, botWakeAt: null } as const;

type Conv = {
  id: string;
  status: string;
  leadId: string | null;
  patientId: string | null;
  contactName: string | null;
  phoneEncrypted: string;
  botFlowId: string | null;
  botStepId: string | null;
  botStartedAt: Date | null;
  botMisses: number;
  botWakeAt: Date | null;
};

const CONV_SELECT = {
  id: true,
  status: true,
  leadId: true,
  patientId: true,
  contactName: true,
  phoneEncrypted: true,
  botFlowId: true,
  botStepId: true,
  botStartedAt: true,
  botMisses: true,
  botWakeAt: true,
} as const;

/** Robô esperando resposta sem hora para acordar vale 24 h; com hora marcada (pausa), vale até lá. */
const waitingValid = (c: Pick<Conv, 'botStartedAt' | 'botWakeAt'>, now: Date) =>
  c.botWakeAt != null || (c.botStartedAt != null && now.getTime() - c.botStartedAt.getTime() <= BOT_IDLE_MS);

/**
 * `opts.newContact`: quem chama já sabe se é a primeira mensagem de um número da
 * Entrada (a captação pode ter acabado de criar o lead e tirado a conversa de lá).
 */
export async function runBotOnInbound(
  tenantId: string,
  conversationId: string,
  messageId: string,
  now: Date = new Date(),
  opts: { newContact?: boolean } = {},
): Promise<'started' | 'continued' | 'none'> {
  const db = getTenantClient(tenantId);
  const conv = await db.conversation.findFirst({ where: { id: conversationId }, select: CONV_SELECT });
  if (!conv || conv.status === 'DECLINED') return 'none';
  const msg = await db.chatMessage.findFirst({ where: { id: messageId }, select: { textEncrypted: true } });
  let text = '';
  try {
    text = msg?.textEncrypted ? decrypt(msg.textEncrypted, masterKey(), tenantId) : '';
  } catch {
    text = '';
  }

  // Já há robô esperando nesta conversa?
  if (conv.botFlowId && conv.botStepId && waitingValid(conv, now)) {
    const flow = await db.chatbotFlow.findFirst({ where: { id: conv.botFlowId, active: true } });
    const doc = flow ? readFlow(flow.steps) : null;
    if (flow && doc) {
      // Gatilho de etapa/tag esperando o relógio e a pessoa escreveu antes: começa agora, com a mensagem dela.
      if (conv.botStepId === START_PENDING) {
        await step(db, tenantId, conv, flow, doc, null, { kind: 'start', text }, now);
        return 'started';
      }
      await step(db, tenantId, conv, flow, doc, { stepId: conv.botStepId, misses: conv.botMisses, wakeAt: conv.botWakeAt }, { kind: 'message', text }, now);
      return 'continued';
    }
  }
  if (conv.botFlowId) await db.conversation.updateMany({ where: { id: conv.id }, data: CLEAR });

  // Começa um? Contato novo (primeira mensagem de um número da Entrada) ou palavra-chave.
  // Cada robô tem horário e público (tags do lead); o que pede tag vem antes do geral.
  const flows = (await db.chatbotFlow.findMany({ where: { active: true, trigger: { in: ['NEW_CONTACT', 'KEYWORD'] } }, orderBy: { createdAt: 'asc' } })).flatMap((f) => {
    const doc = readFlow(f.steps);
    return doc ? [{ flow: f, id: f.id, trigger: f.trigger as 'NEW_CONTACT' | 'KEYWORD', keywords: f.keywords, steps: doc }] : [];
  });
  if (flows.length === 0) return 'none';
  const primeira =
    opts.newContact ??
    (conv.status === 'INBOX' && (await db.chatMessage.count({ where: { conversationId: conv.id, origin: 'CONTACT' } })) === 1);
  // As tags do lead aberto desta conversa (a captação pode ter acabado de pôr).
  const tagIds = conv.leadId
    ? (await db.leadTagOnLead.findMany({ where: { leadId: conv.leadId, lead: { deletedAt: null } }, select: { tagId: true } })).map((t) => t.tagId)
    : [];
  const escolhido = pickBot(flows, { text, newContact: primeira, tagIds, now });
  if (!escolhido) return 'none';
  await step(db, tenantId, conv, escolhido.flow, escolhido.steps, null, { kind: 'start', text }, now);
  return 'started';
}

/** Começa um robô numa conversa (gatilhos de etapa, tag, sem resposta e "iniciar outro robô"). */
export async function startBotOnConversation(tenantId: string, conversationId: string, flowId: string, now: Date = new Date()): Promise<boolean> {
  const db = getTenantClient(tenantId);
  const [conv, flow] = await Promise.all([
    db.conversation.findFirst({ where: { id: conversationId }, select: CONV_SELECT }),
    db.chatbotFlow.findFirst({ where: { id: flowId, active: true } }),
  ]);
  const doc = flow ? readFlow(flow.steps) : null;
  if (!conv || conv.status === 'DECLINED' || !flow || !doc) return false;
  await step(db, tenantId, conv, flow, doc, null, { kind: 'start' }, now);
  return true;
}

type Flow = { id: string; state: unknown };

/** Roda o motor, executa o que ele pediu e guarda onde ficou esperando. */
async function step(
  db: TenantPrismaClient,
  tenantId: string,
  conv: Conv,
  flow: Flow,
  doc: FlowDoc,
  state: FlowState | null,
  event: FlowEvent,
  now: Date,
  depth = 0,
): Promise<void> {
  const contadores = (flow.state && typeof flow.state === 'object' ? flow.state : {}) as Record<string, number>;
  const usados: string[] = [];
  const ctx = await contextOf(db, tenantId, conv, doc, now, (id) => {
    usados.push(id);
    return contadores[id] ?? 0;
  });
  const r: FlowResult = runFlow(doc, state, event, ctx);
  await apply(db, tenantId, conv, flow.id, r, now, depth);
  // Rodízio: a próxima vez vai para a opção seguinte.
  for (const id of usados) {
    await db.$executeRaw`
      UPDATE "chatbot_flows"
      SET "state" = jsonb_set(COALESCE("state", '{}'::jsonb), ARRAY[${id}]::text[], to_jsonb(COALESCE(("state"->>${id})::int, 0) + 1))
      WHERE "id" = ${flow.id} AND "tenantId" = ${tenantId}`;
  }
}

async function contextOf(
  db: TenantPrismaClient,
  tenantId: string,
  conv: Conv,
  doc: FlowDoc,
  now: Date,
  roundRobin: FlowContext['roundRobin'],
): Promise<FlowContext> {
  const [lead, patient, tenant, defs] = await Promise.all([
    conv.leadId
      ? db.lead.findFirst({
          where: { id: conv.leadId, deletedAt: null },
          select: { name: true, stageId: true, source: true, fields: true, tags: { select: { tagId: true } } },
        })
      : null,
    conv.patientId ? db.patient.findFirst({ where: { id: conv.patientId }, select: { name: true } }) : null,
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    db.leadField.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);
  const fields: Record<string, string> = {};
  const brutos = (lead?.fields && typeof lead.fields === 'object' ? lead.fields : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(brutos)) fields[k] = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
  const fieldsByName = Object.fromEntries(defs.map((d) => [d.name, fields[d.id] ?? '']));
  let phone: string | null = null;
  try {
    phone = decryptPhone(conv.phoneEncrypted, tenantId);
  } catch {
    phone = null;
  }
  return {
    now,
    tagIds: lead?.tags.map((t) => t.tagId) ?? [],
    stageId: lead?.stageId ?? null,
    source: lead?.source ?? null,
    fields,
    open: isOpenAt(doc.hours ?? DEFAULT_HOURS, now),
    vars: { name: patient?.name ?? lead?.name ?? conv.contactName, clinic: tenant?.name, phone, fieldsByName },
    roundRobin,
  };
}

async function apply(db: TenantPrismaClient, tenantId: string, conv: Conv, flowId: string, r: FlowResult, now: Date, depth: number): Promise<void> {
  const actor = { tenantId, userId: null };
  // Uma de cada vez, esperando sair: assim chegam na ordem.
  for (const m of r.messages) {
    const w = await writeChatMessage(db, actor, conv.id, m.text, new Date(), { origin: 'BOT', buttons: m.buttons });
    if (w.ok) await dispatchChat(tenantId, w.messageId).catch(() => undefined);
  }
  let outro: string | null = null;
  for (const e of r.effects) {
    if (e.type === 'startBot') outro = e.botId;
    else await act(db, tenantId, conv, e).catch((err) => console.error('[robô] ação falhou', err instanceof Error ? err.message : err));
  }
  await db.conversation.updateMany({
    where: { id: conv.id },
    data: r.state
      ? { botFlowId: flowId, botStepId: r.state.stepId, botStartedAt: now, botMisses: r.state.misses, botWakeAt: r.state.wakeAt }
      : CLEAR,
  });
  // "Iniciar outro robô": começa do primeiro passo (com um teto, para dois robôs não se chamarem para sempre).
  if (outro && depth < 3) {
    const flow = await db.chatbotFlow.findFirst({ where: { id: outro, active: true } });
    const doc = flow ? readFlow(flow.steps) : null;
    if (flow && doc) await step(db, tenantId, conv, flow, doc, null, { kind: 'start' }, now, depth + 1);
  }
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

async function act(db: TenantPrismaClient, tenantId: string, conv: Conv, a: FlowEffect): Promise<void> {
  if (a.type === 'handoff' || a.type === 'startBot') return;
  if (a.type === 'createLead') {
    await openLead(db, tenantId, conv, a.stageId);
    return;
  }
  const leadId = await openLead(db, tenantId, conv);
  if (!leadId) return;
  const nota = (text: string) => db.leadActivity.create({ data: { tenantId, leadId, type: 'NOTE', actorId: null, data: { text: text.slice(0, 2000) } } });

  switch (a.type) {
    case 'tag': {
      const tag = await db.leadTag.findFirst({ where: { id: a.tagId }, select: { id: true } });
      if (!tag) return;
      const { count } = await db.leadTagOnLead.createMany({ data: [{ tenantId, leadId, tagId: tag.id }], skipDuplicates: true });
      if (count) await db.leadActivity.create({ data: { tenantId, leadId, type: 'TAG_ADDED', actorId: null, data: { tagId: tag.id } } });
      return;
    }
    case 'untag': {
      const { count } = await db.leadTagOnLead.deleteMany({ where: { tenantId, leadId, tagId: a.tagId } });
      if (count) await db.leadActivity.create({ data: { tenantId, leadId, type: 'TAG_REMOVED', actorId: null, data: { tagId: a.tagId } } });
      return;
    }
    case 'stage':
      await moveLead(db, { tenantId, userId: null }, leadId, { stageId: a.stageId, origin: { event: 'bot' } });
      return;
    case 'assign': {
      const user = await db.user.findFirst({ where: { id: a.userId, active: true }, select: { id: true } });
      if (user) await db.lead.updateMany({ where: { id: leadId }, data: { assignedToId: user.id } });
      return;
    }
    case 'setField': {
      const valor = (a.value ?? '').trim().slice(0, 500);
      if (!valor) return;
      if (a.field === 'name' && valor.length >= 2) {
        const nome = valor.slice(0, 120);
        await db.lead.updateMany({ where: { id: leadId }, data: { name: nome } });
        await db.conversation.updateMany({ where: { id: conv.id }, data: { contactName: nome } });
      }
      if (a.field === 'email') await db.lead.updateMany({ where: { id: leadId }, data: { email: valor.slice(0, 200) } });
      // Campo personalizado (como o Salesbot): valor que não serve para o campo fica só na anotação.
      if (a.field.startsWith('field:')) await setLeadFields(db, { tenantId, userId: null }, leadId, { [a.field.slice(6)]: valor });
      if (a.question) await nota(`Robô: ${a.question.slice(0, 200)}\nResposta: ${valor}`);
      else if (a.field === 'note') await nota(`Robô: ${valor}`);
      return;
    }
    case 'note':
      if (a.text.trim()) await nota(`Robô: ${a.text.trim()}`);
      return;
    case 'notify':
      // A "mensagem interna" do Kommo: fica no histórico do lead, para a equipe.
      if (a.text.trim()) await nota(`Aviso do robô para a equipe: ${a.text.trim()}`);
      return;
    case 'task': {
      const lead = await db.lead.findFirst({ where: { id: leadId }, select: { assignedToId: true } });
      // O responsável do lead; sem ele, o dono ou um administrador; sem eles, quem estiver na equipe.
      const quem =
        lead?.assignedToId ??
        (await db.user.findFirst({ where: { active: true, role: { in: ['OWNER', 'ADMIN'] } }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id ??
        (await db.user.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id;
      if (!quem || !a.text.trim()) return;
      await db.leadTask.create({
        data: {
          tenantId,
          leadId,
          text: a.text.trim().slice(0, 300),
          dueAt: new Date(Date.now() + Math.max(0, a.dueMinutes) * 60_000),
          assignedToId: quem,
          origin: 'AUTOMATION',
        },
      });
      return;
    }
  }
}

/**
 * Robôs que esperavam a hora: "sem resposta" e pausas (relógio do CRM).
 * Cada conversa é reservada antes (apaga a hora): duas chamadas juntas não repetem.
 */
export async function wakeBots(now: Date = new Date(), limit = 100): Promise<number> {
  const vencidos = await prisma.conversation.findMany({
    where: { botWakeAt: { lte: now }, botFlowId: { not: null } },
    select: { id: true, tenantId: true, botWakeAt: true },
    orderBy: { botWakeAt: 'asc' },
    take: limit,
  });
  let n = 0;
  for (const v of vencidos) {
    const { count } = await prisma.conversation.updateMany({ where: { id: v.id, botWakeAt: v.botWakeAt }, data: { botWakeAt: null } });
    if (!count) continue;
    const db = getTenantClient(v.tenantId);
    const conv = await db.conversation.findFirst({ where: { id: v.id }, select: CONV_SELECT });
    if (!conv?.botFlowId || !conv.botStepId) continue;
    const flow = await db.chatbotFlow.findFirst({ where: { id: conv.botFlowId, active: true } });
    const doc = flow ? readFlow(flow.steps) : null;
    if (!flow || !doc) {
      await db.conversation.updateMany({ where: { id: conv.id }, data: CLEAR });
      continue;
    }
    try {
      if (conv.botStepId === START_PENDING) {
        // Gatilho de etapa ou tag: confere o horário e o público do robô antes de começar.
        const tags = conv.leadId ? (await db.leadTagOnLead.findMany({ where: { leadId: conv.leadId }, select: { tagId: true } })).map((t) => t.tagId) : [];
        if (!shouldStart(doc.hours, now) || !fitsAudience(doc.audience, tags)) {
          await db.conversation.updateMany({ where: { id: conv.id }, data: CLEAR });
          continue;
        }
        await step(db, v.tenantId, conv, flow, doc, null, { kind: 'start' }, now);
      } else {
        await step(db, v.tenantId, conv, flow, doc, { stepId: conv.botStepId, misses: conv.botMisses, wakeAt: null }, { kind: 'timer' }, now);
      }
      n++;
    } catch (e) {
      console.error('[robô] acordar falhou', e instanceof Error ? e.message : e);
    }
  }
  return n;
}

/**
 * Gatilho "sem resposta" (Kommo: X horas depois da última mensagem): a última
 * mensagem foi da equipe (não de robô, para não virar laço) e a pessoa não
 * responde há as horas do robô. Só olha as conversas que passaram da hora nas
 * últimas 6 horas: ligar o robô não dispara para todo o histórico.
 */
export async function startNoReplyBots(now: Date = new Date(), limit = 50): Promise<number> {
  const flows = await prisma.chatbotFlow.findMany({ where: { active: true, trigger: 'NO_REPLY' }, select: { id: true, tenantId: true, steps: true } });
  let n = 0;
  for (const f of flows) {
    const doc = readFlow(f.steps);
    const horas = doc?.trigger?.hours;
    if (!doc || !horas || !shouldStart(doc.hours, now)) continue;
    const limite = new Date(now.getTime() - horas * 3_600_000);
    const db = getTenantClient(f.tenantId);
    const candidatas = await db.conversation.findMany({
      where: { status: 'ACTIVE', botFlowId: null, lastMessageAt: { lte: limite, gt: new Date(limite.getTime() - 6 * 3_600_000) } },
      select: { ...CONV_SELECT, messages: { orderBy: [{ at: 'desc' }, { createdAt: 'desc' }], take: 1, select: { direction: true, origin: true } } },
      take: limit,
    });
    for (const c of candidatas) {
      const ultima = c.messages[0];
      if (!ultima || ultima.direction !== 'OUTBOUND' || ultima.origin === 'BOT' || ultima.origin === 'BROADCAST') continue;
      const tags = c.leadId ? (await db.leadTagOnLead.findMany({ where: { leadId: c.leadId }, select: { tagId: true } })).map((t) => t.tagId) : [];
      if (!fitsAudience(doc.audience, tags)) continue;
      // Reserva a conversa: duas voltas do relógio juntas não começam duas vezes.
      const { count } = await db.conversation.updateMany({ where: { id: c.id, botFlowId: null }, data: { botFlowId: f.id, botStepId: START_PENDING, botStartedAt: now } });
      if (!count) continue;
      await step(db, f.tenantId, { ...c, botFlowId: f.id, botStepId: START_PENDING }, { id: f.id, state: {} }, doc, null, { kind: 'start' }, now).catch((e) =>
        console.error('[robô] sem resposta falhou', e instanceof Error ? e.message : e),
      );
      n++;
    }
  }
  return n;
}

/** Robôs esperando resposta há mais de 24 horas, sem hora para acordar, deixam de valer (relógio do CRM). */
export async function expireBots(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.conversation.updateMany({
    where: { botFlowId: { not: null }, botWakeAt: null, botStartedAt: { lt: new Date(now.getTime() - BOT_IDLE_MS) } },
    data: CLEAR,
  });
  return count;
}
