import type { LeadSource, TenantPrismaClient } from '@clinicaiq/db';
import { cleanCaptureKeywords, matchCapture } from './capture-rules';
import { createLead, OPEN_LEAD } from './leads';
import { decryptPhone } from './phone';

/**
 * Captação: na primeira mensagem de um número, as palavras que a clínica
 * cadastrou viram lead com tag, funil e origem — antes do robô responder.
 * Chamado por `afterInbound` (`crm/inbound.ts`). Regras puras em `capture-rules.ts`.
 */

type Result = { ok: true } | { ok: false; message: string };

const SOURCES: readonly LeadSource[] = ['WHATSAPP', 'INSTAGRAM', 'SITE', 'INDICACAO', 'OUTRO', 'MANUAL'];
export const MAX_CAPTURE_RULES = 50;

export async function applyCapture(
  db: TenantPrismaClient,
  tenantId: string,
  conversationId: string,
  text: string,
): Promise<{ leadId: string; tagIds: string[] } | null> {
  if (!text.trim()) return null;
  const rules = await db.captureRule.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  const m = matchCapture(text, rules);
  if (!m) return null;

  const conv = await db.conversation.findFirst({
    where: { id: conversationId },
    select: { leadId: true, patientId: true, contactName: true, phoneEncrypted: true },
  });
  if (!conv) return null;

  // Já há negócio aberto com esse número: só põe as tags. Senão, cria.
  let leadId = conv.leadId ? (await db.lead.findFirst({ where: { id: conv.leadId, ...OPEN_LEAD }, select: { id: true } }))?.id ?? null : null;
  if (!leadId) {
    const patient = conv.patientId ? await db.patient.findFirst({ where: { id: conv.patientId }, select: { name: true } }) : null;
    const r = await createLead(db, { tenantId, userId: null }, {
      name: patient?.name ?? conv.contactName ?? 'Contato do WhatsApp',
      phone: decryptPhone(conv.phoneEncrypted, tenantId),
      source: m.source ?? 'WHATSAPP',
      patientId: conv.patientId,
      pipelineId: m.pipelineId,
    });
    if (!r.ok) return null;
    leadId = r.leadId;
  }

  const tags = m.tagIds.length ? await db.leadTag.findMany({ where: { id: { in: m.tagIds } }, select: { id: true } }) : [];
  for (const t of tags) {
    const { count } = await db.leadTagOnLead.createMany({ data: [{ tenantId, leadId, tagId: t.id }], skipDuplicates: true });
    if (count) await db.leadActivity.create({ data: { tenantId, leadId, type: 'TAG_ADDED', actorId: null, data: { tagId: t.id } } });
  }
  const achou = m.hits.map((h) => `“${h.keyword}” (${h.name})`).join(', ');
  await db.leadActivity.create({
    data: { tenantId, leadId, type: 'NOTE', actorId: null, data: { text: `Captação: a primeira mensagem tinha ${achou}.` } },
  });
  return { leadId, tagIds: tags.map((t) => t.id) };
}

// ─── Cadastro (quem chama já passou por guardCrmAction('crm_config')) ────────

export interface CaptureRuleInput {
  id?: string;
  name: string;
  keywords: string[];
  tagIds: string[];
  pipelineId: string | null;
  source: LeadSource | null;
  active: boolean;
}

export async function saveCaptureRule(db: TenantPrismaClient, tenantId: string, input: CaptureRuleInput): Promise<Result> {
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, message: 'Dê um nome à regra (ex.: Implante).' };
  const keywords = cleanCaptureKeywords(input.keywords);
  if (keywords.length === 0) return { ok: false, message: 'Escreva pelo menos uma palavra (ex.: implante).' };
  const tagIds = [...new Set(input.tagIds)];
  const pipelineId = input.pipelineId || null;
  const source = input.source && SOURCES.includes(input.source) ? input.source : null;
  if (tagIds.length === 0 && !pipelineId && !source) return { ok: false, message: 'Escolha uma tag, um funil ou a origem.' };

  const [tags, funil] = await Promise.all([
    tagIds.length ? db.leadTag.count({ where: { id: { in: tagIds } } }) : 0,
    pipelineId ? db.pipeline.count({ where: { id: pipelineId } }) : 0,
  ]);
  if (tags !== tagIds.length) return { ok: false, message: 'Uma das tags não existe mais.' };
  if (pipelineId && !funil) return { ok: false, message: 'Esse funil não existe mais.' };

  const data = { name, keywords, tagIds, pipelineId, source, active: input.active };
  if (input.id) {
    const r = await db.captureRule.updateMany({ where: { id: input.id }, data });
    return r.count ? { ok: true } : { ok: false, message: 'Regra não encontrada.' };
  }
  const total = await db.captureRule.count();
  if (total >= MAX_CAPTURE_RULES) return { ok: false, message: `Limite de ${MAX_CAPTURE_RULES} regras.` };
  await db.captureRule.create({ data: { tenantId, ...data, order: total } });
  return { ok: true };
}

export async function toggleCaptureRule(db: TenantPrismaClient, id: string, active: boolean): Promise<Result> {
  const r = await db.captureRule.updateMany({ where: { id }, data: { active } });
  return r.count ? { ok: true } : { ok: false, message: 'Regra não encontrada.' };
}

export async function deleteCaptureRule(db: TenantPrismaClient, id: string): Promise<Result> {
  const r = await db.captureRule.deleteMany({ where: { id } });
  return r.count ? { ok: true } : { ok: false, message: 'Regra não encontrada.' };
}
