import { getTenantClient, prisma, Prisma } from '@clinicaiq/db';
import { activeCloudAccount, graphVersion } from '@/lib/cloud-account';
import { readCrmPrefs } from './crm-prefs';
import {
  ACTIVITY_EVENT,
  buildConversionPayload,
  explainMetaError,
  readCtwaClid,
  type ConversionKind,
} from './meta-conversions-rules';

/**
 * Avisa a Meta que um lead que veio de anúncio de WhatsApp agendou ou fechou
 * (Conversions API for Business Messaging). Regras em
 * `crm/meta-conversions-rules.ts`.
 *
 * Promessas:
 * - nunca lança: falha vira log sem dado pessoal, e o lead segue movido;
 * - só manda quem tem o clique do anúncio (`ctwa_clid`) na conversa;
 * - uma vez por lead e por evento: o envio que deu certo fica no histórico
 *   (CLINIC_EVENT "meta.agendou" / "meta.fechou") e é isso que impede repetir;
 * - vai só o id da conta e o código do clique, nada de nome ou telefone.
 */
export async function reportConversion(tenantId: string, leadId: string, kind: ConversionKind): Promise<void> {
  try {
    await send(tenantId, leadId, kind);
  } catch (error) {
    console.error('[crm] aviso à Meta falhou', {
      tenantId,
      leadId,
      kind,
      message: error instanceof Error ? error.message : 'erro desconhecido',
    });
  }
}

/** O dataset da conta de mensagens (a Meta cria na 1ª vez e depois devolve o mesmo). */
const datasets = new Map<string, string>();

async function datasetOf(wabaId: string, token: string): Promise<string> {
  const cached = datasets.get(wabaId);
  if (cached) return cached;
  const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${wabaId}/dataset`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { code?: number; message?: string } };
  if (!res.ok || !body.id) throw new Error(explainMetaError(body.error?.code, body.error?.message));
  datasets.set(wabaId, body.id);
  return body.id;
}

async function send(tenantId: string, leadId: string, kind: ConversionKind) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  if (!readCrmPrefs(tenant?.settings).metaEvents) return;

  const db = getTenantClient(tenantId);
  const jaFoi = await db.leadActivity.count({
    where: { leadId, type: 'CLINIC_EVENT', data: { path: ['event'], equals: ACTIVITY_EVENT[kind] } },
  });
  if (jaFoi) return;

  // O clique do anúncio mais recente nas conversas do lead.
  const comAnuncio = await db.chatMessage.findMany({
    where: { conversation: { leadId }, direction: 'INBOUND', ad: { not: Prisma.AnyNull } },
    orderBy: { at: 'desc' },
    take: 10,
    select: { ad: true },
  });
  const ctwaClid = comAnuncio.map((m) => readCtwaClid(m.ad)).find(Boolean);
  if (!ctwaClid) return;

  const conta = await activeCloudAccount(tenantId);
  if (!conta) return;

  const lead = await db.lead.findFirst({ where: { id: leadId }, select: { estimatedValueCents: true } });
  if (!lead) return;

  const dataset = await datasetOf(conta.wabaId, conta.token);
  const payload = buildConversionPayload({
    kind,
    wabaId: conta.wabaId,
    ctwaClid,
    valueCents: lead.estimatedValueCents,
    leadId,
  });
  const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${dataset}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conta.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { code?: number; message?: string } };
  if (!res.ok || !body.events_received) throw new Error(explainMetaError(body.error?.code, body.error?.message));

  await db.leadActivity.create({
    data: {
      tenantId,
      leadId,
      type: 'CLINIC_EVENT',
      actorId: null,
      data: {
        event: ACTIVITY_EVENT[kind],
        ...(kind === 'fechou' && lead.estimatedValueCents ? { valueCents: lead.estimatedValueCents } : {}),
      },
    },
  });
}
