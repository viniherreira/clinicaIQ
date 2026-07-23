'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient, type WhatsAppConnectionStatus } from '@clinicaiq/db';
import { getGatewayProvider, gatewayConfigured } from '@clinicaiq/whatsapp';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

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

export interface WhatsAppPanelData {
  /** False when WHATSAPP_GATEWAY_URL/TOKEN aren't set on this deployment. */
  gatewayReady: boolean;
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
    gatewayReady: gatewayConfigured(),
    status: session.status,
    phoneNumber: session.phoneNumber,
    displayName: session.displayName,
    connectedAt: session.connectedAt,
    lastError: session.lastError,
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
      `✅ Teste do ClinicaIQ\n\n` +
      `Se você recebeu esta mensagem, o WhatsApp da *${tenant?.name ?? 'sua clínica'}* ` +
      `está conectado e pronto para enviar confirmações de agendamento.`,
  });

  return result.success
    ? { success: true, message: 'Mensagem enviada. Confira o WhatsApp do número informado.' }
    : { success: false, message: `Falha no envio: ${result.error ?? 'erro desconhecido'}` };
}
