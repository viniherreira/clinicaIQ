'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient, encrypt, decrypt } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMasterKey() {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

function stripMask(value: string) {
  return value.replace(/\D/g, '');
}

function validateCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === parseInt(digits[10]);
}

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

async function nextControlNumber(tenantId: string): Promise<number> {
  const last = await prisma.patient.findFirst({
    where: { tenantId },
    orderBy: { controlNumber: 'desc' },
    select: { controlNumber: true },
  });
  return (last?.controlNumber ?? 0) + 1;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const patientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(120),
  nickname: z.string().max(60).optional().or(z.literal('')),
  cpf: z
    .string()
    .transform(stripMask)
    .refine((v) => !v || validateCpf(v), { message: 'CPF inválido' })
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .transform(stripMask)
    .refine((v) => v.length >= 10 && v.length <= 11, { message: 'Telefone inválido' }),
  phone2: z
    .string()
    .transform(stripMask)
    .refine((v) => !v || (v.length >= 10 && v.length <= 11), { message: 'Telefone inválido' })
    .optional()
    .or(z.literal('')),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  birthDate: z.string().optional().or(z.literal('')),
  gender: z.string().optional().or(z.literal('')),
  maritalStatus: z.string().optional().or(z.literal('')),
  profession: z.string().max(80).optional().or(z.literal('')),
  referredBy: z.string().max(80).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  zipCode: z.string().max(9).optional().or(z.literal('')),
  street: z.string().max(120).optional().or(z.literal('')),
  addressNumber: z.string().max(20).optional().or(z.literal('')),
  complement: z.string().max(80).optional().or(z.literal('')),
  neighborhood: z.string().max(80).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  state: z.string().max(2).optional().or(z.literal('')),
  lgpdConsent: z.string().optional(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type PatientFormState =
  | { success: true; patientId: string }
  | { success: false; errors: Record<string, string[]>; message?: string };

// ─── List ────────────────────────────────────────────────────────────────────

export async function listPatients({
  search = '',
  page = 1,
  active,
}: {
  search?: string;
  page?: number;
  active?: boolean;
}) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);
  const PAGE_SIZE = 20;

  const where = {
    deletedAt: null,
    ...(active !== undefined ? { active } : {}),
    ...(search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {}),
  };

  const [patients, total, recent] = await Promise.all([
    db.patient.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        controlNumber: true,
        name: true,
        nickname: true,
        phoneEncrypted: true,
        email: true,
        birthDate: true,
        active: true,
        createdAt: true,
      },
    }),
    db.patient.count({ where }),
    db.patient.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, active: true, createdAt: true },
    }),
  ]);

  const masterKey = getMasterKey();

  const decryptedPatients = patients.map((p) => ({
    ...p,
    phone: p.phoneEncrypted ? decrypt(p.phoneEncrypted, masterKey, tenantId) : '',
  }));

  return {
    patients: decryptedPatients,
    total,
    pages: Math.ceil(total / PAGE_SIZE),
    recent,
  };
}

// ─── Get single ──────────────────────────────────────────────────────────────

export async function getPatient(id: string) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      patientNotes: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true } } },
      },
    },
  });

  if (!patient || patient.deletedAt) return null;

  const masterKey = getMasterKey();

  return {
    ...patient,
    cpf: patient.cpfEncrypted ? decrypt(patient.cpfEncrypted, masterKey, tenantId) : '',
    phone: patient.phoneEncrypted ? decrypt(patient.phoneEncrypted, masterKey, tenantId) : '',
    phone2: patient.phone2Encrypted ? decrypt(patient.phone2Encrypted, masterKey, tenantId) : '',
  };
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createPatient(
  _prev: PatientFormState | null,
  formData: FormData,
): Promise<PatientFormState> {
  const { tenantId, userId } = await requireTenant();

  const raw = Object.fromEntries(formData.entries());
  const parsed = patientSchema.safeParse(raw);

  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;

  if (!data.lgpdConsent) {
    return { success: false, errors: { lgpdConsent: ['Consentimento LGPD obrigatório'] } };
  }

  const masterKey = getMasterKey();

  if (data.cpf) {
    const existing = await prisma.patient.findFirst({
      where: {
        tenantId,
        cpfEncrypted: encrypt(data.cpf, masterKey, tenantId),
        deletedAt: null,
      },
    });
    if (existing) {
      return { success: false, errors: { cpf: ['CPF já cadastrado nesta clínica'] } };
    }
  }

  const controlNumber = await nextControlNumber(tenantId);

  const patient = await prisma.patient.create({
    data: {
      tenantId,
      controlNumber,
      name: data.name,
      nickname: data.nickname || null,
      cpfEncrypted: data.cpf ? encrypt(data.cpf, masterKey, tenantId) : null,
      phoneEncrypted: encrypt(data.phone, masterKey, tenantId),
      phone2Encrypted: data.phone2 ? encrypt(data.phone2, masterKey, tenantId) : null,
      email: data.email || null,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      gender: data.gender || null,
      maritalStatus: data.maritalStatus || null,
      profession: data.profession || null,
      referredBy: data.referredBy || null,
      notes: data.notes || null,
      zipCode: data.zipCode || null,
      street: data.street || null,
      addressNumber: data.addressNumber || null,
      complement: data.complement || null,
      neighborhood: data.neighborhood || null,
      city: data.city || null,
      state: data.state || null,
      lgpdConsentAt: new Date(),
      createdById: userId,
      updatedById: userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'CREATE',
      entity: 'Patient',
      entityId: patient.id,
    },
  });

  revalidatePath('/pacientes');
  return { success: true, patientId: patient.id };
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updatePatient(
  id: string,
  _prev: PatientFormState | null,
  formData: FormData,
): Promise<PatientFormState> {
  const { tenantId, userId } = await requireTenant();

  const raw = Object.fromEntries(formData.entries());
  const parsed = patientSchema.safeParse(raw);

  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const data = parsed.data;
  const masterKey = getMasterKey();

  if (data.cpf) {
    const existing = await prisma.patient.findFirst({
      where: {
        tenantId,
        cpfEncrypted: encrypt(data.cpf, masterKey, tenantId),
        deletedAt: null,
        NOT: { id },
      },
    });
    if (existing) {
      return { success: false, errors: { cpf: ['CPF já cadastrado nesta clínica'] } };
    }
  }

  await prisma.patient.update({
    where: { id, tenantId },
    data: {
      name: data.name,
      nickname: data.nickname || null,
      cpfEncrypted: data.cpf ? encrypt(data.cpf, masterKey, tenantId) : null,
      phoneEncrypted: encrypt(data.phone, masterKey, tenantId),
      phone2Encrypted: data.phone2 ? encrypt(data.phone2, masterKey, tenantId) : null,
      email: data.email || null,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      gender: data.gender || null,
      maritalStatus: data.maritalStatus || null,
      profession: data.profession || null,
      referredBy: data.referredBy || null,
      notes: data.notes || null,
      zipCode: data.zipCode || null,
      street: data.street || null,
      addressNumber: data.addressNumber || null,
      complement: data.complement || null,
      neighborhood: data.neighborhood || null,
      city: data.city || null,
      state: data.state || null,
      updatedById: userId,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'UPDATE', entity: 'Patient', entityId: id },
  });

  revalidatePath('/pacientes');
  revalidatePath(`/pacientes/${id}`);
  return { success: true, patientId: id };
}

// ─── Toggle active ────────────────────────────────────────────────────────────

export async function togglePatientActive(id: string) {
  const { tenantId, userId } = await requireTenant();

  const patient = await prisma.patient.findFirst({ where: { id, tenantId } });
  if (!patient) return;

  await prisma.patient.update({
    where: { id, tenantId },
    data: { active: !patient.active, updatedById: userId },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: patient.active ? 'DEACTIVATE' : 'ACTIVATE',
      entity: 'Patient',
      entityId: id,
    },
  });

  revalidatePath('/pacientes');
  revalidatePath(`/pacientes/${id}`);
}

// ─── Soft delete ──────────────────────────────────────────────────────────────

export async function deletePatient(id: string) {
  const { tenantId, userId } = await requireTenant();

  await prisma.patient.update({
    where: { id, tenantId },
    data: { deletedAt: new Date(), updatedById: userId },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DELETE', entity: 'Patient', entityId: id },
  });

  revalidatePath('/pacientes');
}

// ─── Add note ─────────────────────────────────────────────────────────────────

export async function addPatientNote(patientId: string, content: string) {
  const { tenantId, userId } = await requireTenant();

  if (!content.trim()) return;

  await prisma.patientNote.create({
    data: { tenantId, patientId, userId, content: content.trim() },
  });

  revalidatePath(`/pacientes/${patientId}`);
}
