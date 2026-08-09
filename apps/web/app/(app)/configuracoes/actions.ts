'use server';

import { cache } from 'react';
import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PROFESSIONAL_PALETTE } from './_components/constants';
import { capabilityBlocked, writeBlocked } from '@/lib/access';
import { can, isRole, type Role } from '@/lib/permissions';
import { composeAddress } from '@/lib/address';

// ─── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Em cache por requisição.
 *
 * A tela de configurações passou a montar seis abas de uma vez, e cada busca
 * chamava isto de novo — duas consultas cada, catorze só para descobrir de quem
 * é a clínica. `cache` do React resolve na primeira e devolve a mesma promessa
 * para as outras.
 */
const resolveOwner = cache(async () => {
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
});

async function requireOwner() {
  return resolveOwner();
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

const opcional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

const clinicSchema = z.object({
  name: z.string().trim().min(2, 'Nome da clínica obrigatório').max(120),
  phone: opcional(20),
  email: z.string().trim().email('E-mail inválido').max(120).optional().or(z.literal('')),
  document: opcional(20),
  zipCode: opcional(9),
  street: opcional(120),
  addressNumber: opcional(12),
  complement: opcional(60),
  neighborhood: opcional(80),
  city: opcional(80),
  state: opcional(2),
});

// ─── Clinic data ─────────────────────────────────────────────────────────────

export async function getClinic() {
  const { tenantId } = await requireOwner();
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      document: true,
      zipCode: true,
      street: true,
      addressNumber: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      logoUrl: true,
    },
  });
}

export async function updateClinic(
  _prev: ClinicFormState | null,
  formData: FormData,
): Promise<ClinicFormState> {
  const { tenantId, userId } = await requireOwner();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, errors: {}, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { success: false, errors: {}, message: semAcesso };
  const parsed = clinicSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: d.name,
      phone: d.phone || null,
      email: d.email || null,
      document: d.document || null,
      zipCode: d.zipCode || null,
      street: d.street || null,
      addressNumber: d.addressNumber || null,
      complement: d.complement || null,
      neighborhood: d.neighborhood || null,
      city: d.city || null,
      state: d.state ? d.state.toUpperCase() : null,
      address: composeAddress(d),
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, errors: {}, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { success: false, errors: {}, message: semAcesso };
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { success: false, errors: {}, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { success: false, errors: {}, message: semAcesso };
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return;

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return;
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false };
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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false, message: semAcesso };

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

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false, message: semAcesso };

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

// ─── Equipe ────────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date;
  /** Quem está olhando a tela. Não dá para rebaixar ou desativar a si mesmo. */
  isSelf: boolean;
}

export async function listTeam(): Promise<TeamMember[]> {
  const { tenantId, userId } = await requireOwner();
  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });
  return users.map((u) => ({ ...u, role: u.role as Role, isSelf: u.id === userId }));
}

/**
 * Troca o papel de alguém da equipe.
 *
 * Duas travas que existem para a clínica não se trancar para fora: ninguém muda
 * o próprio papel, e a última pessoa com acesso às configurações não pode
 * perdê-lo. Sem a segunda, um dono que se rebaixasse a recepcionista deixaria a
 * clínica sem ninguém capaz de desfazer — e não existe tela de suporte para
 * resolver isso depois.
 */
export async function updateTeamRole(
  targetUserId: string,
  role: string,
): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false, message: semAcesso };

  if (!isRole(role)) return { ok: false, message: 'Perfil inválido.' };
  if (targetUserId === userId) {
    return { ok: false, message: 'Você não pode alterar o seu próprio perfil.' };
  }

  const alvo = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId },
    select: { id: true, role: true },
  });
  if (!alvo) return { ok: false, message: 'Usuário não encontrado.' };

  if (can(alvo.role, 'configuracoes') && !can(role, 'configuracoes')) {
    const restantes = await prisma.user.count({
      where: { tenantId, active: true, role: { in: ['OWNER', 'ADMIN'] }, NOT: { id: targetUserId } },
    });
    if (restantes === 0) {
      return { ok: false, message: 'A clínica ficaria sem ninguém com acesso às configurações.' };
    }
  }

  await prisma.user.update({ where: { id: targetUserId }, data: { role } });
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: `ROLE_${alvo.role}_TO_${role}`,
      entity: 'User',
      entityId: targetUserId,
    },
  });

  revalidatePath('/configuracoes');
  return { ok: true };
}

/** Tira o acesso sem apagar o histórico: o nome dele continua nas evoluções. */
export async function setTeamMemberActive(
  targetUserId: string,
  active: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false, message: semAcesso };

  if (targetUserId === userId) {
    return { ok: false, message: 'Você não pode desativar o seu próprio acesso.' };
  }

  const alvo = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId },
    select: { id: true, role: true },
  });
  if (!alvo) return { ok: false, message: 'Usuário não encontrado.' };

  if (!active && can(alvo.role, 'configuracoes')) {
    const restantes = await prisma.user.count({
      where: { tenantId, active: true, role: { in: ['OWNER', 'ADMIN'] }, NOT: { id: targetUserId } },
    });
    if (restantes === 0) {
      return { ok: false, message: 'A clínica ficaria sem ninguém com acesso às configurações.' };
    }
  }

  await prisma.user.update({ where: { id: targetUserId }, data: { active } });
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE',
      entity: 'User',
      entityId: targetUserId,
    },
  });

  revalidatePath('/configuracoes');
  return { ok: true };
}

// ─── Privacidade ───────────────────────────────────────────────────────────────

export interface PrivacySummary {
  pacientes: number;
  aceitaramTratamento: number;
  autorizaramCampanha: number;
  pediramSair: number;
  excluidosMasNoBanco: number;
}

export async function getPrivacySummary(): Promise<PrivacySummary> {
  const { tenantId } = await requireOwner();
  const [pacientes, aceitaramTratamento, autorizaramCampanha, pediramSair, excluidos] =
    await Promise.all([
      prisma.patient.count({ where: { tenantId, deletedAt: null } }),
      prisma.patient.count({ where: { tenantId, deletedAt: null, lgpdConsentAt: { not: null } } }),
      prisma.patient.count({
        where: { tenantId, deletedAt: null, marketingConsentAt: { not: null } },
      }),
      prisma.patient.count({ where: { tenantId, deletedAt: null, whatsappOptOut: true } }),
      prisma.patient.count({ where: { tenantId, deletedAt: { not: null } } }),
    ]);
  return {
    pacientes,
    aceitaramTratamento,
    autorizaramCampanha,
    pediramSair,
    excluidosMasNoBanco: excluidos,
  };
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: Date;
  userName: string | null;
}

/**
 * Últimas ações registradas. Existe porque 700 linhas de auditoria estavam sendo
 * gravadas e nenhuma tela as mostrava — auditoria que ninguém consegue ler não
 * serve nem para a clínica nem para uma eventual fiscalização.
 */
export async function listAudit(limit = 50): Promise<AuditEntry[]> {
  const { tenantId } = await requireOwner();
  const rows = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    createdAt: r.createdAt,
    userName: r.user?.name ?? null,
  }));
}
