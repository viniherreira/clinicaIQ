'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient, type WhatsAppConnectionStatus } from '@clinicaiq/db';
import { getGatewayProvider, gatewayConfigured } from '@clinicaiq/whatsapp';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getWhatsAppHealth } from '@/lib/whatsapp';
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
  /** False when WHATSAPP_GATEWAY_URL/TOKEN aren't set on this deployment. */
  gatewayReady: boolean;
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
  status: WhatsAppConnectionStatus;
  phoneNumber: string | null;
  displayName: string | null;
  connectedAt: Date | null;
  lastError: string | null;
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

  // The stored status can lie: if the gateway dies without a clean socket close,
  // it stays CONNECTED forever and the clinic thinks messages are going out. Ask
  // the gateway directly and reconcile before rendering.
  let status = session.status;
  let lastError = session.lastError;
  if (status === 'CONNECTED') {
    const health = await getWhatsAppHealth(tenantId);
    if (!health.connected) {
      status = 'ERROR';
      lastError = health.problem;
      await prisma.whatsAppSession
        .updateMany({ where: { tenantId }, data: { status: 'ERROR', lastError } })
        .catch(() => undefined);
    }
  }

  return {
    official,
    gatewayReady: gatewayConfigured(),
    status,
    phoneNumber: session.phoneNumber,
    displayName: session.displayName,
    connectedAt: session.connectedAt,
    lastError,
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

// ─── Pairing ─────────────────────────────────────────────────────────────────

export interface ConnectionState {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  phoneNumber: string | null;
  lastError: string | null;
}

async function readState(tenantId: string): Promise<ConnectionState> {
  const row = await prisma.whatsAppSession.findUnique({
    where: { tenantId },
    select: { status: true, qrCode: true, qrExpiresAt: true, phoneNumber: true, lastError: true },
  });
  if (!row) return { status: 'DISCONNECTED', qrCode: null, phoneNumber: null, lastError: null };

  // An expired QR is worse than none — it just fails silently in the camera.
  const qrValid = row.qrCode && (!row.qrExpiresAt || row.qrExpiresAt > new Date());
  return {
    status: row.status,
    qrCode: qrValid ? row.qrCode : null,
    phoneNumber: row.phoneNumber,
    lastError: row.lastError,
  };
}

/** Asks the gateway to open a socket. The QR arrives on the next poll. */
export async function startConnection(): Promise<ConnectionState> {
  const { tenantId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { status: 'ERROR' as const, qrCode: null, phoneNumber: null, lastError: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { status: 'ERROR' as const, qrCode: null, phoneNumber: null, lastError: semAcesso };
  await ensureSession(tenantId);

  const gateway = getGatewayProvider(tenantId);
  if (!gateway) {
    return {
      status: 'ERROR',
      qrCode: null,
      phoneNumber: null,
      lastError: 'Serviço de WhatsApp não configurado neste ambiente.',
    };
  }

  try {
    await gateway.connect();
  } catch {
    await prisma.whatsAppSession.updateMany({
      where: { tenantId },
      data: { status: 'ERROR', lastError: 'Não foi possível falar com o serviço de WhatsApp.' },
    });
  }

  await prisma.auditLog.create({
    data: { tenantId, action: 'WHATSAPP_CONNECT_STARTED', entity: 'WhatsAppSession', entityId: tenantId },
  });

  return readState(tenantId);
}

/** Polled by the pairing modal every couple of seconds. */
export async function getConnectionState(): Promise<ConnectionState> {
  const { tenantId } = await requireTenant();
  return readState(tenantId);
}

export async function disconnectWhatsApp(): Promise<{ ok: boolean }> {
  const { tenantId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false };

  const gateway = getGatewayProvider(tenantId);
  if (gateway) {
    try {
      await gateway.disconnect();
    } catch {
      // Gateway unreachable — still clear local state so the UI isn't stuck
      // showing a connection the clinic can no longer use.
    }
  }

  await prisma.whatsAppSession.updateMany({
    where: { tenantId },
    data: {
      status: 'DISCONNECTED',
      qrCode: null,
      qrExpiresAt: null,
      phoneNumber: null,
      displayName: null,
      lastError: null,
      disconnectedAt: new Date(),
    },
  });
  await prisma.whatsAppAuthKey.deleteMany({ where: { tenantId } });

  await prisma.auditLog.create({
    data: { tenantId, action: 'WHATSAPP_DISCONNECTED', entity: 'WhatsAppSession', entityId: tenantId },
  });

  revalidatePath('/whatsapp');
  return { ok: true };
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

export const finishOfficialSignup = async (input: { code: string; wabaId: string; phoneNumberId: string; coexistence: boolean }) =>
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

// ─── Test message ────────────────────────────────────────────────────────────

export type TestMessageState = { success: boolean; message: string };

/**
 * Sends a message to a number the user types, so the clinic can prove the line
 * works before relying on it for real appointments.
 */
export async function sendTestMessage(rawPhone: string): Promise<TestMessageState> {
  const { tenantId } = await requireTenant();

  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 10) return { success: false, message: 'Informe um número com DDD.' };

  const session = await prisma.whatsAppSession.findUnique({
    where: { tenantId },
    select: { status: true },
  });
  if (session?.status !== 'CONNECTED') {
    return { success: false, message: 'Conecte o WhatsApp antes de enviar um teste.' };
  }

  const gateway = getGatewayProvider(tenantId);
  if (!gateway) return { success: false, message: 'Serviço de WhatsApp não configurado.' };

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const result = await gateway.sendMessage({
    to: digits.startsWith('55') ? digits : `55${digits}`,
    body:
      `✅ Teste do DreamClin\n\n` +
      `Se você recebeu esta mensagem, o WhatsApp da *${tenant?.name ?? 'sua clínica'}* ` +
      `está conectado e pronto para enviar confirmações de agendamento.`,
  });

  return result.success
    ? { success: true, message: 'Mensagem enviada. Confira o WhatsApp do número informado.' }
    : { success: false, message: `Falha no envio: ${result.error ?? 'erro desconhecido'}` };
}
