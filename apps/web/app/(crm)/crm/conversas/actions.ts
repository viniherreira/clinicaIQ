'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { guardCrmAction } from '@/crm/guard';
import { guardConversation, guardLead } from '@/crm/scope';
import { dispatchChat } from '@/crm/chat-dispatch';
import {
  INBOX_TABS,
  acceptConversation,
  declineConversation,
  ensureConversationForLead,
  inboxCounts,
  linkConversation,
  listConversations,
  loadThread,
  markRead,
  notALead,
  retryChatMessage,
  writeChatMessage,
  type ChatThread,
  type ConversationSummary,
  type InboxTab,
} from '@/crm/conversations';
import { OPEN_LEAD } from '@/crm/leads';
import { readCrmPrefs } from '@/crm/crm-prefs';
import { prisma } from '@clinicaiq/db';
import { assignConversation } from '@/crm/assignment';
import { loadLeadDetail, type LeadDetail } from '@/crm/lead-detail';
import { checkChatMedia } from '@/crm/media-rules';
import { nudgeTick } from '@/crm/tick-nudge';
import { deleteChatMedia, mediaStoreReady, saveChatMedia } from '@/crm/media-store';
import { activeCloudAccount, windowOpen } from '@/crm/cloud';
import { startBotOnConversation, stopBotOnConversation } from '@/crm/bot';
import { renderTemplateBody } from '@clinicaiq/whatsapp';

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export interface InboxSnapshot {
  list: ConversationSummary[];
  counts: Awaited<ReturnType<typeof inboxCounts>>;
  thread: ChatThread | null;
}

/** O nome que assina a mensagem, se a clínica ligou "Mostrar nome do remetente". */
async function assinatura(g: { tenantId: string; userId: string }): Promise<string | null> {
  const [t, eu] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: g.tenantId }, select: { settings: true } }),
    prisma.user.findUnique({ where: { id: g.userId }, select: { name: true } }),
  ]);
  if (!readCrmPrefs(t?.settings).senderName) return null;
  return eu?.name.trim().split(/\s+/)[0] || null;
}

const asTab = (t: string): InboxTab => ((INBOX_TABS as readonly string[]).includes(t) ? (t as InboxTab) : 'all');

/**
 * O que a tela de Conversas mostra agora. Chamada a cada poucos segundos
 * enquanto a tela está aberta; quem está com uma conversa aberta a lê.
 */
export async function refreshInboxAction(input: {
  tab: string;
  q: string;
  selectedId: string | null;
  tagId?: string | null;
}): Promise<Result<{ snapshot: InboxSnapshot }>> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  // A tela de Conversas aberta também dá o compasso do relógio do CRM.
  nudgeTick();
  const [list, counts, thread] = await Promise.all([
    listConversations(g.db, g, asTab(input.tab), input.q, 60, input.tagId || null),
    inboxCounts(g.db, g),
    input.selectedId ? loadThread(g.db, g.tenantId, input.selectedId, g, g.agenda) : Promise.resolve(null),
  ]);
  if (thread && thread.conversation.unread > 0) {
    await markRead(g.db, thread.conversation.id);
    thread.conversation.unread = 0;
    const item = list.find((c) => c.id === thread.conversation.id);
    if (item) item.unread = 0;
  }
  return { ok: true, snapshot: { list, counts, thread } };
}

/** Os dados do lead da conversa aberta, para o painel à direita (como no Kommo). */
export async function leadDetailAction(leadId: string): Promise<Result<{ lead: LeadDetail | null }>> {
  const g = await guardLead('crm', leadId, { write: false });
  if (!g.ok) return g;
  return { ok: true, lead: await loadLeadDetail(g, leadId) };
}

/** Só a conversa (a aba Conversa da ficha do lead). */
export async function loadThreadAction(conversationId: string): Promise<Result<{ thread: ChatThread | null }>> {
  const g = await guardConversation('crm', conversationId, { write: false });
  if (!g.ok) return g;
  const thread = await loadThread(g.db, g.tenantId, conversationId, undefined, g.agenda);
  if (thread && thread.conversation.unread > 0) {
    await markRead(g.db, conversationId);
    thread.conversation.unread = 0;
  }
  return { ok: true, thread };
}

export async function sendChatAction(conversationId: string, text: string): Promise<Result> {
  const g = await guardConversation('crm', conversationId);
  if (!g.ok) return g;
  const cloud = await activeCloudAccount(g.tenantId);
  const r = await writeChatMessage(g.db, g, conversationId, text, new Date(), { checkWindow: Boolean(cloud), signAs: await assinatura(g) });
  if (!r.ok) return r;
  // Responde já; a entrega ao WhatsApp segue depois.
  after(() => dispatchChat(g.tenantId, r.messageId));
  return { ok: true };
}

/**
 * Manda uma foto, documento, áudio ou vídeo, com legenda opcional. Por enquanto
 * só pela API oficial (e simulado no desenvolvimento): o gateway de QR não manda arquivo.
 */
export async function sendMediaAction(conversationId: string, form: FormData): Promise<Result> {
  const g = await guardConversation('crm', conversationId);
  if (!g.ok) return g;
  const file = form.get('arquivo');
  if (!(file instanceof File)) return { ok: false, message: 'Escolha um arquivo.' };
  const check = checkChatMedia(file);
  if (!check.ok) return check;

  const cloud = await activeCloudAccount(g.tenantId);
  if (!cloud && (process.env.WHATSAPP_GATEWAY_URL || process.env.NODE_ENV === 'production')) {
    return { ok: false, message: 'Mandar arquivos pelo CRM precisa da API oficial do WhatsApp.' };
  }
  if (!mediaStoreReady()) return { ok: false, message: 'O envio de arquivos ainda não está configurado.' };

  let ref: string;
  try {
    ref = await saveChatMedia(g.tenantId, conversationId, file);
  } catch {
    return { ok: false, message: 'Não foi possível guardar o arquivo. Tente de novo.' };
  }
  const caption = String(form.get('legenda') ?? '');
  const r = await writeChatMessage(g.db, g, conversationId, caption, new Date(), {
    checkWindow: Boolean(cloud),
    media: { kind: check.kind, ref, mimeType: check.mimeType },
    signAs: await assinatura(g),
  });
  if (!r.ok) {
    await deleteChatMedia(ref).catch(() => {});
    return r;
  }
  after(() => dispatchChat(g.tenantId, r.messageId));
  return { ok: true };
}

export async function retryChatAction(chatMessageId: string): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const r = await retryChatMessage(g.db, chatMessageId);
  if (r.ok) after(() => dispatchChat(g.tenantId, chatMessageId));
  return r;
}

/** Escrever a um lead que ainda não tem conversa: cria a conversa e manda. */
export async function startLeadChatAction(leadId: string, text: string): Promise<Result<{ conversationId: string }>> {
  const g = await guardLead('crm', leadId);
  if (!g.ok) return g;
  const conv = await ensureConversationForLead(g.db, g.tenantId, leadId);
  if (!conv.ok) return conv;
  const cloud = await activeCloudAccount(g.tenantId);
  const r = await writeChatMessage(g.db, g, conv.conversationId, text, new Date(), { checkWindow: Boolean(cloud), signAs: await assinatura(g) });
  if (!r.ok) return r;
  after(() => dispatchChat(g.tenantId, r.messageId));
  return { ok: true, conversationId: conv.conversationId };
}

export async function acceptConversationAction(
  conversationId: string,
  opts: { name?: string; stageId?: string | null; pipelineId?: string | null; tagIds?: string[] } = {},
): Promise<Result<{ leadId: string }>> {
  const g = await guardConversation('crm', conversationId);
  if (!g.ok) return g;
  if (g.rights.leads.create === 'none') return { ok: false, message: 'Seu cargo no CRM não permite criar negócios.' };
  const r = await acceptConversation(g.db, g, conversationId, {
    name: typeof opts.name === 'string' ? opts.name.slice(0, 120) : undefined,
    stageId: typeof opts.stageId === 'string' ? opts.stageId : null,
    pipelineId: typeof opts.pipelineId === 'string' ? opts.pipelineId : null,
    tagIds: Array.isArray(opts.tagIds) ? opts.tagIds.filter((t) => typeof t === 'string').slice(0, 20) : [],
  });
  if (r.ok) revalidatePath('/crm');
  return r;
}

/**
 * Quem atende a conversa: assumir (para si), transferir para alguém ou deixar
 * sem responsável. Com negócio aberto, o negócio vai junto (`crm/assignment.ts`).
 */
export async function assignConversationAction(conversationId: string, userId: string | null): Promise<Result> {
  const g = await guardConversation('crm', conversationId);
  if (!g.ok) return g;
  if (userId !== null && typeof userId !== 'string') return { ok: false, message: 'Escolha a pessoa.' };
  const antes = await g.db.conversation.findFirst({ where: { id: conversationId }, select: { assignedToId: true } });
  const via = userId === g.userId && !antes?.assignedToId ? 'take' : 'transfer';
  const r = await assignConversation(g.db, g, conversationId, userId, via);
  if (r.ok) revalidatePath('/crm');
  return r;
}

export async function declineConversationAction(conversationId: string): Promise<Result> {
  const g = await guardConversation('crm', conversationId);
  if (!g.ok) return g;
  const r = await declineConversation(g.db, conversationId);
  if (r.ok) revalidatePath('/crm');
  return r;
}

export async function notALeadAction(conversationId: string): Promise<Result> {
  const g = await guardConversation('crm', conversationId);
  if (!g.ok) return g;
  const r = await notALead(g.db, g, conversationId);
  if (r.ok) revalidatePath('/crm');
  return r;
}

export async function linkConversationAction(
  conversationId: string,
  target: { leadId: string } | { patientId: string },
): Promise<Result> {
  const g = await guardConversation('crm', conversationId);
  if (!g.ok) return g;
  if ('patientId' in target && !g.agenda) return { ok: false, message: 'Só com o CRM não há ficha de paciente para ligar.' };
  const r = await linkConversation(g.db, conversationId, target);
  if (r.ok) revalidatePath('/crm');
  return r;
}

export interface LinkTarget {
  kind: 'lead' | 'patient';
  id: string;
  label: string;
  detail: string;
}

/** Para "Ligar a…": leads abertos e pacientes pelo nome. */
export async function searchLinkTargetsAction(q: string): Promise<Result<{ targets: LinkTarget[] }>> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return { ok: true, targets: [] };
  const [leads, patients] = await Promise.all([
    g.db.lead.findMany({
      where: { ...OPEN_LEAD, OR: [{ name: { contains: term, mode: 'insensitive' } }, { title: { contains: term, mode: 'insensitive' } }] },
      select: { id: true, name: true, title: true, stage: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    // Só com o CRM não há ficha de paciente para ligar.
    g.agenda
      ? g.db.patient.findMany({
          where: { deletedAt: null, name: { contains: term, mode: 'insensitive' } },
          select: { id: true, name: true, controlNumber: true },
          orderBy: { name: 'asc' },
          take: 6,
        })
      : [],
  ]);
  return {
    ok: true,
    targets: [
      ...leads.map((l) => ({ kind: 'lead' as const, id: l.id, label: l.title ? `${l.title} · ${l.name}` : l.name, detail: `Lead · ${l.stage.name}` })),
      ...patients.map((p) => ({ kind: 'patient' as const, id: p.id, label: p.name, detail: `Paciente nº ${p.controlNumber}` })),
    ],
  };
}

export interface TemplateOption {
  id: string;
  name: string;
  category: string;
  body: string;
  variables: number;
}

/** Modelos aprovados, para a caixa de texto fora da janela de 24 horas. */
export async function approvedTemplatesAction(): Promise<Result<{ templates: TemplateOption[] }>> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  const rows = await g.db.messageTemplate.findMany({
    where: { status: 'APPROVED', purpose: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, category: true, body: true, variables: true },
  });
  return { ok: true, templates: rows };
}

/** Manda um modelo aprovado (API oficial): o único jeito fora da janela de 24 horas. */
export async function sendTemplateAction(
  target: { conversationId: string } | { leadId: string },
  templateId: string,
  params: string[],
): Promise<Result<{ conversationId: string }>> {
  const g = 'conversationId' in target ? await guardConversation('crm', target.conversationId) : await guardLead('crm', target.leadId);
  if (!g.ok) return g;
  const t = await g.db.messageTemplate.findFirst({ where: { id: templateId, status: 'APPROVED' } });
  if (!t) return { ok: false, message: 'Modelo não encontrado ou ainda não aprovado.' };
  const values = params.slice(0, t.variables).map((p) => p.trim());
  if (values.length < t.variables || values.some((v) => !v)) return { ok: false, message: 'Preencha todas as variáveis do modelo.' };

  let conversationId: string;
  if ('leadId' in target) {
    const conv = await ensureConversationForLead(g.db, g.tenantId, target.leadId);
    if (!conv.ok) return conv;
    conversationId = conv.conversationId;
  } else {
    conversationId = target.conversationId;
  }
  const r = await writeChatMessage(g.db, g, conversationId, renderTemplateBody(t.body, values), new Date(), {
    template: { name: t.name, lang: t.language, params: values },
  });
  if (!r.ok) return r;
  after(() => dispatchChat(g.tenantId, r.messageId));
  return { ok: true, conversationId };
}

// ─── Robô na conversa (o "Executar Salesbot" do Kommo) ───────────────────────

export interface BotOption {
  id: string;
  name: string;
}

/** Os robôs ligados, para o botão "Executar robô" da conversa. */
export async function botOptionsAction(): Promise<Result<{ bots: BotOption[] }>> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  const bots = await g.db.chatbotFlow.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  return { ok: true, bots };
}

/**
 * Começa um robô nesta conversa, do primeiro passo, mesmo que outro esteja
 * esperando (a equipe escolheu). Na API oficial, só dentro da janela de 24 h:
 * o robô manda texto livre, e fora dela a Meta recusa.
 */
export async function startBotAction(conversationId: string, flowId: string): Promise<Result<{ name: string }>> {
  const g = await guardConversation('crm', conversationId);
  if (!g.ok) return g;
  const [conv, flow, cloud] = await Promise.all([
    g.db.conversation.findFirst({ where: { id: conversationId }, select: { id: true, status: true, leadId: true, lastInboundAt: true } }),
    g.db.chatbotFlow.findFirst({ where: { id: flowId, active: true }, select: { id: true, name: true } }),
    activeCloudAccount(g.tenantId),
  ]);
  if (!conv) return { ok: false, message: 'Conversa não encontrada.' };
  if (conv.status === 'DECLINED') return { ok: false, message: 'A conversa foi recusada.' };
  if (!flow) return { ok: false, message: 'Este robô foi desligado. Ligue em Automações › Bots.' };
  if (cloud && !windowOpen(conv.lastInboundAt)) {
    return { ok: false, message: 'Passaram 24 horas desde a última mensagem da pessoa: o robô só pode começar depois que ela responder.' };
  }
  const ok = await startBotOnConversation(g.tenantId, conv.id, flow.id);
  if (!ok) return { ok: false, message: 'Não foi possível começar o robô.' };
  if (conv.leadId) {
    await g.db.leadActivity.create({
      data: { tenantId: g.tenantId, leadId: conv.leadId, type: 'NOTE', actorId: g.userId, data: { text: `Robô “${flow.name}” iniciado na conversa.` } },
    });
  }
  return { ok: true, name: flow.name };
}

/** Tira o robô da conversa: a equipe assume. */
export async function stopBotAction(conversationId: string): Promise<Result> {
  const g = await guardConversation('crm', conversationId);
  if (!g.ok) return g;
  await stopBotOnConversation(g.db, conversationId);
  return { ok: true };
}
