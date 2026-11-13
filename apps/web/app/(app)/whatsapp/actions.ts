'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { capabilityBlocked, writeBlocked } from '@/lib/access';
import { graphVersion, metaSignupConfigured } from '@/lib/cloud-account';
import * as oficial from '@/lib/cloud-account-admin';

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

export interface WhatsAppPanelData {
  /** A API oficial da Meta: a conta (nunca o token) e o botão da Meta, se configurado. */
  official: {
    account: {
      active: boolean;
      status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
      displayPhone: string | null;
      verifiedName: string | null;
      coexistence: boolean;
      lastError: string | null;
      connectedAt: string;
    } | null;
    signup: { appId: string; configId: string; version: string } | null;
  };
  settings: {
    notifyOnCreate: boolean;
    notifyReminder: boolean;
    notifyBirthday: boolean;
    birthdayMessage: string;
  };
  stats: { sent: number; failed: number; last7d: number };
  recent: {
    id: string;
    patient: string;
    patientId: string;
    content: string;
    status: string;
    templateName: string | null;
    createdAt: Date;
    errorMessage: string | null;
  }[];
}

/** Creates the row on first visit so the settings toggles always have a home. */
async function ensureSession(tenantId: string) {
  const existing = await prisma.whatsAppSession.findUnique({ where: { tenantId } });
  if (existing) return existing;
  return prisma.whatsAppSession.create({ data: { tenantId } });
}

export async function getWhatsAppPanel(): Promise<WhatsAppPanelData> {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);
  const session = await ensureSession(tenantId);
  const conta = await oficial.cloudAccountSummary(tenantId);
  const official: WhatsAppPanelData['official'] = {
    account: conta
      ? {
          active: conta.active,
          status: conta.status,
          displayPhone: conta.displayPhone,
          verifiedName: conta.verifiedName,
          coexistence: conta.coexistence,
          lastError: conta.lastError,
          connectedAt: conta.connectedAt.toISOString(),
        }
      : null,
    signup: metaSignupConfigured()
      ? { appId: process.env.META_APP_ID!, configId: process.env.META_ES_CONFIG_ID!, version: graphVersion() }
      : null,
  };

  const since = new Date(Date.now() - 7 * 86400000);
  const [sent, failed, last7d, recent] = await Promise.all([
    db.whatsAppMessage.count({ where: { direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED', 'READ'] } } }),
    db.whatsAppMessage.count({ where: { direction: 'OUTBOUND', status: 'FAILED' } }),
    db.whatsAppMessage.count({ where: { direction: 'OUTBOUND', createdAt: { gte: since } } }),
    db.whatsAppMessage.findMany({
      where: { direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        content: true,
        status: true,
        templateName: true,
        createdAt: true,
        errorMessage: true,
        patient: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    official,
    settings: {
      notifyOnCreate: session.notifyOnCreate,
      notifyReminder: session.notifyReminder,
      notifyBirthday: session.notifyBirthday,
      birthdayMessage: session.birthdayMessage ?? '',
    },
    stats: { sent, failed, last7d },
    recent: recent.map((m) => ({
      id: m.id,
      patient: m.patient.name,
      patientId: m.patient.id,
      content: m.content,
      status: m.status,
      templateName: m.templateName,
      createdAt: m.createdAt,
      errorMessage: m.errorMessage,
    })),
  };
}

// ─── API oficial da Meta ─────────────────────────────────────────────────────

type OfficialResult = { ok: true } | { ok: false; message: string };

/** Mexer na conexão: dono ou quem tem `configuracoes`, com a assinatura em dia. */
async function officialGuard(): Promise<{ ok: true; tenantId: string; userId: string | null } | { ok: false; message: string }> {
  const { tenantId } = await requireTenant();
  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };
  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false, message: semAcesso };
  const { userId: clerkUserId } = await auth();
  const user = clerkUserId
    ? await prisma.user.findFirst({ where: { tenantId, clerkUserId }, select: { id: true } })
    : null;
  return { ok: true, tenantId, userId: user?.id ?? null };
}

async function official(fn: (g: { tenantId: string; userId: string | null }) => Promise<OfficialResult>): Promise<OfficialResult> {
  const g = await officialGuard();
  if (!g.ok) return g;
  const r = await fn(g);
  if (r.ok) {
    revalidatePath('/whatsapp');
    revalidatePath('/configuracoes');
  }
  return r;
}

export const connectOfficialManual = async (input: { token: string; phoneNumberId: string; wabaId: string }) =>
  official((g) => oficial.connectManual(g.tenantId, g.userId, input));

export const finishOfficialSignup = async (input: { code: string; wabaId: string; phoneNumberId?: string | null; coexistence: boolean }) =>
  official((g) => oficial.finishEmbeddedSignup(g.tenantId, g.userId, input));

export const disconnectOfficial = async () => official((g) => oficial.disconnectCloud(g.tenantId, g.userId));

export const checkOfficial = async () => official((g) => oficial.checkCloud(g.tenantId));

// ─── Settings ────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  notifyOnCreate: z.boolean(),
  notifyReminder: z.boolean(),
  notifyBirthday: z.boolean(),
  birthdayMessage: z.string().trim().max(600),
});

export type SettingsFormState =
  | { success: true }
  | { success: false; error: string };

export async function saveWhatsAppSettings(
  input: z.infer<typeof settingsSchema>,
): Promise<SettingsFormState> {
  const { tenantId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, error: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { success: false, error: semAcesso };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Dados inválidos.' };

  await ensureSession(tenantId);
  await prisma.whatsAppSession.updateMany({
    where: { tenantId },
    data: {
      notifyOnCreate: parsed.data.notifyOnCreate,
      notifyReminder: parsed.data.notifyReminder,
      notifyBirthday: parsed.data.notifyBirthday,
      birthdayMessage: parsed.data.birthdayMessage || null,
    },
  });

  revalidatePath('/whatsapp');
  return { success: true };
}
