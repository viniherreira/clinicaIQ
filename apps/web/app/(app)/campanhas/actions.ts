'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient, decrypt } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clinicToday } from '@/lib/tz';
import { capabilityBlocked, writeBlocked } from '@/lib/access';

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId, active: true } } },
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
  /** Patients skipped because they opted out, have no usable phone, or never
   *  authorised promotional messages. */
  skipped: { optOut: number; noPhone: number; semAceite: number };
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
      marketingConsentAt: true,
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
  /**
   * Cadastrado antes de existir o aceite de campanha, ou nunca autorizou.
   *
   * Contado à parte do opt-out porque a saída é outra: quem pediu SAIR não deve
   * ser reabordado, e estes só precisam ser perguntados uma vez, no balcão.
   */
  let semAceite = 0;
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
    // O aceite do cadastro cobre tratar o paciente e guardar o prontuário, não
    // receber promoção. Sem autorização específica, fora da campanha — pela lei
    // e porque mensagem não pedida é o que faz o número da clínica ser
    // denunciado e derrubado.
    if (!p.marketingConsentAt) {
      semAceite += 1;
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

  return { patients: result, skipped: { optOut, noPhone, semAceite }, procedures };
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

/** Teto diário por clínica, para o volume de marketing ficar plausível. */
const DAILY_LIMIT = 200;

const CAMPAIGNS_PAUSED = 'O envio de campanhas pelo WhatsApp oficial chega em breve.';

export async function createAndSendCampaign(input: {
  name: string;
  message: string;
  patientIds: string[];
}): Promise<CampaignFormState> {
  const { tenantId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, error: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'campanhas');
  if (semAcesso) return { success: false, error: semAcesso };

  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  // As campanhas saíam pelo número pareado por QR, que não existe mais. Pela
  // API oficial, mensagem de marketing precisa de modelo aprovado pela Meta:
  // até essa parte ficar pronta, nada sai daqui (o histórico continua).
  return { success: false, error: CAMPAIGNS_PAUSED };
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

  const optedOut = await db.patient.count({ where: { whatsappOptOut: true } });

  const since = new Date(Date.now() - 86400000);
  const sentToday = await db.campaignRecipient.count({
    where: { status: { in: ['SENT', 'DELIVERED', 'READ'] }, sentAt: { gte: since } },
  });

  return {
    campaigns,
    // Envio pausado até as campanhas saírem pela API oficial (ver createAndSendCampaign).
    connected: false,
    optedOut,
    sentToday,
    dailyLimit: DAILY_LIMIT,
  };
}
