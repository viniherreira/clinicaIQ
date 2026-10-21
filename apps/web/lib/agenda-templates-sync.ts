import { prisma, type TemplateStatus } from '@clinicaiq/db';
import { CloudApiError } from '@clinicaiq/whatsapp';
import { activeCloudAccount, cloudClient, type CloudAccount } from './cloud-account';
import {
  AGENDA_BUTTONS,
  AGENDA_PURPOSES,
  AGENDA_TEMPLATE_PREFIX,
  agendaTemplateName,
  agendaTemplateVersion,
  agendaText,
  readVarKeys,
  toMetaTemplate,
  type AgendaKey,
  type AgendaPurpose,
} from './agenda-templates';

/**
 * Os modelos dos avisos da agenda na conta da clínica: mandar o texto para a
 * Meta aprovar, saber a situação e escolher o aprovado na hora de enviar.
 */

/** Situação da Meta (no modelo ou no webhook) → a nossa. */
export const META_TEMPLATE_STATUS: Record<string, TemplateStatus> = {
  APPROVED: 'APPROVED',
  REINSTATED: 'APPROVED',
  PENDING: 'PENDING',
  IN_APPEAL: 'PENDING',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
  LIMIT_EXCEEDED: 'DISABLED',
  PENDING_DELETION: 'DISABLED',
  DELETED: 'DISABLED',
};

const why = (e: unknown) => (e instanceof CloudApiError ? e.userMessage : 'Não foi possível falar com a Meta.');

export interface ApprovedAgendaTemplate {
  name: string;
  language: string;
  body: string;
  varKeys: AgendaKey[];
}

/** O modelo aprovado mais novo deste aviso, ou null (ainda nenhum aprovado). */
export async function approvedAgendaTemplate(tenantId: string, purpose: AgendaPurpose): Promise<ApprovedAgendaTemplate | null> {
  const t = await prisma.messageTemplate.findFirst({
    where: { tenantId, purpose, status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    select: { name: true, language: true, body: true, varKeys: true },
  });
  const varKeys = t ? readVarKeys(t.varKeys) : null;
  return t && varKeys ? { name: t.name, language: t.language, body: t.body, varKeys } : null;
}

/** A próxima versão livre do nome (`dc_lembrete_<n>`). */
async function nextVersion(tenantId: string, purpose: AgendaPurpose): Promise<number> {
  const nomes = await prisma.messageTemplate.findMany({
    where: { tenantId, name: { startsWith: `${AGENDA_TEMPLATE_PREFIX[purpose]}_` } },
    select: { name: true },
  });
  return Math.max(0, ...nomes.map((n) => agendaTemplateVersion(purpose, n.name) ?? 0)) + 1;
}

export type SubmitResult = { ok: true; submitted: boolean } | { ok: false; message: string };

/**
 * Manda o texto da clínica para a Meta como versão nova do modelo. Não manda de
 * novo o mesmo texto (nem o recusado: seria recusado outra vez). Sem conta
 * oficial ativa, não faz nada.
 */
export async function submitAgendaTemplate(
  tenantId: string,
  purpose: AgendaPurpose,
  text: string,
  account?: CloudAccount | null,
): Promise<SubmitResult> {
  const conta = account === undefined ? await activeCloudAccount(tenantId) : account;
  if (!conta) return { ok: true, submitted: false };

  const draft = toMetaTemplate(text);
  if (!draft.ok) return draft;
  const fonte = text.trim();

  const ultimo = await prisma.messageTemplate.findFirst({
    where: { tenantId, purpose },
    orderBy: { createdAt: 'desc' },
    select: { sourceText: true },
  });
  if (ultimo?.sourceText === fonte) return { ok: true, submitted: false };

  const api = cloudClient(conta);
  let versao = await nextVersion(tenantId, purpose);
  // O nome pode estar ocupado na Meta (modelo apagado há pouco, ou criado fora do DreamClin).
  for (let tentativa = 0; tentativa < 3; tentativa++, versao++) {
    const name = agendaTemplateName(purpose, versao);
    try {
      const r = await api.createTemplate({
        name,
        category: 'UTILITY',
        language: 'pt_BR',
        body: draft.body,
        examples: draft.examples,
        quickReplies: AGENDA_BUTTONS.map((b) => b.text),
      });
      const values = {
        category: 'UTILITY' as const,
        status: META_TEMPLATE_STATUS[r.status] ?? ('PENDING' as const),
        body: draft.body,
        variables: draft.varKeys.length,
        externalId: r.id,
        rejectedReason: null,
        purpose,
        varKeys: draft.varKeys,
        sourceText: fonte,
      };
      await prisma.messageTemplate.upsert({
        where: { tenantId_name_language: { tenantId, name, language: 'pt_BR' } },
        create: { tenantId, name, language: 'pt_BR', ...values },
        update: values,
      });
      return { ok: true, submitted: true };
    } catch (e) {
      if (e instanceof CloudApiError && /already exists|já existe/i.test(e.message)) continue;
      return { ok: false, message: why(e) };
    }
  }
  return { ok: false, message: 'A Meta não aceitou o nome do modelo. Tente salvar de novo daqui a pouco.' };
}

/** Os dois avisos com o texto atual da clínica (ao conectar a conta oficial). */
export async function ensureAgendaTemplates(tenantId: string, account?: CloudAccount | null): Promise<SubmitResult[]> {
  const conta = account === undefined ? await activeCloudAccount(tenantId) : account;
  if (!conta) return [];
  const textos = await prisma.whatsAppSession.findUnique({
    where: { tenantId },
    select: { createdMessage: true, reminderMessage: true },
  });
  const custom: Record<AgendaPurpose, string | null | undefined> = {
    APPOINTMENT_CREATED: textos?.createdMessage,
    APPOINTMENT_REMINDER: textos?.reminderMessage,
  };
  const out: SubmitResult[] = [];
  for (const p of AGENDA_PURPOSES) out.push(await submitAgendaTemplate(tenantId, p, agendaText(p, custom[p]), conta));
  return out;
}

/** Pergunta à Meta a situação dos modelos da agenda que estão em análise. */
export async function refreshAgendaTemplates(tenantId: string): Promise<void> {
  const pendentes = await prisma.messageTemplate.findMany({
    where: { tenantId, purpose: { not: null }, status: 'PENDING' },
    select: { id: true, name: true, externalId: true },
  });
  if (!pendentes.length) return;
  const conta = await activeCloudAccount(tenantId);
  if (!conta) return;
  const lista = await cloudClient(conta)
    .listTemplates()
    .catch(() => null);
  if (!lista) return;
  for (const p of pendentes) {
    const t = lista.find((x) => (p.externalId && x.id === p.externalId) || x.name === p.name);
    const status = t && META_TEMPLATE_STATUS[t.status];
    if (!t || !status) continue;
    await prisma.messageTemplate.update({
      where: { id: p.id },
      data: {
        status,
        rejectedReason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
        lastSyncedAt: new Date(),
      },
    });
  }
}

/** O webhook da Meta disse que um modelo mudou de situação. */
export async function applyTemplateStatus(tenantId: string, templateId: string, event: string, reason: string | null): Promise<void> {
  const status = META_TEMPLATE_STATUS[event];
  if (!status) return; // FLAGGED e outros avisos de qualidade não mudam a situação
  await prisma.messageTemplate.updateMany({
    where: { tenantId, externalId: templateId },
    data: { status, rejectedReason: status === 'REJECTED' ? reason : null, lastSyncedAt: new Date() },
  });
}

export interface AgendaTemplateView {
  /** O mais novo: o que a clínica mandou por último. */
  latest: { status: TemplateStatus; rejectedReason: string | null; sourceText: string | null } | null;
  /** Já existe um aprovado (é o que sai enquanto o novo não for aprovado). */
  hasApproved: boolean;
}

/** A situação dos dois avisos, para o painel de mensagens. */
export async function agendaTemplateViews(tenantId: string): Promise<Record<AgendaPurpose, AgendaTemplateView>> {
  const linhas = await prisma.messageTemplate.findMany({
    where: { tenantId, purpose: { in: AGENDA_PURPOSES } },
    orderBy: { createdAt: 'desc' },
    select: { purpose: true, status: true, rejectedReason: true, sourceText: true },
  });
  const view = (p: AgendaPurpose): AgendaTemplateView => {
    const doAviso = linhas.filter((l) => l.purpose === p);
    const l = doAviso[0];
    return {
      latest: l ? { status: l.status, rejectedReason: l.rejectedReason, sourceText: l.sourceText } : null,
      hasApproved: doAviso.some((x) => x.status === 'APPROVED'),
    };
  };
  return { APPOINTMENT_CREATED: view('APPOINTMENT_CREATED'), APPOINTMENT_REMINDER: view('APPOINTMENT_REMINDER') };
}
