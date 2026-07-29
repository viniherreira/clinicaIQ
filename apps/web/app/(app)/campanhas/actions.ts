'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient, decrypt } from '@clinicaiq/db';
import { getGatewayProvider } from '@clinicaiq/whatsapp';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clinicToday } from '@/lib/tz';

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');
  return { tenantId: tenant.id };
}

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

/** Phones are encrypted at rest; a patient we can't decrypt simply can't be messaged. */
function safePhone(ciphertext: string | null, tenantId: string): string | null {
  if (!ciphertext) return null;
  try {
    const digits = decrypt(ciphertext, masterKey(), tenantId).replace(/\D/g, '');
    return digits.length >= 10 ? digits : null;
  } catch {
    return null;
  }
}

// ─── Audience ────────────────────────────────────────────────────────────────

export type AudienceFilter =
  | 'todos'
  | 'aniversariantes'
  | 'inativos'
  | 'sem-retorno'
  | 'procedimento';

export interface AudiencePatient {
  id: string;
  name: string;
  /** Last 4 digits only — enough to recognise, without spreading PII around. */
  phoneHint: string;
  lastVisit: Date | null;
  optOut: boolean;
}

export interface AudienceResult {
  patients: AudiencePatient[];
  /** Patients skipped because they opted out or have no usable phone. */
  skipped: { optOut: number; noPhone: number };
  procedures: { id: string; name: string }[];
}

/**
 * Builds the list a campaign can target. Filters mirror how a clinic actually
 * thinks about its base: everyone, this month's birthdays, people who stopped
 * coming, or who had a given procedure.
 */
export async function getAudience(
  filter: AudienceFilter,
  procedureId?: string,
): Promise<AudienceResult> {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const today = clinicToday();
  const month = Number(today.slice(5, 7));
  const sixMonthsAgo = new Date(Date.now() - 182 * 86400000);

  const procedures = await db.procedure.findMany({
    where: { active: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const patients = await db.patient.findMany({
    where: {
      active: true,
      deletedAt: null,
      ...(filter === 'procedimento' && procedureId
        ? { appointments: { some: { procedureId, status: 'ATTENDED' } } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      phoneEncrypted: true,
      birthDate: true,
      whatsappOptOut: true,
      appointments: {
        where: { status: 'ATTENDED' },
        orderBy: { startTime: 'desc' },
        take: 1,
        select: { startTime: true },
      },
    },
    orderBy: { name: 'asc' },
    take: 3000,
  });

  let optOut = 0;
  let noPhone = 0;
  const result: AudiencePatient[] = [];

  for (const p of patients) {
    const lastVisit = p.appointments[0]?.startTime ?? null;

    if (filter === 'aniversariantes') {
      if (!p.birthDate || p.birthDate.getUTCMonth() + 1 !== month) continue;
    }
    if (filter === 'inativos' || filter === 'sem-retorno') {
      // "Stopped coming": no attended visit at all, or none in the last 6 months.
      if (lastVisit && lastVisit > sixMonthsAgo) continue;
    }

    const phone = safePhone(p.phoneEncrypted, tenantId);
    if (!phone) {
      noPhone += 1;
      continue;
    }
    if (p.whatsappOptOut) {
      optOut += 1;
      continue;
    }

    result.push({
      id: p.id,
      name: p.name,
      phoneHint: `••••${phone.slice(-4)}`,
      lastVisit,
      optOut: false,
    });
  }

  return { patients: result, skipped: { optOut, noPhone }, procedures };
}

// ─── Create + send ───────────────────────────────────────────────────────────

const campaignSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome à campanha.').max(80),
  message: z
    .string()
    .trim()
    .min(10, 'A mensagem está muito curta.')
    .max(900, 'A mensagem está muito longa.'),
  patientIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos um paciente.'),
});

export type CampaignFormState =
  | { success: true; campaignId: string; queued: number }
  | { success: false; error: string };

/** Daily ceiling per clinic. A QR-paired line that blasts hundreds of marketing
 *  messages in a day is the classic ban pattern; this keeps volume plausible. */
const DAILY_LIMIT = 200;

export async function createAndSendCampaign(input: {
  name: string;
  message: string;
  patientIds: string[];
}): Promise<CampaignFormState> {
  const { tenantId } = await requireTenant();

  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { name, message, patientIds } = parsed.data;

  const session = await prisma.whatsAppSession.findUnique({
    where: { tenantId },
    select: { status: true },
  });
  if (session?.status !== 'CONNECTED') {
    return { success: false, error: 'Conecte o WhatsApp da clínica antes de enviar.' };
  }

  // Re-check ownership and opt-out at send time: the browser list could be stale.
  const eligible = await prisma.patient.findMany({
    where: {
      id: { in: patientIds },
      tenantId,
      active: true,
      deletedAt: null,
      whatsappOptOut: false,
    },
    select: { id: true },
  });
  if (eligible.length === 0) {
    return { success: false, error: 'Nenhum destinatário elegível na seleção.' };
  }

  const since = new Date(Date.now() - 86400000);
  const sentToday = await prisma.campaignRecipient.count({
    where: { tenantId, status: { in: ['SENT', 'DELIVERED', 'READ'] }, sentAt: { gte: since } },
  });
  const room = DAILY_LIMIT - sentToday;
  if (room <= 0) {
    return {
      success: false,
      error: `Limite diário de ${DAILY_LIMIT} mensagens atingido. Tente novamente amanhã.`,
    };
  }

  const targets = eligible.slice(0, room);

  const campaign = await prisma.campaign.create({
    data: {
      tenantId,
      name,
      message,
      status: 'SENDING',
      total: targets.length,
      startedAt: new Date(),
      recipients: {
        create: targets.map((p) => ({ tenantId, patientId: p.id })),
      },
    },
    select: { id: true },
  });

  const gateway = getGatewayProvider(tenantId);
  if (!gateway) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    return { success: false, error: 'Serviço de WhatsApp não configurado.' };
  }

  // The gateway paces delivery and writes results back; we don't block the UI.
  const started = await gateway.startCampaign(campaign.id);
  if (!started) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    return { success: false, error: 'Não foi possível iniciar o envio. Tente novamente.' };
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      action: 'CAMPAIGN_STARTED',
      entity: 'Campaign',
      entityId: campaign.id,
      metadata: { recipients: targets.length },
    },
  });

  revalidatePath('/campanhas');
  return { success: true, campaignId: campaign.id, queued: targets.length };
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function listCampaigns() {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      name: true,
      message: true,
      status: true,
      total: true,
      sent: true,
      failed: true,
      createdAt: true,
      finishedAt: true,
    },
  });

  const [connected, optedOut] = await Promise.all([
    prisma.whatsAppSession.findUnique({ where: { tenantId }, select: { status: true } }),
    db.patient.count({ where: { whatsappOptOut: true } }),
  ]);

  const since = new Date(Date.now() - 86400000);
  const sentToday = await db.campaignRecipient.count({
    where: { status: { in: ['SENT', 'DELIVERED', 'READ'] }, sentAt: { gte: since } },
  });

  return {
    campaigns,
    connected: connected?.status === 'CONNECTED',
    optedOut,
    sentToday,
    dailyLimit: DAILY_LIMIT,
  };
}
