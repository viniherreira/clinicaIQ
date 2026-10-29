'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { storageEnabled, uploadObject, signObject, deleteObject } from '@/lib/storage';
import { contentMatchesType, fileHead } from '@/lib/file-sniff';
import { capabilityBlocked, hasCapability, writeBlocked } from '@/lib/access';
import { ANAMNESIS_KEYS, type AnamnesisAnswers } from './_components/anamnesis-questions';
import { refOutsideTenant, refErrorMessage } from '@/lib/owns';
import { findingText, isFace, isKind, KINDS, VALID_TEETH, type FindingKind, type FindingStatus } from '@/lib/odontogram';

// ─── Auth ──────────────────────────────────────────────────────────────────────

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId, active: true } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');
  const user = await prisma.user.findFirst({
    where: { clerkUserId: userId, tenantId: tenant.id, active: true },
    select: { id: true },
  });
  if (!user) redirect('/sign-in');

  return { tenantId: tenant.id, userId: user.id };
}

/** BRL-masked string → number (cents-based). */
function parseBRL(value: string): number {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}

// ─── Clinical record (histórico + financeiro + odontograma) ──────────────────

const LEITURA_JANELA_MS = 10 * 60_000;

async function registrarLeitura(tenantId: string, userId: string, patientId: string): Promise<void> {
  const recente = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      userId,
      action: 'RECORD_VIEWED',
      entityId: patientId,
      createdAt: { gte: new Date(Date.now() - LEITURA_JANELA_MS) },
    },
    select: { id: true },
  });
  if (recente) return;
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'RECORD_VIEWED', entity: 'Patient', entityId: patientId },
  });
}

export async function getPatientRecord(patientId: string) {
  const { tenantId, userId } = await requireTenant();
  const db = getTenantClient(tenantId);
  const now = new Date();

  const [appointments, quotes, payments, findings, anamnesis, evolutions, files, professionals, procedures] = await Promise.all([
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
        quote: { select: { id: true, number: true } },
      },
    }),
    db.toothFinding.findMany({
      where: { patientId },
      orderBy: [{ toothNumber: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        toothNumber: true,
        surfaces: true,
        kind: true,
        status: true,
        note: true,
        doneAt: true,
        createdAt: true,
        procedure: { select: { id: true, name: true, basePrice: true } },
        professional: { select: { id: true, name: true } },
      },
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
    db.procedure.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, basePrice: true },
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

  // O prontuário é dado sensível de saúde (LGPD art. 11) e a recepcionista não
  // precisa dele para agendar; o financeiro não é assunto de quem atende. Em vez
  // de barrar a tela inteira, devolvemos só o que o perfil alcança — a ficha do
  // paciente continua abrindo para todo mundo, com o conteúdo certo em cada caso.
  const [veProntuario, veFinanceiro] = await Promise.all([
    hasCapability(tenantId, 'prontuario'),
    hasCapability(tenantId, 'financeiro'),
  ]);
  // Ler o prontuário também fica no registro (LGPD): não só quem alterou, mas
  // quem abriu. Uma linha a cada 10 minutos por pessoa e paciente, para o
  // registro não virar uma linha por clique.
  if (veProntuario) await registrarLeitura(tenantId, userId, patientId);

  const semFinanceiro = {
    contracted: 0,
    paid: 0,
    balance: 0,
    payments: [] as never[],
    acceptedQuotes: [] as never[],
    quotes: [] as never[],
  };

  return {
    appointments: appointments.map((a) => ({ ...a })),
    stats: {
      visits: attended.length,
      missed: appointments.filter((a) => a.status === 'MISSED').length,
      totalAppointments: appointments.length,
      lastVisit: attended[0]?.startTime ?? null,
      nextAppointment: upcoming?.startTime ?? null,
    },
    canSeeRecord: veProntuario,
    canSeeFinance: veFinanceiro,
    financial: !veFinanceiro ? semFinanceiro : {
      contracted,
      paid,
      balance: Math.max(0, contracted - paid),
      payments: payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        notes: p.notes,
        paidAt: p.paidAt,
        quoteId: p.quote?.id ?? null,
        quoteNumber: p.quote?.number ?? null,
      })),
      acceptedQuotes: quotes
        .filter((q) => q.status === 'ACCEPTED')
        .map((q) => ({ id: q.id, number: q.number, total: Number(q.total) })),
      quotes: quotes.map((q) => ({
        id: q.id,
        number: q.number,
        status: q.status,
        total: Number(q.total),
        createdAt: q.createdAt,
        paid: payments
          .filter((p) => p.quote?.id === q.id)
          .reduce((s, p) => s + Number(p.amount), 0),
      })),
    },
    findings: veProntuario
      ? findings.map(({ procedure, ...f }) => ({
          ...f,
          procedure: procedure ? { id: procedure.id, name: procedure.name, price: Number(procedure.basePrice) } : null,
        }))
      : [],
    anamnesis:
      veProntuario && anamnesis
        ? { answers: anamnesis.answers as unknown as AnamnesisAnswers, updatedAt: anamnesis.updatedAt }
        : null,
    evolutions: veProntuario ? evolutions.map((e) => ({ ...e })) : [],
    files: veProntuario ? filesWithUrls : [],
    professionals,
    procedures: procedures.map((p) => ({ id: p.id, name: p.name, price: Number(p.basePrice) })),
    storageEnabled: storageEnabled(),
  };
}

// ─── Odontograma ───────────────────────────────────────────────────────────────

type OdontoResult = { ok: true } | { ok: false; message: string };

/** Quem escreve no prontuário: a clínica pode escrever, a pessoa tem acesso, o paciente é daqui. */
async function requireRecordWriter(patientId: string): Promise<{ tenantId: string; userId: string } | { message: string }> {
  const ctx = await requirePatient(patientId);
  if (!ctx) return { message: 'Paciente não encontrado.' };
  const bloqueio = await writeBlocked(ctx.tenantId);
  if (bloqueio) return { message: bloqueio };
  const semAcesso = await capabilityBlocked(ctx.tenantId, 'prontuario');
  if (semAcesso) return { message: semAcesso };
  return ctx;
}

const findingSchema = z.object({
  teeth: z.array(z.number().int()).min(1, 'Escolha ao menos um dente.').max(32),
  kind: z.string().refine(isKind, 'Marcação inválida.'),
  surfaces: z.array(z.string()).max(5).default([]),
  status: z.enum(['PLANNED', 'DONE', 'EXISTING']),
  note: z.string().trim().max(300).optional().or(z.literal('')),
  procedureId: z.string().max(60).optional().or(z.literal('')),
  professionalId: z.string().max(60).optional().or(z.literal('')),
});

/** A evolução que conta o que foi feito: marcar como realizado escreve na história clínica. */
async function evolutionFor(
  ctx: { tenantId: string; userId: string },
  patientId: string,
  done: { toothNumber: number; kind: string; surfaces: string[]; note: string | null; professionalId: string | null }[],
) {
  if (done.length === 0) return;
  const linhas = done.map((f) => `${findingText(f)}${f.note ? ` (${f.note})` : ''}`);
  await prisma.evolution.create({
    data: {
      tenantId: ctx.tenantId,
      patientId,
      professionalId: done.find((f) => f.professionalId)?.professionalId ?? null,
      description: `Realizado: ${linhas.join('; ')}.`,
      teeth: [...new Set(done.map((f) => f.toothNumber))],
      createdById: ctx.userId,
    },
  });
}

/** Marca um ou mais dentes de uma vez (as mesmas faces em todos). */
export async function addToothFindings(
  patientId: string,
  input: { teeth: number[]; kind: string; surfaces?: string[]; status: FindingStatus; note?: string; procedureId?: string; professionalId?: string },
): Promise<OdontoResult> {
  const ctx = await requireRecordWriter(patientId);
  if ('message' in ctx) return { ok: false, message: ctx.message };
  const parsed = findingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = parsed.data;
  const kind = KINDS[d.kind as FindingKind];
  const teeth = [...new Set(d.teeth)].filter((t) => VALID_TEETH.has(t));
  if (teeth.length === 0) return { ok: false, message: 'Dente inválido.' };
  const surfaces = kind.faces ? [...new Set(d.surfaces.filter(isFace))] : [];
  if (kind.faces && surfaces.length === 0) return { ok: false, message: 'Escolha as faces do dente.' };

  const foreign = await refOutsideTenant(ctx.tenantId, {
    professionalId: d.professionalId || null,
    procedureIds: d.procedureId ? [d.procedureId] : [],
  });
  if (foreign) return { ok: false, message: refErrorMessage(foreign) };

  const now = new Date();
  const rows = teeth.map((toothNumber) => ({
    tenantId: ctx.tenantId,
    patientId,
    toothNumber,
    kind: d.kind,
    surfaces,
    status: d.status,
    note: d.note || null,
    procedureId: d.procedureId || null,
    professionalId: d.professionalId || null,
    doneAt: d.status === 'DONE' ? now : null,
    createdById: ctx.userId,
  }));
  await prisma.toothFinding.createMany({ data: rows });
  if (d.status === 'DONE') await evolutionFor(ctx, patientId, rows);

  await prisma.auditLog.create({
    data: { tenantId: ctx.tenantId, userId: ctx.userId, action: 'TOOTH_FINDING_ADD', entity: 'Patient', entityId: patientId, metadata: { teeth, kind: d.kind } },
  });
  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

const patchSchema = z.object({
  status: z.enum(['PLANNED', 'DONE', 'EXISTING']).optional(),
  note: z.string().max(300).optional(),
  procedureId: z.string().max(60).nullable().optional(),
});

/** Muda a situação (realizar, voltar a fazer), a anotação ou o procedimento de marcações do paciente. */
export async function updateToothFindings(
  patientId: string,
  ids: string[],
  patch: { status?: FindingStatus; note?: string; procedureId?: string | null },
): Promise<OdontoResult> {
  const ctx = await requireRecordWriter(patientId);
  if ('message' in ctx) return { ok: false, message: ctx.message };
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, message: 'Dados inválidos.' };
  const p = parsed.data;
  if (p.procedureId) {
    const foreign = await refOutsideTenant(ctx.tenantId, { procedureIds: [p.procedureId] });
    if (foreign) return { ok: false, message: refErrorMessage(foreign) };
  }
  const alvo = await prisma.toothFinding.findMany({
    where: { id: { in: ids.slice(0, 100) }, tenantId: ctx.tenantId, patientId },
    select: { id: true, toothNumber: true, kind: true, surfaces: true, note: true, status: true, professionalId: true },
  });
  if (alvo.length === 0) return { ok: false, message: 'Marcação não encontrada.' };

  await prisma.toothFinding.updateMany({
    where: { id: { in: alvo.map((f) => f.id) }, tenantId: ctx.tenantId },
    data: {
      ...(p.status ? { status: p.status, doneAt: p.status === 'DONE' ? new Date() : null } : {}),
      ...(p.note !== undefined ? { note: p.note.trim() || null } : {}),
      ...(p.procedureId !== undefined ? { procedureId: p.procedureId || null } : {}),
    },
  });
  if (p.status === 'DONE') await evolutionFor(ctx, patientId, alvo.filter((f) => f.status !== 'DONE'));
  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

export async function deleteToothFinding(patientId: string, id: string): Promise<OdontoResult> {
  const ctx = await requireRecordWriter(patientId);
  if ('message' in ctx) return { ok: false, message: ctx.message };
  const { count } = await prisma.toothFinding.deleteMany({ where: { id, tenantId: ctx.tenantId, patientId } });
  if (count === 0) return { ok: false, message: 'Marcação não encontrada.' };
  await prisma.auditLog.create({
    data: { tenantId: ctx.tenantId, userId: ctx.userId, action: 'TOOTH_FINDING_DELETE', entity: 'Patient', entityId: patientId, metadata: { findingId: id } },
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, errors: { amount: [bloqueio] } };

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return { success: false, errors: { amount: [semAcesso] } };
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

  const foreign = await refOutsideTenant(tenantId, { quoteId });
  if (foreign) return { success: false, errors: { amount: [refErrorMessage(foreign)] } };

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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return;

  const semAcesso = await capabilityBlocked(tenantId, 'financeiro');
  if (semAcesso) return;
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false };

  const semAcesso = await capabilityBlocked(tenantId, 'prontuario');
  if (semAcesso) return { ok: false };

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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'prontuario');
  if (semAcesso) return { ok: false, message: semAcesso };

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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return;

  const semAcesso = await capabilityBlocked(tenantId, 'prontuario');
  if (semAcesso) return;
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'prontuario');
  if (semAcesso) return { ok: false, message: semAcesso };

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
  // O tipo acima é o declarado; o conteúdo tem de bater (um HTML não entra como PNG).
  if (!contentMatchesType(file.type, await fileHead(file))) {
    return { ok: false, message: 'O arquivo não é do formato que diz ser. Envie a imagem ou o PDF original.' };
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return;

  const semAcesso = await capabilityBlocked(tenantId, 'prontuario');
  if (semAcesso) return;
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
