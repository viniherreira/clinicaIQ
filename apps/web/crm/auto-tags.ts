import { prisma, type LeadSource, type TenantPrismaClient } from '@clinicaiq/db';
import { readCrmPrefs } from './crm-prefs';
import { CHANNEL_TAG, CHANNEL_TAG_NAMES, matchProcedures } from './auto-tags-rules';
import type { CrmColor } from './defaults';

/**
 * Tags automáticas no lead (Configurações › Geral › "Tags automáticas"):
 *
 * - **Canal de entrada**: todo lead novo ganha a tag de onde veio (whatsapp,
 *   instagram, facebook, site, indicação). Quando a origem fica mais precisa
 *   (chegou pelo WhatsApp, mas a Meta disse que era de anúncio do Instagram),
 *   a tag genérica sai e entra a certa.
 * - **Procedimento**: o que a pessoa escreve na conversa (e o texto do anúncio)
 *   vira tag: implante, clareamento, aparelho… O primeiro procedimento achado
 *   que a clínica tem cadastrado vira o interesse do lead, se ainda não tiver.
 *
 * Regras puras em `auto-tags-rules.ts`.
 */

/** As preferências da clínica dizem se as tags automáticas estão ligadas. */
export async function autoTagsOn(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return readCrmPrefs(t?.settings).autoTags;
}

/** A tag com esse nome (sem diferenciar maiúscula), ou cria. */
export async function ensureTag(db: TenantPrismaClient, tenantId: string, name: string, color: CrmColor): Promise<string> {
  const achar = () => db.leadTag.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
  const tem = await achar();
  if (tem) return tem.id;
  try {
    return (await db.leadTag.create({ data: { tenantId, name, color }, select: { id: true } })).id;
  } catch {
    // Duas mensagens ao mesmo tempo: a outra criou.
    const outra = await achar();
    if (!outra) throw new Error(`tag ${name} não criada`);
    return outra.id;
  }
}

/** Põe a tag no lead e registra no histórico (só se ela ainda não estava). */
async function tagLead(db: TenantPrismaClient, tenantId: string, leadId: string, tagId: string): Promise<boolean> {
  const { count } = await db.leadTagOnLead.createMany({ data: [{ tenantId, leadId, tagId }], skipDuplicates: true });
  if (count) await db.leadActivity.create({ data: { tenantId, leadId, type: 'TAG_ADDED', actorId: null, data: { tagId } } });
  return count > 0;
}

/**
 * A tag do canal de entrada. As outras tags de canal que o lead tiver saem
 * (o lead tem um canal só): "whatsapp" dá lugar a "instagram" quando o
 * anúncio aparece.
 */
export async function applyChannelTag(db: TenantPrismaClient, tenantId: string, leadId: string, source: LeadSource): Promise<void> {
  const canal = CHANNEL_TAG[source];
  if (!canal) return;
  const tagId = await ensureTag(db, tenantId, canal.name, canal.color);
  const outras = await db.leadTag.findMany({
    where: { id: { not: tagId }, OR: CHANNEL_TAG_NAMES.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) },
    select: { id: true },
  });
  if (outras.length) await db.leadTagOnLead.deleteMany({ where: { leadId, tagId: { in: outras.map((t) => t.id) } } });
  await tagLead(db, tenantId, leadId, tagId);
}

/** A tag de canal do lead recém-criado, se a clínica deixou ligado. Nunca derruba a criação. */
export async function channelTagForNewLead(db: TenantPrismaClient, tenantId: string, leadId: string, source: LeadSource): Promise<void> {
  try {
    if (CHANNEL_TAG[source] && (await autoTagsOn(tenantId))) await applyChannelTag(db, tenantId, leadId, source);
  } catch (e) {
    console.error('[crm] tag de canal falhou', e instanceof Error ? e.message : e);
  }
}

/**
 * Os procedimentos citados no texto viram tags do lead; o primeiro que a
 * clínica tem cadastrado vira o interesse, se o lead ainda não tem um.
 * Devolve as tags novas (para teste e para o histórico).
 */
export async function applyProcedureTags(db: TenantPrismaClient, tenantId: string, leadId: string, text: string): Promise<string[]> {
  if (!text.trim()) return [];
  const procedures = await db.procedure.findMany({ where: { active: true, deletedAt: null }, select: { id: true, name: true } });
  const achados = matchProcedures(text, procedures);
  if (!achados.length) return [];

  const novas: string[] = [];
  for (const a of achados) {
    const tagId = await ensureTag(db, tenantId, a.tag, 'violet');
    if (await tagLead(db, tenantId, leadId, tagId)) novas.push(a.tag);
  }

  const interesse = achados.find((a) => a.procedureId)?.procedureId;
  if (interesse) {
    await db.lead.updateMany({ where: { id: leadId, interestProcedureId: null }, data: { interestProcedureId: interesse } });
  }
  if (novas.length) {
    const lista = achados.filter((a) => novas.includes(a.tag)).map((a) => `“${a.word}”`).join(', ');
    await db.leadActivity.create({
      data: { tenantId, leadId, type: 'NOTE', actorId: null, data: { text: `Tags automáticas: a pessoa falou em ${lista}.` } },
    });
  }
  return novas;
}
