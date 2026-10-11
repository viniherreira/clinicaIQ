import { getTenantClient, prisma, type LeadSource, type Prisma, type TenantPrismaClient } from '@clinicaiq/db';
import { renderTemplateBody } from '@clinicaiq/whatsapp';
import { activeCloudAccount } from './cloud';
import { ensureConversationForLead, writeChatMessage } from './conversations';
import { OPEN_LEAD } from './leads';
import { decryptPhone, isValidPhone } from './phone';

/**
 * Transmissões: uma mensagem para um grupo de leads, como no Kommo.
 *
 * Cada pessoa vira uma mensagem na fila da própria conversa, com hora marcada.
 * No QR, as horas são espaçadas como uma recepcionista mandando (o número não
 * é banido); na API oficial, só dá para mandar modelo aprovado.
 */

export interface Audience {
  stageIds: string[];
  tagIds: string[];
  sources: LeadSource[];
  assignedToIds: string[];
}

export const EMPTY_AUDIENCE: Audience = { stageIds: [], tagIds: [], sources: [], assignedToIds: [] };

const SOURCES: readonly LeadSource[] = ['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO'];

/** Lê o público vindo da tela sem confiar em nada. */
export function parseAudience(raw: unknown): Audience {
  const a = (raw ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : []);
  return {
    stageIds: ids(a.stageIds),
    tagIds: ids(a.tagIds),
    sources: ids(a.sources).filter((s): s is LeadSource => (SOURCES as readonly string[]).includes(s)),
    assignedToIds: ids(a.assignedToIds),
  };
}

/** Leads abertos que batem com o público (lista vazia = sem filtro). */
export function audienceWhere(a: Audience): Prisma.LeadWhereInput {
  return {
    ...OPEN_LEAD,
    ...(a.stageIds.length ? { stageId: { in: a.stageIds } } : {}),
    ...(a.tagIds.length ? { tags: { some: { tagId: { in: a.tagIds } } } } : {}),
    ...(a.sources.length ? { source: { in: a.sources } } : {}),
    ...(a.assignedToIds.length ? { assignedToId: { in: a.assignedToIds } } : {}),
  };
}

/** Quanto tempo a transmissão leva no QR, para a tela avisar. */
export function gatewayDurationMinutes(n: number): number {
  return Math.ceil((n * 20 + Math.floor(n / 20) * 120) / 60);
}

/**
 * As horas de saída. No QR: 12 a 28 s entre mensagens e 2 min de pausa a cada
 * 20, como as campanhas (`apps/whatsapp-gateway/src/campaigns.ts`). Na API
 * oficial: meio segundo entre elas.
 */
export function sendTimes(n: number, start: Date, channel: 'cloud' | 'gateway', random: () => number = Math.random): Date[] {
  const out: Date[] = [];
  let t = start.getTime();
  for (let i = 0; i < n; i++) {
    out.push(new Date(t));
    if (channel === 'cloud') t += 500;
    else {
      t += 12_000 + Math.floor(random() * 16_000);
      if ((i + 1) % 20 === 0) t += 120_000;
    }
  }
  return out;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';
export const personalize = (text: string, name: string) => text.replace(/\{nome\}/gi, firstName(name));

export interface AudiencePreview {
  total: number;
  optedOut: number;
  reachable: number;
}

export async function previewAudience(db: TenantPrismaClient, a: Audience): Promise<AudiencePreview> {
  const where = audienceWhere(a);
  const [total, optedOut] = await Promise.all([
    db.lead.count({ where }),
    db.lead.count({ where: { ...where, OR: [{ whatsappOptOut: true }, { patient: { whatsappOptOut: true } }] } }),
  ]);
  return { total, optedOut, reachable: total - optedOut };
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export interface NewBroadcast {
  name: string;
  audience: Audience;
  text?: string | null;
  templateId?: string | null;
  /** Por variável: texto fixo ou "{nome}". */
  templateParams?: string[];
  scheduledAt?: Date | null;
}

export async function createBroadcast(
  db: TenantPrismaClient,
  actor: { tenantId: string; userId: string },
  input: NewBroadcast,
  now: Date = new Date(),
): Promise<Result<{ broadcastId: string; startNow: boolean }>> {
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, message: 'Dê um nome à transmissão.' };
  const cloud = await activeCloudAccount(actor.tenantId);

  let text: string | null = null;
  let templateId: string | null = null;
  let params: string[] = [];
  if (cloud) {
    const t = input.templateId
      ? await db.messageTemplate.findFirst({ where: { id: input.templateId, status: 'APPROVED' } })
      : null;
    if (!t) return { ok: false, message: 'Na API oficial, a transmissão precisa de um modelo aprovado.' };
    if (t.category === 'AUTHENTICATION') return { ok: false, message: 'Modelo de autenticação não serve para transmissão.' };
    params = (input.templateParams ?? []).slice(0, t.variables).map((p) => p.trim());
    if (params.length < t.variables || params.some((p) => !p)) return { ok: false, message: 'Preencha todas as variáveis do modelo.' };
    templateId = t.id;
  } else {
    text = (input.text ?? '').trim();
    if (!text) return { ok: false, message: 'Escreva a mensagem.' };
    if (text.length > 1000) return { ok: false, message: 'A mensagem passa de 1000 caracteres.' };
  }

  const scheduledAt = input.scheduledAt && input.scheduledAt.getTime() > now.getTime() + 60_000 ? input.scheduledAt : null;
  const preview = await previewAudience(db, input.audience);
  if (preview.reachable === 0) return { ok: false, message: 'Ninguém neste público pode receber a transmissão.' };

  const b = await db.broadcast.create({
    data: {
      tenantId: actor.tenantId,
      name,
      status: scheduledAt ? 'SCHEDULED' : 'SENDING',
      text,
      templateId,
      templateParams: params,
      audience: input.audience as unknown as Prisma.InputJsonValue,
      scheduledAt,
      createdById: actor.userId,
    },
    select: { id: true },
  });
  return { ok: true, broadcastId: b.id, startNow: !scheduledAt };
}

/**
 * Põe na fila uma mensagem por pessoa do público. Pode ser chamada de novo sem
 * duplicar (a pessoa já na lista é pulada) — o relógio retoma uma que caiu no
 * meio.
 */
export async function startBroadcast(tenantId: string, broadcastId: string, now: Date = new Date()): Promise<Result<{ queued: number; skipped: number }>> {
  const db = getTenantClient(tenantId);
  // Reserva: só quem passa SCHEDULED → SENDING (ou pega SENDING ainda não iniciada) segue.
  const claim = await db.broadcast.updateMany({
    where: { id: broadcastId, OR: [{ status: 'SCHEDULED' }, { status: 'SENDING', startedAt: null }] },
    data: { status: 'SENDING', startedAt: now },
  });
  if (claim.count === 0) return { ok: false, message: 'Esta transmissão já começou ou foi cancelada.' };

  const b = await db.broadcast.findFirst({ where: { id: broadcastId }, include: { template: true } });
  if (!b) return { ok: false, message: 'Transmissão não encontrada.' };
  const cloud = await activeCloudAccount(tenantId);
  const channel = cloud ? 'cloud' : 'gateway';

  const cancel = async (why: string) => {
    await db.broadcast.updateMany({ where: { id: b.id }, data: { status: 'CANCELLED', cancelledAt: now, finishedAt: now } });
    return { ok: false as const, message: why };
  };
  if (channel === 'cloud' && !(b.template && b.template.status === 'APPROVED')) {
    return cancel('O canal agora é a API oficial e a transmissão não tem modelo aprovado.');
  }
  if (channel === 'gateway' && !b.text) {
    return cancel('O canal agora é o QR code e a transmissão só tem modelo da API oficial.');
  }

  const audience = parseAudience(b.audience);
  const leads = await db.lead.findMany({
    where: { ...audienceWhere(audience), broadcastRecipients: { none: { broadcastId: b.id } } },
    select: { id: true, name: true, phoneEncrypted: true, whatsappOptOut: true, patient: { select: { whatsappOptOut: true } } },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  });

  const reachable: typeof leads = [];
  let skipped = 0;
  for (const l of leads) {
    const reason = l.whatsappOptOut || l.patient?.whatsappOptOut
      ? 'Pediu para não receber'
      : !isValidPhone(decryptPhone(l.phoneEncrypted, tenantId))
        ? 'Telefone inválido'
        : null;
    if (reason) {
      skipped += 1;
      await db.broadcastRecipient.create({ data: { tenantId, broadcastId: b.id, leadId: l.id, status: 'SKIPPED', skipReason: reason } });
    } else reachable.push(l);
  }

  const times = sendTimes(reachable.length, now, channel);
  let queued = 0;
  for (const [i, l] of reachable.entries()) {
    const conv = await ensureConversationForLead(db, tenantId, l.id);
    const params = ((b.templateParams as string[] | null) ?? []).map((p) => personalize(p, l.name));
    const text = channel === 'cloud' ? renderTemplateBody(b.template!.body, params) : personalize(b.text!, l.name);
    const msg = conv.ok
      ? await writeChatMessage(db, { tenantId, userId: null }, conv.conversationId, text, now, {
          origin: 'BROADCAST',
          sendAt: times[i],
          ...(channel === 'cloud' ? { template: { name: b.template!.name, lang: b.template!.language, params } } : {}),
        })
      : conv;
    if (msg.ok && conv.ok) {
      queued += 1;
      await db.broadcastRecipient.create({
        data: { tenantId, broadcastId: b.id, leadId: l.id, conversationId: conv.conversationId, chatMessageId: msg.messageId },
      });
    } else {
      skipped += 1;
      await db.broadcastRecipient.create({
        data: { tenantId, broadcastId: b.id, leadId: l.id, status: 'SKIPPED', skipReason: msg.ok ? 'Sem conversa' : msg.message },
      });
    }
  }

  await db.broadcast.updateMany({ where: { id: b.id }, data: { total: { increment: queued + skipped }, skipped: { increment: skipped } } });
  return { ok: true, queued, skipped };
}

/** Cancela: a agendada não começa; da que está saindo, o que ainda não saiu fica. */
export async function cancelBroadcast(db: TenantPrismaClient, broadcastId: string, now: Date = new Date()): Promise<Result<{ removed: number }>> {
  const b = await db.broadcast.findFirst({ where: { id: broadcastId }, select: { id: true, status: true } });
  if (!b) return { ok: false, message: 'Transmissão não encontrada.' };
  if (b.status !== 'SCHEDULED' && b.status !== 'SENDING') return { ok: false, message: 'Esta transmissão já terminou.' };

  const pendentes = await db.broadcastRecipient.findMany({
    where: { broadcastId, chatMessage: { status: 'PENDING', acceptedAt: null } },
    select: { id: true, chatMessageId: true },
  });
  const ids = pendentes.map((p) => p.chatMessageId).filter((x): x is string => Boolean(x));
  await db.broadcastRecipient.updateMany({ where: { id: { in: pendentes.map((p) => p.id) } }, data: { status: 'CANCELLED', chatMessageId: null } });
  // Só as que ninguém pegou para mandar agora.
  const { count } = await db.chatMessage.deleteMany({
    where: { id: { in: ids }, status: 'PENDING', acceptedAt: null, OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }] },
  });
  await db.broadcast.updateMany({ where: { id: broadcastId }, data: { status: 'CANCELLED', cancelledAt: now, finishedAt: now } });
  return { ok: true, removed: count };
}

// ─── Relógio ─────────────────────────────────────────────────────────────────

/** As agendadas que chegaram na hora. */
export async function startDueBroadcasts(now: Date = new Date()): Promise<number> {
  const due = await prisma.broadcast.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    select: { id: true, tenantId: true },
    take: 5,
  });
  let n = 0;
  for (const b of due) if ((await startBroadcast(b.tenantId, b.id, now)).ok) n += 1;
  return n;
}

/** As que já não têm nada na fila terminam. */
export async function finishBroadcasts(now: Date = new Date()): Promise<number> {
  const sending = await prisma.broadcast.findMany({
    where: { status: 'SENDING', startedAt: { not: null, lt: new Date(now.getTime() - 30_000) } },
    select: { id: true },
    take: 50,
  });
  let n = 0;
  for (const b of sending) {
    const pendentes = await prisma.broadcastRecipient.count({
      where: { broadcastId: b.id, chatMessage: { status: 'PENDING', acceptedAt: null } },
    });
    if (pendentes === 0) {
      await prisma.broadcast.update({ where: { id: b.id }, data: { status: 'DONE', finishedAt: now } });
      n += 1;
    }
  }
  return n;
}

// ─── Números ─────────────────────────────────────────────────────────────────

export interface BroadcastStats {
  total: number;
  skipped: number;
  waiting: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
}

export async function broadcastStats(db: TenantPrismaClient, broadcastId: string): Promise<BroadcastStats> {
  const rows = await db.broadcastRecipient.findMany({
    where: { broadcastId },
    select: {
      status: true,
      conversationId: true,
      chatMessage: { select: { status: true, acceptedAt: true, at: true } },
    },
  });
  const s: BroadcastStats = { total: rows.length, skipped: 0, waiting: 0, sent: 0, delivered: 0, read: 0, failed: 0, replied: 0 };
  const respondidas: { conversationId: string; at: Date }[] = [];
  for (const r of rows) {
    const m = r.chatMessage;
    if (r.status === 'SKIPPED' || r.status === 'CANCELLED' || !m) {
      s.skipped += 1;
      continue;
    }
    if (m.status === 'FAILED') s.failed += 1;
    else if (m.status === 'PENDING' && !m.acceptedAt) s.waiting += 1;
    else {
      s.sent += 1;
      if (m.status === 'DELIVERED' || m.status === 'READ') s.delivered += 1;
      if (m.status === 'READ') s.read += 1;
      if (r.conversationId) respondidas.push({ conversationId: r.conversationId, at: m.at });
    }
  }
  // Respondeu = o contato escreveu depois que a transmissão saiu.
  if (respondidas.length) {
    const ultimas = await db.chatMessage.groupBy({
      by: ['conversationId'],
      where: { conversationId: { in: respondidas.map((r) => r.conversationId) }, origin: 'CONTACT' },
      _max: { at: true },
    });
    const ultima = new Map(ultimas.map((u) => [u.conversationId, u._max.at]));
    s.replied = respondidas.filter((r) => (ultima.get(r.conversationId)?.getTime() ?? 0) > r.at.getTime()).length;
  }
  return s;
}
