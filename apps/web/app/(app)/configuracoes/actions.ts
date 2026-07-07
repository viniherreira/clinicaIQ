'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PROFESSIONAL_PALETTE } from './_components/constants';

// ─── Auth ──────────────────────────────────────────────────────────────────────

async function requireOwner() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');

  const user = await prisma.user.findFirst({
    where: { clerkUserId: userId, tenantId: tenant.id },
    select: { id: true, role: true },
  });

  return { tenantId: tenant.id, userId: user!.id, role: user!.role };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ProfessionalFormState =
  | { success: true; professionalId: string }
  | { success: false; errors: Record<string, string[]>; message?: string };

export type ClinicFormState =
  | { success: true }
  | { success: false; errors: Record<string, string[]>; message?: string };

// ─── Schemas ───────────────────────────────────────────────────────────────────

const professionalSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres').max(100),
  specialty: z.string().trim().max(80).optional().or(z.literal('')),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida'),
});

const clinicSchema = z.object({
  name: z.string().trim().min(2, 'Nome da clínica obrigatório').max(120),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  email: z.string().trim().email('E-mail inválido').max(120).optional().or(z.literal('')),
  document: z.string().trim().max(20).optional().or(z.literal('')),
});

// ─── Clinic data ─────────────────────────────────────────────────────────────

export async function getClinic() {
  const { tenantId } = await requireOwner();
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, phone: true, email: true, document: true },
  });
}

export async function updateClinic(
  _prev: ClinicFormState | null,
  formData: FormData,
): Promise<ClinicFormState> {
  const { tenantId, userId } = await requireOwner();
  const parsed = clinicSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const { name, phone, email, document } = parsed.data;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name,
      phone: phone || null,
      email: email || null,
      document: document || null,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'UPDATE', entity: 'Tenant', entityId: tenantId },
  });

  revalidatePath('/configuracoes');
  revalidatePath('/', 'layout');
  return { success: true };
}

// ─── Professionals ─────────────────────────────────────────────────────────────

export async function listProfessionals() {
  const { tenantId } = await requireOwner();
  const db = getTenantClient(tenantId);
  return db.professional.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      specialty: true,
      color: true,
      active: true,
      _count: { select: { appointments: true } },
    },
  });
}

/** Picks the first palette color not yet used by an active professional, so new
 *  professionals get a distinct color out of the box. */
async function nextAvailableColor(tenantId: string): Promise<string> {
  const used = new Set(
    (
      await prisma.professional.findMany({
        where: { tenantId, color: { not: null } },
        select: { color: true },
      })
    ).map((p) => p.color),
  );
  return PROFESSIONAL_PALETTE.find((c) => !used.has(c)) ?? PROFESSIONAL_PALETTE[0];
}

export async function suggestColor(): Promise<string> {
  const { tenantId } = await requireOwner();
  return nextAvailableColor(tenantId);
}

export async function createProfessional(
  _prev: ProfessionalFormState | null,
  formData: FormData,
): Promise<ProfessionalFormState> {
  const { tenantId, userId } = await requireOwner();
  const parsed = professionalSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const { name, specialty, color } = parsed.data;

  const professional = await prisma.professional.create({
    data: { tenantId, name, specialty: specialty || null, color },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'CREATE', entity: 'Professional', entityId: professional.id },
  });

  revalidatePath('/configuracoes');
  revalidatePath('/agenda');
  return { success: true, professionalId: professional.id };
}

export async function updateProfessional(
  id: string,
  _prev: ProfessionalFormState | null,
  formData: FormData,
): Promise<ProfessionalFormState> {
  const { tenantId, userId } = await requireOwner();
  const parsed = professionalSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const { name, specialty, color } = parsed.data;

  await prisma.professional.update({
    where: { id, tenantId },
    data: { name, specialty: specialty || null, color },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'UPDATE', entity: 'Professional', entityId: id },
  });

  revalidatePath('/configuracoes');
  revalidatePath('/agenda');
  return { success: true, professionalId: id };
}

export async function toggleProfessionalActive(id: string) {
  const { tenantId, userId } = await requireOwner();
  const professional = await prisma.professional.findFirst({
    where: { id, tenantId },
    select: { active: true },
  });
  if (!professional) return;

  await prisma.professional.update({
    where: { id, tenantId },
    data: { active: !professional.active },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: professional.active ? 'DEACTIVATE' : 'ACTIVATE',
      entity: 'Professional',
      entityId: id,
    },
  });

  revalidatePath('/configuracoes');
  revalidatePath('/agenda');
}

// ─── Business hours ────────────────────────────────────────────────────────────

export interface DayHours {
  open: boolean;
  start: string;
  end: string;
}

/** Index 0..6 = Sunday..Saturday (matches Date.getDay()). */
const DEFAULT_HOURS: DayHours[] = [
  { open: false, start: '08:00', end: '12:00' }, // Dom
  { open: true, start: '08:00', end: '18:00' }, // Seg
  { open: true, start: '08:00', end: '18:00' }, // Ter
  { open: true, start: '08:00', end: '18:00' }, // Qua
  { open: true, start: '08:00', end: '18:00' }, // Qui
  { open: true, start: '08:00', end: '18:00' }, // Sex
  { open: true, start: '08:00', end: '12:00' }, // Sáb
];

function isDayHours(v: unknown): v is DayHours {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as DayHours).open === 'boolean' &&
    typeof (v as DayHours).start === 'string' &&
    typeof (v as DayHours).end === 'string'
  );
}

export async function getBusinessHours(): Promise<DayHours[]> {
  const { tenantId } = await requireOwner();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const hours = settings.businessHours;
  if (Array.isArray(hours) && hours.length === 7 && hours.every(isDayHours)) {
    return hours as DayHours[];
  }
  return DEFAULT_HOURS;
}

export async function updateBusinessHours(hours: DayHours[]): Promise<{ ok: boolean }> {
  const { tenantId, userId } = await requireOwner();
  if (!Array.isArray(hours) || hours.length !== 7 || !hours.every(isDayHours)) {
    return { ok: false };
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  // Serialize to plain JSON so it satisfies Prisma's InputJsonValue type.
  const merged = JSON.parse(JSON.stringify({ ...settings, businessHours: hours }));
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: merged },
  });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'UPDATE_HOURS', entity: 'Tenant', entityId: tenantId },
  });
  revalidatePath('/configuracoes');
  return { ok: true };
}

// ─── Professional working hours ────────────────────────────────────────────────

export interface ProfessionalDay {
  dayOfWeek: number; // 0..6 Sunday..Saturday
  work: boolean;
  start: string;
  end: string;
  lunchStart: string;
  lunchEnd: string;
}

const HHMM = /^\d{2}:\d{2}$/;

/** Reads the saved weekly schedule for a professional as a full 7-day array
 *  (unset days come back as `work: false`), ready for the editor. */
export async function getProfessionalSchedule(professionalId: string): Promise<ProfessionalDay[]> {
  const { tenantId } = await requireOwner();
  // Ensure the professional belongs to the tenant before exposing anything.
  const prof = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId },
    select: { id: true },
  });
  if (!prof) return [];

  const rows = await prisma.professionalSchedule.findMany({
    where: { professionalId },
  });
  const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));

  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const r = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      work: !!r,
      start: r?.startTime ?? '08:00',
      end: r?.endTime ?? '18:00',
      lunchStart: r?.lunchStart ?? '',
      lunchEnd: r?.lunchEnd ?? '',
    };
  });
}

/** Replaces a professional's weekly schedule: upserts working days, removes the
 *  rest. Empty result ⇒ the agenda falls back to the clinic business hours. */
export async function updateProfessionalSchedule(
  professionalId: string,
  days: ProfessionalDay[],
): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const prof = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId },
    select: { id: true },
  });
  if (!prof) return { ok: false, message: 'Profissional não encontrado.' };

  if (!Array.isArray(days)) return { ok: false, message: 'Dados inválidos.' };

  for (const d of days) {
    if (!d.work) continue;
    if (!HHMM.test(d.start) || !HHMM.test(d.end) || d.end <= d.start) {
      return { ok: false, message: 'Horário de atendimento inválido.' };
    }
    const hasLunch = d.lunchStart && d.lunchEnd;
    if (hasLunch && (!HHMM.test(d.lunchStart) || !HHMM.test(d.lunchEnd) || d.lunchEnd <= d.lunchStart)) {
      return { ok: false, message: 'Horário de almoço inválido.' };
    }
  }

  const working = days.filter((d) => d.work && d.dayOfWeek >= 0 && d.dayOfWeek <= 6);
  const workingDayNumbers = working.map((d) => d.dayOfWeek);

  await prisma.$transaction([
    prisma.professionalSchedule.deleteMany({
      where: { professionalId, dayOfWeek: { notIn: workingDayNumbers.length ? workingDayNumbers : [-1] } },
    }),
    ...working.map((d) =>
      prisma.professionalSchedule.upsert({
        where: { professionalId_dayOfWeek: { professionalId, dayOfWeek: d.dayOfWeek } },
        create: {
          professionalId,
          dayOfWeek: d.dayOfWeek,
          startTime: d.start,
          endTime: d.end,
          lunchStart: d.lunchStart || null,
          lunchEnd: d.lunchEnd || null,
        },
        update: {
          startTime: d.start,
          endTime: d.end,
          lunchStart: d.lunchStart || null,
          lunchEnd: d.lunchEnd || null,
        },
      }),
    ),
  ]);

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'UPDATE_SCHEDULE', entity: 'Professional', entityId: professionalId },
  });

  revalidatePath('/configuracoes');
  revalidatePath('/agenda');
  return { ok: true };
}

export async function deleteProfessional(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const count = await prisma.appointment.count({ where: { tenantId, professionalId: id } });
  if (count > 0) {
    return {
      ok: false,
      message: 'Este profissional tem agendamentos. Desative-o em vez de excluir.',
    };
  }

  await prisma.professional.delete({ where: { id, tenantId } });
  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'DELETE', entity: 'Professional', entityId: id },
  });

  revalidatePath('/configuracoes');
  revalidatePath('/agenda');
  return { ok: true };
}
