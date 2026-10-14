'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient, decrypt } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO,
} from 'date-fns';
import { PROFESSIONAL_COLORS } from './_components/constants';
import { buildWorkingHoursMap } from '@/lib/working-hours';
import { getUnitContext } from '@/lib/units';
import { unitAppointmentWhere } from '@/lib/unit-rules';
import { readAgendaRules } from '@/lib/agenda-rules';

/** Regras da agenda da clínica (Configurações → Agenda → Regras da agenda). */
async function agendaRules(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return readAgendaRules(t?.settings);
}
import { capabilityBlocked, hasCapability, writeBlocked } from '@/lib/access';
import { applyAction, type FlowAction } from '@/lib/appointment-flow';
import { isLabelColor } from '@/lib/label-colors';
import { formatPhoneBR } from '@/lib/document-content';
import { normalizeBrazilPhone } from '@/lib/phone';
import { getWhatsAppHealth, prepareAppointmentMessage, deliverPrepared } from '@/lib/whatsapp';
import type { Preparation } from '@/lib/whatsapp';
import { refOutsideTenant, refErrorMessage } from '@/lib/owns';
import { appointmentStatusEvent, notifyCrm } from '@/crm/notify';

// ─── Auth helper ─────────────────────────────────────────────────────────────

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

// ─── Get agenda data ──────────────────────────────────────────────────────────

export async function getAgendaData(dateStr: string, view: 'day' | 'week' | 'month' = 'day') {
  const { tenantId, userId } = await requireTenant();
  const db = getTenantClient(tenantId);
  // A agenda é da unidade escolhida no topo; os bloqueios são do profissional (valem em todas).
  const units = await getUnitContext(tenantId, userId);
  const unit = units.current;

  const date = parseISO(dateStr);
  // O mês mostra as semanas inteiras: começa na segunda antes do dia 1 e vai até o domingo depois do último.
  const from =
    view === 'month'
      ? startOfWeek(startOfMonth(date), { weekStartsOn: 1 })
      : view === 'week'
        ? startOfWeek(date, { weekStartsOn: 1 })
        : startOfDay(date);
  const to =
    view === 'month'
      ? endOfWeek(endOfMonth(date), { weekStartsOn: 1 })
      : view === 'week'
        ? endOfWeek(date, { weekStartsOn: 1 })
        : endOfDay(date);

  const [appointments, blockedSlots, professionals, procedures] = await Promise.all([
    db.appointment.findMany({
      where: { startTime: { gte: from, lte: to }, ...unitAppointmentWhere(unit.id, units.main.id) },
      include: {
        patient: { select: { id: true, name: true } },
        professional: { select: { id: true, name: true, specialty: true } },
        procedure: { select: { id: true, name: true, durationMinutes: true } },
        label: { select: { id: true, name: true, color: true } },
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
  const labels = await db.appointmentLabel.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true },
  });

  // Each professional keeps its own chosen color; fall back to the palette by
  // index for any created before colors existed.
  const professionalsWithColor = professionals.map((p, i) => ({
    ...p,
    // Decimal não atravessa para o navegador.
    commissionPercent: p.commissionPercent != null ? Number(p.commissionPercent) : null,
    color: p.color ?? PROFESSIONAL_COLORS[i % PROFESSIONAL_COLORS.length],
  }));

  // Serialize every Decimal field — Prisma Decimal is not a plain object and
  // can't cross the Server→Client boundary. Procedure has two: basePrice and
  // maxDiscountPercent (null until a discount cap is set on the procedure).
  const serializedProcedures = procedures.map((p) => ({
    ...p,
    basePrice: Number(p.basePrice),
    maxDiscountPercent: p.maxDiscountPercent != null ? Number(p.maxDiscountPercent) : null,
  }));

  const [workingHours, whatsappHealth, rules] = await Promise.all([
    buildWorkingHoursMap(
      tenantId,
      professionals.map((p) => p.id),
      { unitId: unit.id, mainId: units.main.id, businessHours: unit.businessHours },
    ),
    // Surfaced here because this is where appointments are booked: a silently
    // dead WhatsApp means confirmations stop going out, and the clinic would
    // otherwise only notice by visiting the WhatsApp tab.
    getWhatsAppHealth(tenantId),
    agendaRules(tenantId),
  ]);

  // Com várias unidades, a agenda mostra quem atende nesta (algum dia do
  // expediente aqui) ou já tem horário marcado aqui no período.
  const comHorario = new Set(appointments.map((a) => a.professionalId));
  const atendemAqui = units.multi
    ? professionalsWithColor.filter((p) => comHorario.has(p.id) || (workingHours[p.id] ?? []).some(Boolean))
    : professionalsWithColor;
  // Unidade nova, ninguém com dia marcado nela ainda: mostra todos (dá para
  // agendar) e a tela avisa onde dizer quem atende aqui.
  const noneHere = units.multi && atendemAqui.length === 0 && professionalsWithColor.length > 0;
  const daUnidade = noneHere ? professionalsWithColor : atendemAqui;
  // Nesse caso vale o horário de sempre de cada um (senão a grade ficaria toda fechada).
  const horarios = noneHere ? await buildWorkingHoursMap(tenantId, professionals.map((p) => p.id)) : workingHours;

  return {
    appointments,
    blockedSlots,
    professionals: daUnidade,
    unit: { id: unit.id, name: unit.name, multi: units.multi, noneHere },
    rules,
    procedures: serializedProcedures,
    workingHours: horarios,
    whatsappHealth,
    labels,
  };
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

/**
 * O paciente que vem na URL (`/agenda?novo=1&paciente=…`, o "Agendar
 * avaliação" do CRM). Só da própria clínica; qualquer outro id vira null e a
 * agenda abre normalmente.
 */
export async function getPrefillPatient(id: string) {
  const { tenantId } = await requireTenant();
  return getTenantClient(tenantId).patient.findFirst({
    where: { id, deletedAt: null, active: true },
    select: { id: true, name: true, controlNumber: true },
  });
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
    // O profissional não está em duas unidades ao mesmo tempo: confere em todas.
    include: { patient: { select: { name: true } }, unit: { select: { name: true } } },
  });
  return conflict;
}

/** Finds a blocked slot overlapping [start, end) for the professional. */
async function checkBlocked(
  tenantId: string,
  professionalId: string,
  start: Date,
  end: Date,
) {
  return prisma.blockedSlot.findFirst({
    where: {
      tenantId,
      professionalId,
      AND: [{ startTime: { lt: end } }, { endTime: { gt: start } }],
    },
  });
}

// ─── Create appointment ───────────────────────────────────────────────────────

export async function createAppointment(
  _prev: AppointmentFormState | null,
  formData: FormData,
): Promise<AppointmentFormState> {
  const { tenantId, userId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, errors: {}, message: bloqueio };

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

  const foreign = await refOutsideTenant(tenantId, { patientId, professionalId, procedureId });
  if (foreign) {
    return { success: false, errors: {}, message: refErrorMessage(foreign) };
  }

  const conflict = (await agendaRules(tenantId)).allowOverlap ? null : await checkConflict(tenantId, professionalId, start, end);
  if (conflict) {
    return {
      success: false,
      errors: {},
      message: `Conflito com agendamento de ${conflict.patient.name} às ${start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${conflict.unit ? ` (${conflict.unit.name})` : ''}`,
    };
  }

  const blocked = await checkBlocked(tenantId, professionalId, start, end);
  if (blocked) {
    return {
      success: false,
      errors: {},
      message: `Horário bloqueado${blocked.reason ? ` (${blocked.reason})` : ''}. Escolha outro horário.`,
    };
  }

  const { current: unit } = await getUnitContext(tenantId, userId);
  const appointment = await prisma.appointment.create({
    data: {
      tenantId,
      unitId: unit.id,
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

  // Avisa o CRM depois da resposta; ele nunca falha nem atrasa o agendamento.
  after(() => notifyCrm(tenantId, { type: 'appointment.created', patientId, appointmentId: appointment.id }));

  if (sendWhatsApp) {
    // Record the message *before* returning, while we still control the request.
    // `after()` is an optimisation, not a guarantee — if the platform never runs
    // the callback, a booking recorded here is still in the outbox and the
    // gateway sends it within a couple of minutes. Recorded inside `after()`, the
    // same booking would leave no trace and nobody would ever know.
    let prepared: Preparation | null = null;
    try {
      prepared = await prepareAppointmentMessage(appointment.id, 'created');
    } catch (error) {
      console.error('[agenda] falha ao registrar WhatsApp de criacao', appointment.id, error);
    }

    after(async () => {
      // The network call runs after the response is flushed, so a slow WhatsApp
      // never delays saving the appointment.
      try {
        if (prepared?.kind === 'send') await deliverPrepared(prepared.send);
      } catch (error) {
        // The row is already in the outbox; the gateway will pick it up.
        console.error('[agenda] falha ao enviar WhatsApp de criacao', appointment.id, error);
      }

    });
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, errors: {}, message: bloqueio };

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

  const foreign = await refOutsideTenant(tenantId, { patientId, professionalId, procedureId });
  if (foreign) {
    return { success: false, errors: {}, message: refErrorMessage(foreign) };
  }

  const conflict = (await agendaRules(tenantId)).allowOverlap ? null : await checkConflict(tenantId, professionalId, start, end, id);
  if (conflict) {
    return {
      success: false,
      errors: {},
      message: `Conflito com agendamento de ${conflict.patient.name}${conflict.unit ? ` (${conflict.unit.name})` : ''}`,
    };
  }

  const blocked = await checkBlocked(tenantId, professionalId, start, end);
  if (blocked) {
    return {
      success: false,
      errors: {},
      message: `Horário bloqueado${blocked.reason ? ` (${blocked.reason})` : ''}. Escolha outro horário.`,
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

  after(() => notifyCrm(tenantId, { type: appointmentStatusEvent(status), patientId, appointmentId: id }));

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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, message: bloqueio };

  const start = new Date(newStartISO);
  const end = new Date(newEndISO);

  const foreign = await refOutsideTenant(tenantId, { professionalId });
  if (foreign) {
    return { success: false, message: refErrorMessage(foreign) };
  }

  const conflict = (await agendaRules(tenantId)).allowOverlap ? null : await checkConflict(tenantId, professionalId, start, end, id);
  if (conflict) {
    return { success: false, message: `Conflito com ${conflict.patient.name}` };
  }

  const blocked = await checkBlocked(tenantId, professionalId, start, end);
  if (blocked) {
    return { success: false, message: `Horário bloqueado${blocked.reason ? ` (${blocked.reason})` : ''}` };
  }

  const movido = await prisma.appointment.update({
    where: { id, tenantId },
    data: { startTime: start, endTime: end, professionalId, updatedById: userId },
  });
  after(() => notifyCrm(tenantId, { type: 'appointment.rescheduled', patientId: movido.patientId, appointmentId: id }));

  revalidatePath('/agenda');
  return { success: true };
}

// ─── Blocked slots ───────────────────────────────────────────────────────────

const blockSchema = z.object({
  professionalId: z.string().min(1, 'Selecione um profissional'),
  date: z.string().min(1, 'Data obrigatória'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
  reason: z.string().max(120).optional().or(z.literal('')),
});

export interface BlockedSlotDTO {
  id: string;
  startTime: Date;
  endTime: Date;
  reason: string | null;
  professional: { id: string; name: string };
}

export type BlockFormState =
  | { success: true; slot: BlockedSlotDTO }
  | { success: false; message: string };

export async function createBlockedSlot(
  _prev: BlockFormState | null,
  formData: FormData,
): Promise<BlockFormState> {
  const { tenantId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, message: bloqueio };

  const parsed = blockSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { success: false, message: first ?? 'Dados inválidos.' };
  }
  const { professionalId, date, startTime, endTime, reason } = parsed.data;

  const prof = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId },
    select: { id: true },
  });
  if (!prof) return { success: false, message: 'Profissional inválido.' };

  const { start, end } = buildDateTimes(date, startTime, endTime);
  if (end <= start) return { success: false, message: 'O fim deve ser após o início.' };

  const appt = await checkConflict(tenantId, professionalId, start, end);
  if (appt) {
    return {
      success: false,
      message: `Há um agendamento nesse horário (${appt.patient.name}). Cancele-o antes de bloquear.`,
    };
  }

  const slot = await prisma.blockedSlot.create({
    data: { tenantId, professionalId, startTime: start, endTime: end, reason: reason || null },
    include: { professional: { select: { id: true, name: true } } },
  });

  revalidatePath('/agenda');
  // Return the created slot so the client can add it to the grid instantly
  // (optimistic UI) instead of refetching the whole agenda.
  return {
    success: true,
    slot: {
      id: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      reason: slot.reason,
      professional: slot.professional,
    },
  };
}

export async function deleteBlockedSlot(id: string) {
  const { tenantId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return;
  await prisma.blockedSlot.deleteMany({ where: { id, tenantId } });
  revalidatePath('/agenda');
}

// ─── Update status ────────────────────────────────────────────────────────────

export async function updateAppointmentStatus(
  id: string,
  status: 'SCHEDULED' | 'CONFIRMED' | 'RESCHEDULED' | 'CANCELLED' | 'ATTENDED' | 'MISSED',
  cancelReason?: string,
) {
  const { tenantId, userId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return;

  const atualizado = await prisma.appointment.update({
    where: { id, tenantId },
    data: {
      status,
      cancelReason: status === 'CANCELLED' ? (cancelReason ?? null) : null,
      updatedById: userId,
    },
  });
  after(() => notifyCrm(tenantId, { type: appointmentStatusEvent(status), patientId: atualizado.patientId, appointmentId: id }));

  revalidatePath('/agenda');
}

// ─── Cancel appointment (keeps it on the agenda, greyed) ──────────────────────

export async function cancelAppointment(id: string, cancelReason?: string) {
  return updateAppointmentStatus(id, 'CANCELLED', cancelReason);
}

// ─── Delete appointment (removes it entirely) ─────────────────────────────────

/**
 * Hard-deletes an appointment. Any WhatsApp messages sent for it are kept as
 * history but detached (appointmentId → null) so the delete isn't blocked by the
 * foreign key. Tenant-scoped: only the owner's row can be removed.
 */
export async function deleteAppointment(id: string) {
  const { tenantId } = await requireTenant();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false as const, error: 'blocked' as const };

  const appt = await prisma.appointment.findFirst({
    where: { id, tenantId },
    select: { id: true, patientId: true },
  });
  if (!appt) return { success: false as const, error: 'not-found' };

  await prisma.$transaction([
    prisma.whatsAppMessage.updateMany({
      where: { appointmentId: id, tenantId },
      data: { appointmentId: null },
    }),
    prisma.appointment.delete({ where: { id, tenantId } }),
  ]);

  await prisma.auditLog.create({
    data: { tenantId, action: 'APPOINTMENT_DELETED', entity: 'Appointment', entityId: id },
  });
  after(() => notifyCrm(tenantId, { type: 'appointment.cancelled', patientId: appt.patientId, appointmentId: id }));

  revalidatePath('/agenda');
  revalidatePath('/dashboard');
  return { success: true as const };
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

// ─── O dia do atendimento: chegou, em atendimento, atendido ──────────────────

/**
 * Avança o paciente no dia (ver `lib/appointment-flow.ts`). Chegada e início são
 * horas gravadas no agendamento; a situação só muda quando confirma, termina,
 * falta, cancela ou volta para agendado — e aí o CRM é avisado, como sempre.
 */
export async function advanceAppointment(
  id: string,
  action: FlowAction,
  cancelReason?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { tenantId, userId } = await requireTenant();
  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const appt = await prisma.appointment.findFirst({
    where: { id, tenantId },
    select: { id: true, patientId: true, status: true, arrivedAt: true, startedAt: true },
  });
  if (!appt) return { ok: false, message: 'Agendamento não encontrado.' };

  const mudanca = applyAction(appt, action, new Date());
  if (!mudanca) return { ok: false, message: 'Essa ação não cabe agora. Atualize a agenda.' };

  await prisma.appointment.update({
    where: { id, tenantId },
    data: {
      ...mudanca,
      ...(mudanca.status === 'CANCELLED' ? { cancelReason: cancelReason?.trim() || null } : {}),
      ...(mudanca.status && mudanca.status !== 'CANCELLED' ? { cancelReason: null } : {}),
      updatedById: userId,
    },
  });
  if (mudanca.status && mudanca.status !== appt.status) {
    const status = mudanca.status;
    after(() => notifyCrm(tenantId, { type: appointmentStatusEvent(status), patientId: appt.patientId, appointmentId: id }));
  }
  revalidatePath('/agenda');
  revalidatePath('/dashboard');
  return { ok: true };
}

/** Põe ou tira o rótulo de um horário. */
export async function setAppointmentLabel(id: string, labelId: string | null): Promise<{ ok: true } | { ok: false; message: string }> {
  const { tenantId, userId } = await requireTenant();
  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };
  if (labelId) {
    const existe = await prisma.appointmentLabel.findFirst({ where: { id: labelId, tenantId }, select: { id: true } });
    if (!existe) return { ok: false, message: 'Rótulo não encontrado.' };
  }
  const r = await prisma.appointment.updateMany({ where: { id, tenantId }, data: { labelId, updatedById: userId } });
  if (!r.count) return { ok: false, message: 'Agendamento não encontrado.' };
  revalidatePath('/agenda');
  return { ok: true };
}

/**
 * Tudo o que a janela de detalhes mostra, como a do Clínica nas Nuvens: o
 * agendamento, a ficha resumida do paciente, o histórico dele na clínica e,
 * para quem tem o financeiro, quanto está em aberto.
 */
export async function getAppointmentDetail(id: string) {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);
  const appointment = await db.appointment.findFirst({
    where: { id },
    include: {
      patient: { select: { id: true, name: true, controlNumber: true, birthDate: true, phoneEncrypted: true, email: true } },
      professional: { select: { id: true, name: true } },
      procedure: { select: { id: true, name: true, durationMinutes: true, basePrice: true } },
      label: { select: { id: true, name: true, color: true } },
    },
  });
  if (!appointment) return null;

  const key = process.env.ENCRYPTION_MASTER_KEY ?? '';
  let phone = '';
  try {
    phone = decrypt(appointment.patient.phoneEncrypted, key, tenantId);
  } catch {
    phone = '';
  }

  const patientId = appointment.patient.id;
  const [historico, ultimo, veFinanceiro, quem] = await Promise.all([
    db.appointment.findMany({
      where: { patientId, id: { not: id } },
      orderBy: { startTime: 'desc' },
      take: 8,
      select: {
        id: true,
        startTime: true,
        status: true,
        arrivedAt: true,
        startedAt: true,
        professional: { select: { name: true } },
        procedure: { select: { name: true } },
      },
    }),
    db.appointment.findFirst({
      where: { patientId, status: 'ATTENDED', id: { not: id } },
      orderBy: { startTime: 'desc' },
      select: { startTime: true, professional: { select: { name: true } } },
    }),
    hasCapability(tenantId, 'financeiro'),
    db.user.findMany({
      where: { id: { in: [appointment.createdById, appointment.updatedById].filter((x): x is string => Boolean(x)) } },
      select: { id: true, name: true },
    }),
  ]);

  let financeiro: { contracted: number; paid: number; balance: number; lastPayment: { amount: number; paidAt: Date } | null } | null = null;
  if (veFinanceiro) {
    const [aceitos, pagos] = await Promise.all([
      db.quote.findMany({ where: { patientId, status: 'ACCEPTED' }, select: { total: true } }),
      db.payment.findMany({ where: { patientId }, orderBy: { paidAt: 'desc' }, select: { amount: true, paidAt: true } }),
    ]);
    const contracted = aceitos.reduce((s, q) => s + Number(q.total), 0);
    const paid = pagos.reduce((s, p) => s + Number(p.amount), 0);
    financeiro = {
      contracted,
      paid,
      balance: Math.max(0, contracted - paid),
      lastPayment: pagos[0] ? { amount: Number(pagos[0].amount), paidAt: pagos[0].paidAt } : null,
    };
  }

  const nomeDe = (uid: string | null) => quem.find((u) => u.id === uid)?.name ?? null;
  const p = appointment.patient;
  const paciente = { id: p.id, name: p.name, controlNumber: p.controlNumber, birthDate: p.birthDate, email: p.email };
  return {
    appointment: {
      ...appointment,
      patient: { id: paciente.id, name: paciente.name, controlNumber: paciente.controlNumber },
      procedure: appointment.procedure ? { ...appointment.procedure, basePrice: Number(appointment.procedure.basePrice) } : null,
    },
    patient: {
      ...paciente,
      phone: formatPhoneBR(phone) ?? '',
      whatsapp: phone ? normalizeBrazilPhone(phone) : '',
    },
    lastVisit: ultimo ? { at: ultimo.startTime, professional: ultimo.professional.name } : null,
    history: historico,
    financial: financeiro,
    createdBy: nomeDe(appointment.createdById),
    updatedBy: nomeDe(appointment.updatedById),
  };
}

// ─── Rótulos da agenda (Configurações) ───────────────────────────────────────

const labelSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Dê um nome ao rótulo.').max(40, 'Nome de até 40 caracteres.'),
  color: z.string().refine(isLabelColor, 'Cor inválida.'),
});

export async function listAppointmentLabels() {
  const { tenantId } = await requireTenant();
  return getTenantClient(tenantId).appointmentLabel.findMany({
    orderBy: [{ active: 'desc' }, { order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, color: true, active: true, _count: { select: { appointments: true } } },
  });
}

export async function saveAppointmentLabel(input: z.input<typeof labelSchema>): Promise<{ ok: true } | { ok: false; message: string }> {
  const { tenantId } = await requireTenant();
  const bloqueio = (await writeBlocked(tenantId)) ?? (await capabilityBlocked(tenantId, 'configuracoes'));
  if (bloqueio) return { ok: false, message: bloqueio };
  const parsed = labelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const { id, name, color } = parsed.data;
  const igual = await prisma.appointmentLabel.findFirst({ where: { tenantId, name: { equals: name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (igual) return { ok: false, message: 'Já existe um rótulo com esse nome.' };
  if (id) {
    const r = await prisma.appointmentLabel.updateMany({ where: { id, tenantId }, data: { name, color, active: true } });
    if (!r.count) return { ok: false, message: 'Rótulo não encontrado.' };
  } else {
    const ultimo = await prisma.appointmentLabel.findFirst({ where: { tenantId }, orderBy: { order: 'desc' }, select: { order: true } });
    await prisma.appointmentLabel.create({ data: { tenantId, name, color, order: (ultimo?.order ?? 0) + 1 } });
  }
  revalidatePath('/agenda');
  revalidatePath('/configuracoes');
  return { ok: true };
}

/** Rótulo em uso só é desligado (os horários antigos guardam a cor); sem uso, some. */
export async function deleteAppointmentLabel(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { tenantId } = await requireTenant();
  const bloqueio = (await writeBlocked(tenantId)) ?? (await capabilityBlocked(tenantId, 'configuracoes'));
  if (bloqueio) return { ok: false, message: bloqueio };
  const usos = await prisma.appointment.count({ where: { tenantId, labelId: id } });
  if (usos) await prisma.appointmentLabel.updateMany({ where: { id, tenantId }, data: { active: false } });
  else await prisma.appointmentLabel.deleteMany({ where: { id, tenantId } });
  revalidatePath('/agenda');
  revalidatePath('/configuracoes');
  return { ok: true };
}
