'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient, type ToothStatus } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { storageEnabled, uploadObject, signObject, deleteObject } from '@/lib/storage';
import { ANAMNESIS_KEYS, type AnamnesisAnswers } from './_components/anamnesis-questions';

// ─── Auth ──────────────────────────────────────────────────────────────────────

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');
  const user = await prisma.user.findFirst({
    where: { clerkUserId: userId, tenantId: tenant.id },
    select: { id: true },
  });
  return { tenantId: tenant.id, userId: user!.id };
}

/** BRL-masked string → number (cents-based). */
function parseBRL(value: string): number {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}

// ─── Clinical record (histórico + financeiro + odontograma) ──────────────────

export async function getPatientRecord(patientId: string) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);
  const now = new Date();

  const [appointments, quotes, payments, teeth, anamnesis, evolutions, files, professionals] = await Promise.all([
    db.appointment.findMany({
      where: { patientId },
      orderBy: { startTime: 'desc' },
      take: 100,
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        type: true,
        notes: true,
        professional: { select: { name: true, color: true } },
        procedure: { select: { name: true } },
      },
    }),
    db.quote.findMany({
      where: { patientId },
      orderBy: { number: 'desc' },
      select: { id: true, number: true, status: true, total: true, createdAt: true },
    }),
    db.payment.findMany({
      where: { patientId },
      orderBy: { paidAt: 'desc' },
      select: {
        id: true,
        amount: true,
        method: true,
        notes: true,
        paidAt: true,
        quote: { select: { number: true } },
      },
    }),
    db.toothRecord.findMany({
      where: { patientId },
      select: { toothNumber: true, status: true, note: true },
    }),
    db.anamnesis.findFirst({
      where: { patientId },
      select: { answers: true, updatedAt: true },
    }),
    db.evolution.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        description: true,
        teeth: true,
        createdAt: true,
        professional: { select: { name: true, color: true } },
      },
    }),
    db.patientFile.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        bucketPath: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        description: true,
        createdAt: true,
      },
    }),
    db.professional.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  // Signed URLs for the private bucket (1h). Skipped when storage is off.
  const filesWithUrls = storageEnabled()
    ? await Promise.all(
        files.map(async (f) => ({ ...f, url: await signObject(f.bucketPath) })),
      )
    : files.map((f) => ({ ...f, url: null as string | null }));

  const attended = appointments.filter((a) => a.status === 'ATTENDED');
  const upcoming = [...appointments]
    .filter((a) => new Date(a.startTime) > now && ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(a.status))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];

  const contracted = quotes
    .filter((q) => q.status === 'ACCEPTED')
    .reduce((s, q) => s + Number(q.total), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount), 0);

  return {
    appointments: appointments.map((a) => ({ ...a })),
    stats: {
      visits: attended.length,
      missed: appointments.filter((a) => a.status === 'MISSED').length,
      totalAppointments: appointments.length,
      lastVisit: attended[0]?.startTime ?? null,
      nextAppointment: upcoming?.startTime ?? null,
    },
    financial: {
      contracted,
      paid,
      balance: Math.max(0, contracted - paid),
      payments: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        notes: p.notes,
        paidAt: p.paidAt,
        quoteNumber: p.quote?.number ?? null,
      })),
      acceptedQuotes: quotes
        .filter((q) => q.status === 'ACCEPTED')
        .map((q) => ({ id: q.id, number: q.number, total: Number(q.total) })),
    },
    teeth: teeth.map((t) => ({ ...t })),
    anamnesis: anamnesis
      ? { answers: anamnesis.answers as unknown as AnamnesisAnswers, updatedAt: anamnesis.updatedAt }
      : null,
    evolutions: evolutions.map((e) => ({ ...e })),
    files: filesWithUrls,
    professionals,
    storageEnabled: storageEnabled(),
  };
}

// ─── Odontograma ───────────────────────────────────────────────────────────────

// Permanent (quadrants 1-4, teeth 1-8) + deciduous (quadrants 5-8, teeth 1-5).
const VALID_TEETH = new Set([
  ...[1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => q * 10 + n)),
  ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((n) => q * 10 + n)),
]);

export async function setToothRecord(
  patientId: string,
  toothNumber: number,
  status: ToothStatus | null,
  note?: string,
): Promise<{ ok: boolean }> {
  const { tenantId, userId } = await requireTenant();
  if (!VALID_TEETH.has(toothNumber)) return { ok: false };

  // Guard: patient must belong to this tenant.
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true },
  });
  if (!patient) return { ok: false };

  if (status === null) {
    await prisma.toothRecord.deleteMany({ where: { tenantId, patientId, toothNumber } });
  } else {
    const trimmedNote = note?.trim().slice(0, 300) || null;
    await prisma.toothRecord.upsert({
      where: { patientId_toothNumber: { patientId, toothNumber } },
      update: { status, note: trimmedNote, updatedById: userId },
      create: { tenantId, patientId, toothNumber, status, note: trimmedNote, updatedById: userId },
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: status === null ? 'TOOTH_CLEAR' : `TOOTH_${status}`,
      entity: 'Patient',
      entityId: patientId,
      metadata: { toothNumber },
    },
  });

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

// ─── Pagamentos ────────────────────────────────────────────────────────────────

const paymentSchema = z.object({
  amount: z.string().transform(parseBRL).refine((v) => v > 0, { message: 'Valor obrigatório' }),
  method: z.string().trim().max(40).optional().or(z.literal('')),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
  quoteId: z.string().optional().or(z.literal('')),
});

export type PaymentFormState =
  | { success: true }
  | { success: false; errors: Record<string, string[]> };

export async function addPayment(
  patientId: string,
  _prev: PaymentFormState | null,
  formData: FormData,
): Promise<PaymentFormState> {
  const { tenantId, userId } = await requireTenant();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const { amount, method, notes, quoteId } = parsed.data;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId },
    select: { id: true },
  });
  if (!patient) return { success: false, errors: { amount: ['Paciente não encontrado'] } };

  const payment = await prisma.payment.create({
    data: {
      tenantId,
      patientId,
      quoteId: quoteId || null,
      amount,
      method: method || null,
      notes: notes || null,
      createdById: userId,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'CREATE', entity: 'Payment', entityId: payment.id },
  });

  revalidatePath(`/pacientes/${patientId}`);
  return { success: true };
}

export async function deletePayment(paymentId: string, patientId: string) {
  const { tenantId, userId } = await requireTenant();
  await prisma.payment.deleteMany({ where: { id: paymentId, tenantId } });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DELETE', entity: 'Payment', entityId: paymentId },
  });
  revalidatePath(`/pacientes/${patientId}`);
}

// ─── Guard compartilhado ───────────────────────────────────────────────────────

async function requirePatient(patientId: string) {
  const ctx = await requireTenant();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  return patient ? ctx : null;
}

// ─── Anamnese ──────────────────────────────────────────────────────────────────

export async function saveAnamnesis(
  patientId: string,
  payload: AnamnesisAnswers,
): Promise<{ ok: boolean }> {
  const ctx = await requirePatient(patientId);
  if (!ctx) return { ok: false };
  const { tenantId, userId } = ctx;

  // Keep only known question keys and well-formed answers.
  const items: AnamnesisAnswers['items'] = {};
  for (const [key, ans] of Object.entries(payload.items ?? {})) {
    if (!ANAMNESIS_KEYS.has(key)) continue;
    if (ans?.value !== 'yes' && ans?.value !== 'no') continue;
    items[key] = {
      value: ans.value,
      ...(ans.detail?.trim() ? { detail: ans.detail.trim().slice(0, 300) } : {}),
    };
  }
  const answers = JSON.parse(
    JSON.stringify({ items, obs: payload.obs?.trim().slice(0, 2000) || undefined }),
  );

  // Tenant-guarded upsert on raw prisma (the tenant client blocks upsert by design).
  await prisma.anamnesis.upsert({
    where: { patientId },
    update: { answers, updatedById: userId },
    create: { tenantId, patientId, answers, updatedById: userId },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'ANAMNESIS_SAVE', entity: 'Patient', entityId: patientId },
  });

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

// ─── Evoluções ─────────────────────────────────────────────────────────────────

const evolutionSchema = z.object({
  description: z.string().trim().min(3, 'Descreva a evolução').max(4000),
  professionalId: z.string().optional().or(z.literal('')),
  teeth: z.array(z.number().int()).max(32).optional(),
});

export async function addEvolution(
  patientId: string,
  input: { description: string; professionalId?: string; teeth?: number[] },
): Promise<{ ok: boolean; message?: string }> {
  const ctx = await requirePatient(patientId);
  if (!ctx) return { ok: false, message: 'Paciente não encontrado.' };
  const { tenantId, userId } = ctx;

  const parsed = evolutionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { description, professionalId, teeth } = parsed.data;

  if (professionalId) {
    const prof = await prisma.professional.findFirst({
      where: { id: professionalId, tenantId },
      select: { id: true },
    });
    if (!prof) return { ok: false, message: 'Profissional inválido.' };
  }

  const evolution = await prisma.evolution.create({
    data: {
      tenantId,
      patientId,
      professionalId: professionalId || null,
      description,
      teeth: (teeth ?? []).filter((t) => VALID_TEETH.has(t)),
      createdById: userId,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'CREATE', entity: 'Evolution', entityId: evolution.id },
  });

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

export async function deleteEvolution(id: string, patientId: string) {
  const { tenantId, userId } = await requireTenant();
  await prisma.evolution.deleteMany({ where: { id, tenantId } });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DELETE', entity: 'Evolution', entityId: id },
  });
  revalidatePath(`/pacientes/${patientId}`);
}

// ─── Imagens e documentos ──────────────────────────────────────────────────────

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export type UploadFileState =
  | { ok: true }
  | { ok: false; message: string };

export async function uploadPatientFile(
  patientId: string,
  _prev: UploadFileState | null,
  formData: FormData,
): Promise<UploadFileState> {
  const ctx = await requirePatient(patientId);
  if (!ctx) return { ok: false, message: 'Paciente não encontrado.' };
  const { tenantId, userId } = ctx;

  if (!storageEnabled()) {
    return { ok: false, message: 'O armazenamento de arquivos ainda não foi configurado.' };
  }

  const file = formData.get('file');
  const description = String(formData.get('description') ?? '').trim().slice(0, 200);
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Selecione um arquivo.' };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, message: 'Formato não suportado. Use JPG, PNG, WEBP, HEIC ou PDF.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: 'Arquivo muito grande (máx. 10 MB).' };
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const bucketPath = `${tenantId}/${patientId}/${crypto.randomUUID()}-${safeName}`;

  try {
    await uploadObject(bucketPath, file);
  } catch {
    return { ok: false, message: 'Falha ao enviar o arquivo. Tente novamente.' };
  }

  const created = await prisma.patientFile.create({
    data: {
      tenantId,
      patientId,
      bucketPath,
      filename: file.name.slice(-120),
      mimeType: file.type,
      sizeBytes: file.size,
      description: description || null,
      createdById: userId,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'CREATE', entity: 'PatientFile', entityId: created.id },
  });

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

export async function deletePatientFile(id: string, patientId: string) {
  const { tenantId, userId } = await requireTenant();
  const file = await prisma.patientFile.findFirst({
    where: { id, tenantId },
    select: { id: true, bucketPath: true },
  });
  if (!file) return;

  if (storageEnabled()) {
    try {
      await deleteObject(file.bucketPath);
    } catch {
      /* row removal below still hides it; orphan cleanup can happen later */
    }
  }
  await prisma.patientFile.delete({ where: { id: file.id } });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DELETE', entity: 'PatientFile', entityId: id },
  });
  revalidatePath(`/pacientes/${patientId}`);
}
