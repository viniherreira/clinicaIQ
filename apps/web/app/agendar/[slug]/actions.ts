'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import { prisma, encrypt, decrypt } from '@clinicaiq/db';
import { addDays, format, parseISO } from 'date-fns';
import {
  clinicNow,
  freeSlots,
  ONLINE_BOOKING_DAILY_CAP,
  ONLINE_BOOKING_PER_PHONE_DAILY,
  readOnlineBooking,
  type OnlineBookingSettings,
} from '@/lib/availability';
import { buildWorkingHoursMap } from '@/lib/working-hours';
import { listUnits } from '@/lib/units';
import { mainUnit } from '@/lib/unit-rules';
import { prepareAppointmentMessage, deliverPrepared, type Preparation } from '@/lib/whatsapp';
import { notifyCrm } from '@/crm/notify';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * O agendamento online, aberto ao público (sem login): o paciente escolhe o
 * profissional, o dia e um horário livre, e deixa nome e WhatsApp.
 *
 * Tudo aqui parte do endereço da clínica (`slug`) e confere de novo no
 * servidor: a clínica precisa ter ligado o agendamento online, o profissional
 * e o procedimento precisam estar liberados e o horário precisa continuar livre.
 */

type Clinic = { id: string; name: string; settings: unknown };

async function clinicBySlug(slug: string): Promise<{ clinic: Clinic; rules: OnlineBookingSettings } | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const clinic = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, settings: true } });
  if (!clinic) return null;
  const rules = readOnlineBooking(clinic.settings);
  return rules.enabled ? { clinic, rules } : null;
}

async function allowedProfessionals(tenantId: string, rules: OnlineBookingSettings) {
  return prisma.professional.findMany({
    where: { tenantId, active: true, ...(rules.professionalIds.length ? { id: { in: rules.professionalIds } } : {}) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, specialty: true, color: true },
  });
}

async function allowedProcedures(tenantId: string, rules: OnlineBookingSettings) {
  if (!rules.procedureIds.length) return [];
  return prisma.procedure.findMany({
    where: { tenantId, active: true, deletedAt: null, id: { in: rules.procedureIds } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, durationMinutes: true },
  });
}

/** As unidades abertas ao público e a principal. */
async function bookingUnits(tenantId: string) {
  const all = await listUnits(tenantId);
  return { ativas: all.filter((u) => u.active), main: mainUnit(all) };
}

/** A unidade pedida, se existe e está ativa. Com uma unidade só, é ela. */
async function unitFor(tenantId: string, unitId: string | null | undefined) {
  const { ativas, main } = await bookingUnits(tenantId);
  const unit = unitId ? ativas.find((u) => u.id === unitId) : ativas.length === 1 ? ativas[0] : undefined;
  return unit && main ? { unit, main } : null;
}

/** O que a página pública mostra: a clínica, quem atende e o que dá para marcar. */
export async function getBookingInfo(slug: string) {
  const found = await clinicBySlug(slug);
  if (!found) return null;
  const { clinic, rules } = found;
  const [professionals, procedures, endereco, { ativas, main }] = await Promise.all([
    allowedProfessionals(clinic.id, rules),
    allowedProcedures(clinic.id, rules),
    prisma.tenant.findUnique({ where: { id: clinic.id }, select: { address: true, phone: true } }),
    bookingUnits(clinic.id),
  ]);
  // Em quais unidades cada um atende: as dos dias do expediente; sem expediente, todas.
  const escalas = await prisma.professionalSchedule.findMany({
    where: { professionalId: { in: professionals.map((p) => p.id) } },
    select: { professionalId: true, unitId: true },
  });
  const ondeAtende = (id: string) => {
    const dias = escalas.filter((e) => e.professionalId === id);
    return dias.length ? [...new Set(dias.map((e) => e.unitId ?? main?.id ?? ''))] : ativas.map((u) => u.id);
  };
  return {
    name: clinic.name,
    address: endereco?.address ?? null,
    phone: endereco?.phone ?? null,
    units: ativas.map((u) => ({ id: u.id, name: u.name, address: u.address })),
    professionals: professionals.map((p) => ({ ...p, unitIds: ondeAtende(p.id) })),
    procedures,
    maxDaysAhead: rules.maxDaysAhead,
    defaultDurationMinutes: rules.defaultDurationMinutes,
  };
}

/** Os horários livres de um profissional num dia, na unidade escolhida. */
export async function getFreeSlots(
  slug: string,
  professionalId: string,
  procedureId: string | null,
  date: string,
  unitId: string | null = null,
): Promise<string[]> {
  const found = await clinicBySlug(slug);
  if (!found || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return slotsFor(found.clinic.id, found.rules, professionalId, procedureId, date, unitId);
}

async function slotsFor(
  tenantId: string,
  rules: OnlineBookingSettings,
  professionalId: string,
  procedureId: string | null,
  date: string,
  unitId: string | null,
): Promise<string[]> {
  const onde = await unitFor(tenantId, unitId);
  if (!onde) return [];
  const profs = await allowedProfessionals(tenantId, rules);
  if (!profs.some((p) => p.id === professionalId)) return [];

  let duracao = rules.defaultDurationMinutes;
  if (procedureId) {
    const procs = await allowedProcedures(tenantId, rules);
    const proc = procs.find((p) => p.id === procedureId);
    if (!proc) return [];
    duracao = proc.durationMinutes || duracao;
  }

  // Dentro da janela: de hoje (com a antecedência mínima) até o limite de dias.
  const agora = clinicNow();
  const limite = format(addDays(parseISO(agora.date), rules.maxDaysAhead), 'yyyy-MM-dd');
  if (date < agora.date || date > limite) return [];
  const antecedencia = rules.minAdvanceHours * 60;
  const notBefore = date === agora.date ? agora.minutes + antecedencia : date === format(addDays(parseISO(agora.date), 1), 'yyyy-MM-dd') ? agora.minutes + antecedencia - 24 * 60 : 0;

  const inicioDia = new Date(`${date}T00:00:00.000Z`);
  const fimDia = new Date(`${date}T23:59:59.999Z`);
  const [map, appts, bloqueios] = await Promise.all([
    // O expediente desta unidade; os horários ocupados valem em todas (a pessoa não está em dois lugares).
    buildWorkingHoursMap(tenantId, [professionalId], {
      unitId: onde.unit.id,
      mainId: onde.main.id,
      businessHours: onde.unit.businessHours,
    }),
    prisma.appointment.findMany({
      where: { tenantId, professionalId, status: { notIn: ['CANCELLED', 'RESCHEDULED'] }, startTime: { lt: fimDia }, endTime: { gt: inicioDia } },
      select: { startTime: true, endTime: true },
    }),
    prisma.blockedSlot.findMany({
      where: { tenantId, professionalId, startTime: { lt: fimDia }, endTime: { gt: inicioDia } },
      select: { startTime: true, endTime: true },
    }),
  ]);
  // Minutos do dia; o que começou antes ou termina depois fica preso às bordas.
  const min = (d: Date) => {
    const dia = d.toISOString().slice(0, 10);
    if (dia < date) return 0;
    if (dia > date) return 24 * 60;
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  const busy: [number, number][] = [...appts, ...bloqueios].map((x) => [min(x.startTime), min(x.endTime)]);
  const semana = map[professionalId] ?? [];
  const day = semana[parseISO(date).getDay()] ?? null;
  return freeSlots({ day, busy, durationMin: duracao, stepMin: rules.stepMinutes, notBeforeMin: notBefore });
}

const bookingSchema = z.object({
  unitId: z.string().nullable().optional(),
  professionalId: z.string().min(1),
  procedureId: z.string().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  name: z.string().trim().min(3, 'Escreva o nome completo.').max(120),
  phone: z.string().trim().refine((v) => /^\d{10,11}$/.test(v.replace(/\D/g, '')), 'WhatsApp com DDD, ex.: (11) 98765-4321.'),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido.')]).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'É preciso concordar com o uso dos dados para agendar.' }) }),
  /** Campo escondido: gente não preenche, robô preenche. */
  website: z.string().max(0).optional(),
});

export type BookingResult = { ok: true; when: string; professional: string } | { ok: false; message: string };

/** Marca o horário. Paciente novo vira cadastro; quem já é paciente (mesmo nome e telefone) é reaproveitado. */
export async function bookOnline(slug: string, input: z.input<typeof bookingSchema>): Promise<BookingResult> {
  // A página é pública e cada envio cria paciente e agendamento. O campo-isca
  // só pega robô burro; sem limite, um script enchia a agenda da clínica de
  // horários falsos (com nomes diferentes, o freio de 2 por pessoa não vale).
  const ip = clientIp(await headers());
  const porMinuto = await rateLimit(`agendar:${ip}`, 5, 60_000);
  const porHora = await rateLimit(`agendar-h:${ip}`, 20, 60 * 60_000);
  if (!porMinuto.ok || !porHora.ok) {
    return { ok: false, message: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' };
  }

  const found = await clinicBySlug(slug);
  if (!found) return { ok: false, message: 'O agendamento online desta clínica não está disponível.' };
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Confira os dados.' };
  const d = parsed.data;
  const { clinic, rules } = found;
  const tenantId = clinic.id;

  // Teto por clínica e por WhatsApp: com IPs variados o limite acima não segura,
  // e cada pedido manda mensagem pelo número da clínica.
  const hoje = await prisma.auditLog.count({
    where: { tenantId, action: 'ONLINE_BOOKING', createdAt: { gte: new Date(Date.now() - 86_400_000) } },
  });
  if (hoje >= ONLINE_BOOKING_DAILY_CAP) {
    return { ok: false, message: 'O agendamento online desta clínica chegou ao limite de hoje. Ligue ou mande mensagem para a clínica.' };
  }
  const porFone = await rateLimit(`agendar-fone:${tenantId}:${d.phone.replace(/\D/g, '')}`, ONLINE_BOOKING_PER_PHONE_DAILY, 86_400_000);
  if (!porFone.ok) {
    return { ok: false, message: 'Este WhatsApp já fez muitos pedidos hoje. Fale direto com a clínica.' };
  }

  const onde = await unitFor(tenantId, d.unitId);
  if (!onde) return { ok: false, message: 'Escolha a unidade.' };
  const livres = await slotsFor(tenantId, rules, d.professionalId, d.procedureId, d.date, onde.unit.id);
  if (!livres.includes(d.time)) return { ok: false, message: 'Esse horário acabou de ser ocupado. Escolha outro.' };

  const procs = d.procedureId ? await allowedProcedures(tenantId, rules) : [];
  const duracao = procs.find((p) => p.id === d.procedureId)?.durationMinutes || rules.defaultDurationMinutes;
  const start = new Date(`${d.date}T${d.time}:00.000Z`);
  const end = new Date(start.getTime() + duracao * 60_000);

  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) return { ok: false, message: 'Não foi possível agendar agora. Tente de novo mais tarde.' };
  const fone = d.phone.replace(/\D/g, '');

  // Mesmo nome e mesmo telefone: é a mesma pessoa.
  const homonimos = await prisma.patient.findMany({
    where: { tenantId, deletedAt: null, name: { equals: d.name, mode: 'insensitive' } },
    select: { id: true, phoneEncrypted: true },
    take: 20,
  });
  let patientId = homonimos.find((p) => {
    try {
      return decrypt(p.phoneEncrypted, key, tenantId).replace(/\D/g, '').endsWith(fone);
    } catch {
      return false;
    }
  })?.id;

  // Freio contra quem marca e não vem: no máximo 2 horários futuros pelo site por pessoa.
  if (patientId) {
    const futuros = await prisma.appointment.count({
      where: { tenantId, patientId, startTime: { gte: new Date(`${clinicNow().date}T00:00:00.000Z`) }, status: { in: ['SCHEDULED', 'CONFIRMED'] }, notes: { startsWith: 'Agendado pelo site' } },
    });
    if (futuros >= 2) return { ok: false, message: 'Você já tem horários marcados. Para mudar, fale com a clínica.' };
  }

  const professional = (await allowedProfessionals(tenantId, rules)).find((p) => p.id === d.professionalId);
  if (!professional) return { ok: false, message: 'Profissional indisponível.' };

  const appointment = await prisma.$transaction(async (tx) => {
    if (!patientId) {
      const ultimo = await tx.patient.findFirst({ where: { tenantId }, orderBy: { controlNumber: 'desc' }, select: { controlNumber: true } });
      const novo = await tx.patient.create({
        data: {
          tenantId,
          controlNumber: (ultimo?.controlNumber ?? 0) + 1,
          name: d.name,
          phoneEncrypted: encrypt(fone, key, tenantId),
          email: d.email || null,
          notes: 'Cadastro feito pelo agendamento online.',
          lgpdConsentAt: new Date(),
        },
        select: { id: true },
      });
      patientId = novo.id;
    }
    // Conferido de novo dentro da transação: dois pacientes no mesmo segundo não ficam com o mesmo horário.
    const choque = await tx.appointment.findFirst({
      where: { tenantId, professionalId: d.professionalId, status: { notIn: ['CANCELLED', 'RESCHEDULED'] }, startTime: { lt: end }, endTime: { gt: start } },
      select: { id: true },
    });
    if (choque) return null;
    return tx.appointment.create({
      data: {
        tenantId,
        unitId: onde.unit.id,
        patientId: patientId!,
        professionalId: d.professionalId,
        procedureId: d.procedureId,
        startTime: start,
        endTime: end,
        status: 'SCHEDULED',
        notes: 'Agendado pelo site.',
      },
      select: { id: true, patientId: true },
    });
  });
  if (!appointment) return { ok: false, message: 'Esse horário acabou de ser ocupado. Escolha outro.' };

  await prisma.auditLog.create({
    data: { tenantId, action: 'ONLINE_BOOKING', entity: 'Appointment', entityId: appointment.id },
  });
  after(() => notifyCrm(tenantId, { type: 'appointment.created', patientId: appointment.patientId, appointmentId: appointment.id }));

  // A confirmação pelo WhatsApp sai como a de um agendamento feito pela recepção.
  let prepared: Preparation | null = null;
  try {
    prepared = await prepareAppointmentMessage(appointment.id, 'created');
  } catch (error) {
    console.error('[agendar] falha ao registrar WhatsApp', appointment.id, error);
  }
  after(async () => {
    try {
      if (prepared?.kind === 'send') await deliverPrepared(prepared.send);
    } catch (error) {
      console.error('[agendar] falha ao enviar WhatsApp', appointment.id, error);
    }
  });

  const quando = `${format(parseISO(d.date), 'dd/MM/yyyy')} às ${d.time}`;
  return { ok: true, when: quando, professional: professional.name };
}
