'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, parseISO,
} from 'date-fns';
import { PROFESSIONAL_COLORS } from './_components/constants';

// ─── Auth helper ─────────────────────────────────────────────────────────────

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

// ─── Get agenda data ──────────────────────────────────────────────────────────

export async function getAgendaData(dateStr: string, view: 'day' | 'week' = 'day') {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const date = parseISO(dateStr);
  const from = view === 'week' ? startOfWeek(date, { weekStartsOn: 1 }) : startOfDay(date);
  const to = view === 'week' ? endOfWeek(date, { weekStartsOn: 1 }) : endOfDay(date);

  const [appointments, blockedSlots, professionals, procedures] = await Promise.all([
    db.appointment.findMany({
      where: { startTime: { gte: from, lte: to } },
      include: {
        patient: { select: { id: true, name: true } },
        professional: { select: { id: true, name: true, specialty: true } },
        procedure: { select: { id: true, name: true, durationMinutes: true } },
      },
      orderBy: { startTime: 'asc' },
    }),
    db.blockedSlot.findMany({
      where: { startTime: { gte: from, lte: to } },
      include: { professional: { select: { id: true, name: true } } },
    }),
    db.professional.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    }),
    db.procedure.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: 'asc' },
    }),
  ]);

  // Each professional keeps its own chosen color; fall back to the palette by
  // index for any created before colors existed.
  const professionalsWithColor = professionals.map((p, i) => ({
    ...p,
    color: p.color ?? PROFESSIONAL_COLORS[i % PROFESSIONAL_COLORS.length],
  }));

  // Serialize Decimal fields — Prisma Decimal is not a plain object
  const serializedProcedures = procedures.map((p) => ({
    ...p,
    basePrice: Number(p.basePrice),
  }));

  return { appointments, blockedSlots, professionals: professionalsWithColor, procedures: serializedProcedures };
}

// ─── Search patients (autocomplete) ──────────────────────────────────────────

export async function searchPatients(query: string) {
  const { tenantId } = await requireTenant();
  // Tokenized match: each word must appear somewhere in the name, so full
  // names, extra middle names, word order and trailing spaces all still hit.
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return [];

  const db = getTenantClient(tenantId);
  const patients = await db.patient.findMany({
    where: {
      deletedAt: null,
      active: true,
      AND: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })),
    },
    select: { id: true, name: true, controlNumber: true },
    take: 10,
    orderBy: { name: 'asc' },
  });

  return patients.map((p) => ({
    id: p.id,
    name: p.name,
    controlNumber: p.controlNumber,
  }));
}

// ─── Appointment validation schema ───────────────────────────────────────────

const appointmentSchema = z.object({
  patientId: z.string().min(1, 'Paciente obrigatório'),
  professionalId: z.string().min(1, 'Profissional obrigatório'),
  procedureId: z.string().optional().or(z.literal('')),
  date: z.string().min(1, 'Data obrigatória'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
  type: z.enum(['PARTICULAR', 'CONVENIO', 'CORTESIA']).default('PARTICULAR'),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'ATTENDED', 'MISSED']).default('SCHEDULED'),
  notes: z.string().max(500).optional().or(z.literal('')),
  sendWhatsApp: z.string().optional(),
});

export type AppointmentFormState =
  | { success: true; appointmentId: string }
  | { success: false; errors: Record<string, string[]>; message?: string };

function buildDateTimes(date: string, startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const base = parseISO(date);
  const start = new Date(base);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(base);
  end.setHours(eh, em, 0, 0);
  return { start, end };
}

async function checkConflict(
  tenantId: string,
  professionalId: string,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const conflict = await prisma.appointment.findFirst({
    where: {
      tenantId,
      professionalId,
      status: { notIn: ['CANCELLED', 'MISSED'] },
      NOT: excludeId ? { id: excludeId } : undefined,
      AND: [
        { startTime: { lt: end } },
        { endTime: { gt: start } },
      ],
    },
    include: { patient: { select: { name: true } } },
  });
  return conflict;
}

// ─── Create appointment ───────────────────────────────────────────────────────

export async function createAppointment(
  _prev: AppointmentFormState | null,
  formData: FormData,
): Promise<AppointmentFormState> {
  const { tenantId, userId } = await requireTenant();

  const raw = Object.fromEntries(formData.entries());
  const parsed = appointmentSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { patientId, professionalId, procedureId, date, startTime, endTime, type, status, notes, sendWhatsApp } = parsed.data;
  const { start, end } = buildDateTimes(date, startTime, endTime);

  if (end <= start) {
    return { success: false, errors: { endTime: ['Horário de término deve ser após o início'] } };
  }

  const conflict = await checkConflict(tenantId, professionalId, start, end);
  if (conflict) {
    return {
      success: false,
      errors: {},
      message: `Conflito com agendamento de ${conflict.patient.name} às ${start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    };
  }

  const appointment = await prisma.appointment.create({
    data: {
      tenantId,
      patientId,
      professionalId,
      procedureId: procedureId || null,
      startTime: start,
      endTime: end,
      status,
      type,
      notes: notes || null,
      createdById: userId,
      updatedById: userId,
    },
  });

  if (sendWhatsApp) {
    // Immediate "created" notice — sent directly so it works without a running
    // worker; the dispatcher persists the WhatsAppMessage row.
    try {
      const { dispatchAppointmentMessage } = await import('@/lib/whatsapp');
      await dispatchAppointmentMessage(appointment.id, 'created');
    } catch {}

    // 24h confirmation reminder — needs scheduling, so it goes through the queue
    // (best-effort: a no-op in dev when Redis/worker are absent).
    try {
      const { appointmentQueue } = await import('@/lib/queue');
      const reminderTime = new Date(start.getTime() - 24 * 60 * 60 * 1000);
      const delay = Math.max(0, reminderTime.getTime() - Date.now());
      if (delay > 0) {
        await appointmentQueue.add(
          'whatsapp-reminder-24h',
          { type: 'whatsapp-reminder-24h', appointmentId: appointment.id, tenantId },
          { delay },
        );
      }
    } catch {}
  }

  revalidatePath('/agenda');
  return { success: true, appointmentId: appointment.id };
}

// ─── Update appointment ───────────────────────────────────────────────────────

export async function updateAppointment(
  id: string,
  _prev: AppointmentFormState | null,
  formData: FormData,
): Promise<AppointmentFormState> {
  const { tenantId, userId } = await requireTenant();

  const raw = Object.fromEntries(formData.entries());
  const parsed = appointmentSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { patientId, professionalId, procedureId, date, startTime, endTime, type, status, notes } = parsed.data;
  const { start, end } = buildDateTimes(date, startTime, endTime);

  if (end <= start) {
    return { success: false, errors: { endTime: ['Horário de término deve ser após o início'] } };
  }

  const conflict = await checkConflict(tenantId, professionalId, start, end, id);
  if (conflict) {
    return {
      success: false,
      errors: {},
      message: `Conflito com agendamento de ${conflict.patient.name}`,
    };
  }

  await prisma.appointment.update({
    where: { id, tenantId },
    data: {
      patientId,
      professionalId,
      procedureId: procedureId || null,
      startTime: start,
      endTime: end,
      status,
      type,
      notes: notes || null,
      updatedById: userId,
    },
  });

  revalidatePath('/agenda');
  return { success: true, appointmentId: id };
}

// ─── Move appointment (drag-and-drop) ────────────────────────────────────────

export async function moveAppointment(
  id: string,
  newStartISO: string,
  newEndISO: string,
  professionalId: string,
) {
  const { tenantId, userId } = await requireTenant();

  const start = new Date(newStartISO);
  const end = new Date(newEndISO);

  const conflict = await checkConflict(tenantId, professionalId, start, end, id);
  if (conflict) {
    return { success: false, message: `Conflito com ${conflict.patient.name}` };
  }

  await prisma.appointment.update({
    where: { id, tenantId },
    data: { startTime: start, endTime: end, professionalId, updatedById: userId },
  });

  revalidatePath('/agenda');
  return { success: true };
}

// ─── Update status ────────────────────────────────────────────────────────────

export async function updateAppointmentStatus(
  id: string,
  status: 'SCHEDULED' | 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED' | 'ATTENDED' | 'MISSED',
  cancelReason?: string,
) {
  const { tenantId, userId } = await requireTenant();

  await prisma.appointment.update({
    where: { id, tenantId },
    data: {
      status,
      cancelReason: status === 'CANCELLED' ? (cancelReason ?? null) : null,
      updatedById: userId,
    },
  });

  revalidatePath('/agenda');
}

// ─── Delete appointment ───────────────────────────────────────────────────────

export async function deleteAppointment(id: string) {
  const { tenantId, userId } = await requireTenant();

  await prisma.appointment.update({
    where: { id, tenantId },
    data: { status: 'CANCELLED', updatedById: userId },
  });

  revalidatePath('/agenda');
}

// ─── Get single appointment ───────────────────────────────────────────────────

export async function getAppointment(id: string) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  return db.appointment.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, name: true, controlNumber: true } },
      professional: { select: { id: true, name: true } },
      procedure: { select: { id: true, name: true, durationMinutes: true, basePrice: true } },
    },
  });
}
