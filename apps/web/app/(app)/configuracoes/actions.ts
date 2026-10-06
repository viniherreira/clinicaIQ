'use server';

import { cache } from 'react';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PROFESSIONAL_PALETTE } from './_components/constants';
import { capabilityBlocked, writeBlocked } from '@/lib/access';
import { can, isRole, type Role } from '@/lib/permissions';
import { podeRemover } from '@/lib/team';
import { composeAddress } from '@/lib/address';
import { documentError, formatDocument, onlyDigits } from '@/lib/document';
import { contractTitle, DEFAULT_QUOTE_TERMS } from '@/lib/document-content';
import { loadClinicInfo } from '@/lib/documents';
import { valorPorExtenso } from '@/lib/extenso';
import { describePayment } from '@/lib/payment-terms';
import { deleteObject, signObject, storageEnabled, uploadObject } from '@/lib/storage';
import { instantDateBR, instantDateLongBR, instantDateTimeBR } from '@/lib/tz';
import type { ContractDocumentProps, QuoteDocumentProps, ReceiptDocumentProps } from '@clinicaiq/pdf';
import {
  buildAppointmentConfirmationBody,
  buildAppointmentCreatedBody,
  buildBirthdayBody,
} from '@clinicaiq/whatsapp';

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
    where: { users: { some: { clerkUserId: userId, active: true } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');

  const user = await prisma.user.findFirst({
    where: { clerkUserId: userId, tenantId: tenant.id, active: true },
    select: { id: true, role: true },
  });

  if (!user) redirect('/sign-in');


  return { tenantId: tenant.id, userId: user.id, role: user.role };
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
  registration: z.string().trim().max(40).optional().or(z.literal('')),
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

  // O documento sai impresso no contrato e no recibo que o paciente usa no
  // Imposto de Renda. Um CNPJ com dígito errado ali invalida o comprovante.
  if (d.document && onlyDigits(d.document)) {
    const problema = documentError(d.document);
    if (problema) return { success: false, errors: { document: [problema] } };
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: d.name,
      phone: d.phone || null,
      email: d.email || null,
      document: d.document && onlyDigits(d.document) ? formatDocument(d.document) : null,
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
      registration: true,
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

  const semAcesso = await capabilityBlocked(tenantId, 'equipe');
  if (semAcesso) return { success: false, errors: {}, message: semAcesso };
  const parsed = professionalSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const { name, specialty, registration, color } = parsed.data;

  const professional = await prisma.professional.create({
    data: { tenantId, name, specialty: specialty || null, registration: registration || null, color },
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

  const semAcesso = await capabilityBlocked(tenantId, 'equipe');
  if (semAcesso) return { success: false, errors: {}, message: semAcesso };
  const parsed = professionalSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }
  const { name, specialty, registration, color } = parsed.data;

  await prisma.professional.update({
    where: { id, tenantId },
    data: { name, specialty: specialty || null, registration: registration || null, color },
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

  const semAcesso = await capabilityBlocked(tenantId, 'equipe');
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

  const semAcesso = await capabilityBlocked(tenantId, 'equipe');
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

  const semAcesso = await capabilityBlocked(tenantId, 'equipe');
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
  /** Quando o acesso foi encerrado. Nulo enquanto a pessoa está na equipe. */
  deactivatedAt: Date | null;
  /** Quem está olhando a tela. Não dá para rebaixar ou remover a si mesmo. */
  isSelf: boolean;
}

export async function listTeam(): Promise<TeamMember[]> {
  const { tenantId, userId, role } = await requireOwner();
  // Toda função marcada 'use server' é um endereço que dá para chamar de fora,
  // não só um dado que a página busca. Esconder a aba não esconde isto.
  if (!can(role, 'equipe')) return [];
  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      deactivatedAt: true,
    },
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

  const semAcesso = await capabilityBlocked(tenantId, 'equipe');
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

const removeSchema = z
  .object({
    targetUserId: z.string().min(1, 'Usuário inválido.').max(60),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

/**
 * Tira alguém da equipe.
 *
 * Remoção é lógica, nunca física: quem sai criou agendamento, evolução e
 * orçamento, e essas linhas apontam para `users.id`. Apagar levaria a autoria
 * junto — e prontuário sem autor não serve nem para a clínica nem para uma
 * fiscalização.
 *
 * ## Clerk e Postgres não compartilham transação
 *
 * A ordem é deliberada: primeiro o Clerk, depois o nosso banco.
 *
 * - Se o Clerk falhar, nada mudou aqui. O admin tenta de novo e a operação
 *   inteira se repete sem efeito colateral.
 * - Se o nosso banco falhar depois do Clerk, a pessoa já está deslogada e sem
 *   convite pendente, mas continua aparecendo como ativa. O admin vê que não
 *   saiu e clica de novo; a segunda passada completa.
 *
 * Nenhum dos dois estados intermediários concede acesso a mais ninguém — a
 * falha sempre erra para o lado de menos acesso, não de mais. É por isso que a
 * ordem é essa e não a inversa.
 *
 * Idempotente: remover duas vezes devolve sucesso na segunda, sem erro.
 */
export async function removeTeamMember(input: {
  targetUserId: string;
  reason?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId, role } = await requireOwner();

  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { targetUserId, reason } = parsed.data;

  const semAcesso = await capabilityBlocked(tenantId, 'equipe');
  if (semAcesso) return { ok: false, message: semAcesso };

  const equipe = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, name: true, role: true, active: true, clerkUserId: true, email: true },
  });

  // Já saiu numa tentativa anterior que morreu no meio: completar em silêncio é
  // melhor do que devolver erro para quem está só repetindo o clique.
  const alvo = equipe.find((m) => m.id === targetUserId);
  if (alvo && !alvo.active) {
    revalidatePath('/configuracoes');
    return { ok: true };
  }

  const veredito = podeRemover({
    atorId: userId,
    atorRole: role,
    alvoId: targetUserId,
    equipe: equipe.map((m) => ({ id: m.id, nome: m.name, role: m.role, ativo: m.active })),
  });
  if (!veredito.ok) return { ok: false, message: veredito.motivo };
  if (!alvo) return { ok: false, message: 'Pessoa não encontrada nesta clínica.' };

  const email = alvo.email.toLowerCase();

  // ─── Clerk primeiro ────────────────────────────────────────────────────────
  try {
    const clerk = await clerkClient();

    // 1. Convites pendentes deste e-mail. Um convite vivo deixaria a pessoa
    //    reentrar sozinha depois de removida.
    const pendentes = await prisma.invitation.findMany({
      where: { tenantId, email, status: 'PENDING' },
      select: { id: true, clerkInvitationId: true },
    });
    for (const convite of pendentes) {
      if (!convite.clerkInvitationId) continue;
      await clerk.invitations.revokeInvitation(convite.clerkInvitationId).catch(() => {
        // Já aceito ou já revogado lá. Marcar do nosso lado ainda basta.
      });
    }

    // 2. Sessões abertas. Sem isto o acesso só morreria quando o token
    //    expirasse — "removido" que continua trabalhando por horas.
    if (alvo.clerkUserId) {
      const sessoes = await clerk.sessions.getSessionList({ userId: alvo.clerkUserId });
      for (const sessao of sessoes.data) {
        if (sessao.status !== 'active') continue;
        await clerk.sessions.revokeSession(sessao.id).catch(() => undefined);
      }
    }
  } catch (error) {
    console.error('[equipe] Clerk falhou ao remover', error);
    return {
      ok: false,
      message: 'Não foi possível encerrar o acesso agora. Tente de novo — nada foi alterado.',
    };
  }

  // ─── Nosso banco depois ────────────────────────────────────────────────────
  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: {
        active: false,
        deactivatedAt: new Date(),
        deactivatedById: userId,
        deactivationReason: reason || null,
        // Liberar a conta do Clerk é o que permite reconvidar este e-mail
        // depois: `clerkUserId` é único no banco inteiro.
        clerkUserId: null,
        previousClerkUserId: alvo.clerkUserId,
      },
    }),
    prisma.invitation.updateMany({
      where: { tenantId, email, status: 'PENDING' },
      data: { status: 'REVOKED' },
    }),
    prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: `USER_REMOVED_${alvo.role}`,
        entity: 'User',
        entityId: targetUserId,
        metadata: reason ? { motivo: reason } : undefined,
      },
    }),
  ]);

  revalidatePath('/configuracoes');
  return { ok: true };
}

// ─── Privacidade ───────────────────────────────────────────────────────────────

export interface PrivacySummary {
  pacientes: number;
  aceitaramTratamento: number;
  autorizaramCampanha: number;
  excluidosMasNoBanco: number;
}

export async function getPrivacySummary(): Promise<PrivacySummary> {
  const { tenantId, role } = await requireOwner();
  if (!can(role, 'privacidade')) {
    return { pacientes: 0, aceitaramTratamento: 0, autorizaramCampanha: 0, excluidosMasNoBanco: 0 };
  }
  const [pacientes, aceitaramTratamento, autorizaramCampanha, excluidos] =
    await Promise.all([
      prisma.patient.count({ where: { tenantId, deletedAt: null } }),
      prisma.patient.count({ where: { tenantId, deletedAt: null, lgpdConsentAt: { not: null } } }),
      prisma.patient.count({
        where: { tenantId, deletedAt: null, marketingConsentAt: { not: null } },
      }),
      prisma.patient.count({ where: { tenantId, deletedAt: { not: null } } }),
    ]);
  return {
    pacientes,
    aceitaramTratamento,
    autorizaramCampanha,
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
  const { tenantId, role } = await requireOwner();
  // O registro diz quem fez o quê e quando. É a última coisa que alguém deveria
  // conseguir ler — ou apagar — sem responder pela clínica.
  if (!can(role, 'privacidade')) return [];
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

// ─── Convites ──────────────────────────────────────────────────────────────────

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  /**
   * Preenchido quando o convite nunca vai poder ser aceito. Sem isto a tela
   * dizia "aguardando resposta" para sempre, e ninguém tinha como descobrir que
   * o problema não era a pessoa ter esquecido de abrir o e-mail.
   */
  bloqueio: string | null;
}

/** O motivo, escrito uma vez só, porque aparece ao convidar e ao listar. */
const CONTA_EM_OUTRA_CLINICA =
  'Este e-mail já tem uma conta ClinicaIQ em outra clínica. Cada conta pertence a uma clínica só — convide a pessoa por outro e-mail.';

/**
 * E-mails desta lista que já têm conta em outra clínica.
 *
 * `users.clerkUserId` é único no banco inteiro: uma conta pertence a uma clínica
 * e só. Quem já tem conta em outro lugar aceita o convite, entra, e cai na
 * clínica antiga — o vínculo novo é impossível de criar.
 */
async function emailsPresosEmOutraClinica(
  tenantId: string,
  emails: string[],
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const contas = await prisma.user.findMany({
    // Só conta quem está *ativo* em outra clínica. Quem foi removido de lá
    // liberou a conta do Clerk ao sair e pode perfeitamente entrar aqui.
    where: { email: { in: emails, mode: 'insensitive' }, active: true, NOT: { tenantId } },
    select: { email: true },
  });
  return new Set(contas.map((u) => u.email.toLowerCase()));
}

export async function listInvites(): Promise<PendingInvite[]> {
  const { tenantId, role } = await requireOwner();
  if (!can(role, 'equipe')) return [];
  const rows = await prisma.invitation.findMany({
    where: { tenantId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  const presos = await emailsPresosEmOutraClinica(
    tenantId,
    rows.map((r) => r.email),
  );

  return rows.map((r) => ({
    ...r,
    role: r.role as Role,
    bloqueio: presos.has(r.email.toLowerCase()) ? CONTA_EM_OUTRA_CLINICA : null,
  }));
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(160),
  role: z.string().refine(isRole, 'Perfil inválido'),
});

/**
 * Convida alguém para esta clínica.
 *
 * Quem manda o e-mail é o Clerk (`notify: true`) — não temos provedor de e-mail
 * e não precisamos de um. A pessoa recebe o link, se cadastra e **define a
 * própria senha**; nós nunca vemos nem guardamos senha nenhuma.
 *
 * O convite fica gravado dos dois lados de propósito. O `publicMetadata` leva a
 * clínica e o perfil até o usuário novo, mas o vínculo não depende disso: no
 * onboarding procuramos um convite pendente pelo e-mail que o Clerk já
 * verificou. Se o metadata não vier, o convite ainda vale.
 */
export async function inviteTeamMember(input: {
  email: string;
  role: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'equipe');
  if (semAcesso) return { ok: false, message: semAcesso };

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { email, role } = parsed.data;

  // Já está na equipe agora? Convidar de novo criaria uma segunda conta para a
  // mesma pessoa, e ela entraria sem o histórico que já tem.
  //
  // Quem foi *removido* é outro caso: convidar de novo é justamente o jeito de
  // trazer a pessoa de volta. A linha antiga continua no banco por causa da
  // autoria, e é ela que será reativada quando o convite for aceito.
  const jaAtivo = await prisma.user.findFirst({
    where: { tenantId, active: true, email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (jaAtivo) {
    return { ok: false, message: 'Esta pessoa já faz parte da equipe.' };
  }

  // Recusar aqui é melhor do que mandar um convite que não tem como dar certo:
  // a pessoa receberia o e-mail, aceitaria, cairia na clínica antiga dela, e o
  // convite ficaria "aguardando resposta" sem ninguém entender o motivo.
  //
  // Isto revela a quem administra uma clínica que um e-mail já está cadastrado
  // no ClinicaIQ. É informação de menos para valer a pena esconder, e o silêncio
  // custava caro demais.
  const presos = await emailsPresosEmOutraClinica(tenantId, [email]);
  if (presos.size > 0) {
    return { ok: false, message: CONTA_EM_OUTRA_CLINICA };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://clinica-iq-web.vercel.app';

  let clerkInvitationId: string | null = null;
  try {
    const clerk = await clerkClient();

    // Reenviar tem que matar o link anterior. Dois convites válidos para o mesmo
    // e-mail significam que um link que a clínica acha revogado continua
    // abrindo a porta.
    const anterior = await prisma.invitation.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: { clerkInvitationId: true, status: true },
    });
    if (anterior?.status === 'PENDING' && anterior.clerkInvitationId) {
      await clerk.invitations.revokeInvitation(anterior.clerkInvitationId).catch(() => undefined);
    }

    const invite = await clerk.invitations.createInvitation({
      emailAddress: email,
      // Reconvidar depois de um convite expirado não pode virar erro.
      ignoreExisting: true,
      notify: true,
      publicMetadata: { tenantId, role },
      redirectUrl: `${appUrl}/sign-up`,
    });
    clerkInvitationId = invite.id;
  } catch (error) {
    // Sem o e-mail do Clerk o convite não chega a lugar nenhum. Falhar aqui é
    // melhor do que gravar um convite que ninguém vai receber.
    console.error('[convite] Clerk recusou', error);
    return {
      ok: false,
      message: 'Não foi possível enviar o convite agora. Confira o e-mail e tente de novo.',
    };
  }

  await prisma.invitation.upsert({
    where: { tenantId_email: { tenantId, email } },
    create: { tenantId, email, role, clerkInvitationId, invitedById: userId },
    update: {
      role,
      clerkInvitationId,
      status: 'PENDING',
      invitedById: userId,
      createdAt: new Date(),
      acceptedAt: null,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: `INVITE_${role}`, entity: 'Invitation', entityId: email },
  });

  revalidatePath('/configuracoes');
  return { ok: true };
}

export async function revokeInvite(id: string): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const semAcesso = await capabilityBlocked(tenantId, 'equipe');
  if (semAcesso) return { ok: false, message: semAcesso };

  const convite = await prisma.invitation.findFirst({
    where: { id, tenantId, status: 'PENDING' },
    select: { id: true, email: true, clerkInvitationId: true },
  });
  if (!convite) return { ok: false, message: 'Convite não encontrado.' };

  if (convite.clerkInvitationId) {
    try {
      const clerk = await clerkClient();
      await clerk.invitations.revokeInvitation(convite.clerkInvitationId);
    } catch {
      // Já aceito ou já revogado no Clerk. Marcar do nosso lado ainda impede
      // que o onboarding aceite este convite.
    }
  }

  await prisma.invitation.update({ where: { id: convite.id }, data: { status: 'REVOKED' } });
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'INVITE_REVOKED',
      entity: 'Invitation',
      entityId: convite.email,
    },
  });

  revalidatePath('/configuracoes');
  return { ok: true };
}

// ─── Mensagens automáticas ─────────────────────────────────────────────────────

export interface MessageSettings {
  notifyOnCreate: boolean;
  notifyReminder: boolean;
  notifyBirthday: boolean;
  /** Nulo = a clínica nunca editou e usa o texto padrão do sistema. */
  createdMessage: string | null;
  reminderMessage: string | null;
  birthdayMessage: string | null;
  /** Os padrões, para mostrar como ponto de partida na tela. */
  defaults: { created: string; reminder: string; birthday: string };
}

/**
 * O que a clínica manda hoje, e os textos padrão ao lado.
 *
 * Os padrões viajam junto de propósito: editar tem que ser mudar uma frase, não
 * escrever do zero numa caixa vazia. A tela pré-preenche com eles.
 */
export async function getMessageSettings(): Promise<MessageSettings> {
  const { tenantId } = await requireOwner();
  const [session, tenant] = await Promise.all([
    prisma.whatsAppSession.findUnique({
      where: { tenantId },
      select: {
        notifyOnCreate: true,
        notifyReminder: true,
        notifyBirthday: true,
        createdMessage: true,
        reminderMessage: true,
        birthdayMessage: true,
      },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  // Exemplo com dados fictícios só para a clínica ver o formato.
  const exemplo = {
    patientName: 'Maria Aparecida',
    clinicName: tenant?.name ?? 'sua clínica',
    professionalName: 'Dra. Michele',
    procedureName: 'Limpeza',
    dateLabel: 'quinta-feira, 28/05',
    timeLabel: '14:30',
  };

  return {
    notifyOnCreate: session?.notifyOnCreate ?? true,
    notifyReminder: session?.notifyReminder ?? true,
    notifyBirthday: session?.notifyBirthday ?? false,
    createdMessage: session?.createdMessage ?? null,
    reminderMessage: session?.reminderMessage ?? null,
    birthdayMessage: session?.birthdayMessage ?? null,
    defaults: {
      created: buildAppointmentCreatedBody(exemplo),
      reminder: buildAppointmentConfirmationBody(exemplo),
      birthday: buildBirthdayBody({
        patientName: exemplo.patientName,
        clinicName: exemplo.clinicName,
      }),
    },
  };
}

const messagesSchema = z.object({
  notifyOnCreate: z.boolean(),
  notifyReminder: z.boolean(),
  notifyBirthday: z.boolean(),
  createdMessage: z.string().trim().max(900),
  reminderMessage: z.string().trim().max(900),
  birthdayMessage: z.string().trim().max(600),
});

export async function saveMessageSettings(
  input: z.infer<typeof messagesSchema>,
): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false, message: semAcesso };

  const parsed = messagesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const d = parsed.data;

  // Vazio volta a ser nulo, não string vazia: nulo quer dizer "usa o padrão", e
  // string vazia mandaria mensagem em branco para o paciente.
  const existe = await prisma.whatsAppSession.findUnique({
    where: { tenantId },
    select: { tenantId: true },
  });
  if (!existe) {
    return {
      ok: false,
      message: 'Conecte o WhatsApp da clínica antes de configurar as mensagens.',
    };
  }

  await prisma.whatsAppSession.update({
    where: { tenantId },
    data: {
      notifyOnCreate: d.notifyOnCreate,
      notifyReminder: d.notifyReminder,
      notifyBirthday: d.notifyBirthday,
      createdMessage: d.createdMessage || null,
      reminderMessage: d.reminderMessage || null,
      birthdayMessage: d.birthdayMessage || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'UPDATE',
      entity: 'WhatsAppSession',
      entityId: tenantId,
    },
  });

  revalidatePath('/configuracoes');
  revalidatePath('/whatsapp');
  return { ok: true };
}

/**
 * Registra, de uma vez, que os pacientes já autorizaram receber campanha.
 *
 * Existe como botão e não como script porque quem declara isso é o responsável
 * pela clínica, não nós: a ação fica no registro de auditoria com o nome de quem
 * clicou, a data e quantos pacientes foram marcados. Se alguém perguntar depois
 * de onde veio esse aceite, o registro responde.
 *
 * Quem pediu SAIR fica de fora. Um "todos aceitaram" não desfaz uma recusa que o
 * paciente escreveu com as próprias mãos.
 */
export async function declararAceiteDeCampanhaParaTodos(): Promise<{
  ok: boolean;
  marcados?: number;
  message?: string;
}> {
  const { tenantId, userId } = await requireOwner();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'privacidade');
  if (semAcesso) return { ok: false, message: semAcesso };

  const { count } = await prisma.patient.updateMany({
    where: {
      tenantId,
      deletedAt: null,
      marketingConsentAt: null,
      whatsappOptOut: false,
    },
    data: { marketingConsentAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: `MARKETING_CONSENT_DECLARADO_EM_BLOCO_${count}`,
      entity: 'Patient',
      // A ação é da clínica inteira, não de um paciente — o alvo é o tenant.
      entityId: tenantId,
    },
  });

  revalidatePath('/configuracoes');
  revalidatePath('/campanhas');
  return { ok: true, marcados: count };
}

// ─── Documentos (orçamento, contrato, recibo) ─────────────────────────────────

export interface DocumentSettings {
  technicalResponsible: string;
  technicalRegistration: string;
  /** Vazio = usa o texto padrão. */
  quoteTerms: string;
  contractTerms: string;
  /** Link assinado e curto para pré-visualizar. Nulo sem logotipo. */
  logoPreviewUrl: string | null;
  /** Sem storage configurado, o upload é desativado com explicação. */
  storageReady: boolean;
  defaultQuoteTerms: string;
  /** O que já está pronto e o que falta para os papéis saírem completos. */
  checklist: { label: string; ok: boolean; href: string }[];
}

export async function getDocumentSettings(): Promise<DocumentSettings> {
  const { tenantId } = await requireOwner();
  const t = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      document: true,
      address: true,
      city: true,
      phone: true,
      logoUrl: true,
      technicalResponsible: true,
      technicalRegistration: true,
      quoteTerms: true,
      contractTerms: true,
    },
  });

  const storageReady = storageEnabled();
  const logoPreviewUrl = t.logoUrl && storageReady ? await signObject(t.logoUrl, 600).catch(() => null) : null;

  return {
    technicalResponsible: t.technicalResponsible ?? '',
    technicalRegistration: t.technicalRegistration ?? '',
    quoteTerms: t.quoteTerms ?? '',
    contractTerms: t.contractTerms ?? '',
    logoPreviewUrl,
    storageReady,
    defaultQuoteTerms: DEFAULT_QUOTE_TERMS,
    checklist: [
      { label: 'CNPJ ou CPF da clínica', ok: Boolean(t.document), href: '#clinica' },
      { label: 'Endereço com cidade', ok: Boolean(t.address && t.city), href: '#clinica' },
      { label: 'Telefone', ok: Boolean(t.phone), href: '#clinica' },
      { label: 'Responsável técnico e registro', ok: Boolean(t.technicalResponsible && t.technicalRegistration), href: '#documentos' },
      { label: 'Logotipo', ok: Boolean(t.logoUrl), href: '#documentos' },
    ],
  };
}

const documentSettingsSchema = z.object({
  technicalResponsible: z.string().trim().max(120),
  technicalRegistration: z.string().trim().max(40),
  quoteTerms: z.string().trim().max(2000, 'Condições gerais: no máximo 2.000 caracteres.'),
  contractTerms: z.string().trim().max(4000, 'Cláusulas adicionais: no máximo 4.000 caracteres.'),
});

export async function saveDocumentSettings(
  input: z.infer<typeof documentSettingsSchema>,
): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false, message: semAcesso };

  const parsed = documentSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const d = parsed.data;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      technicalResponsible: d.technicalResponsible || null,
      technicalRegistration: d.technicalRegistration || null,
      // Igual ao padrão é o mesmo que não ter escrito nada: guardar nulo faz a
      // clínica receber as melhorias futuras do texto padrão.
      quoteTerms: d.quoteTerms && d.quoteTerms !== DEFAULT_QUOTE_TERMS ? d.quoteTerms : null,
      contractTerms: d.contractTerms || null,
    },
  });

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'UPDATE_DOCUMENTS', entity: 'Tenant', entityId: tenantId },
  });

  revalidatePath('/configuracoes');
  return { ok: true };
}

const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const LOGO_MAX_BYTES = 1024 * 1024;

/**
 * Troca o logotipo dos documentos.
 *
 * Só PNG e JPEG: é o que o gerador de PDF sabe desenhar. Um nome novo a cada
 * envio, para nenhum cache servir o logotipo antigo, e o anterior é apagado
 * depois que o novo já está gravado — nunca o contrário.
 */
export async function uploadClinicLogo(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const bloqueio = await writeBlocked(tenantId);
  if (bloqueio) return { ok: false, message: bloqueio };

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false, message: semAcesso };

  if (!storageEnabled()) {
    return { ok: false, message: 'O armazenamento de arquivos ainda não foi configurado.' };
  }

  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Selecione uma imagem.' };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { ok: false, message: 'Use uma imagem PNG ou JPG.' };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, message: 'Imagem muito grande (máx. 1 MB).' };

  const anterior = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { logoUrl: true } });
  const path = `${tenantId}/_clinica/logo-${crypto.randomUUID()}.${ext}`;

  try {
    await uploadObject(path, file);
  } catch {
    return { ok: false, message: 'Não foi possível enviar a imagem. Tente de novo.' };
  }

  await prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: path } });
  if (anterior?.logoUrl) await deleteObject(anterior.logoUrl).catch(() => undefined);

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'UPDATE_LOGO', entity: 'Tenant', entityId: tenantId },
  });

  revalidatePath('/configuracoes');
  return { ok: true };
}

export async function removeClinicLogo(): Promise<{ ok: boolean; message?: string }> {
  const { tenantId, userId } = await requireOwner();

  const semAcesso = await capabilityBlocked(tenantId, 'configuracoes');
  if (semAcesso) return { ok: false, message: semAcesso };

  const atual = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { logoUrl: true } });
  if (!atual?.logoUrl) return { ok: true };

  await prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: null } });
  if (storageEnabled()) await deleteObject(atual.logoUrl).catch(() => undefined);

  await prisma.auditLog.create({
    data: { tenantId, userId, action: 'REMOVE_LOGO', entity: 'Tenant', entityId: tenantId },
  });

  revalidatePath('/configuracoes');
  return { ok: true };
}

export type SampleDocument =
  | { kind: 'orcamento'; props: QuoteDocumentProps }
  | { kind: 'contrato'; props: ContractDocumentProps }
  | { kind: 'recibo'; props: ReceiptDocumentProps };

/**
 * Os três documentos com os dados reais da clínica e um paciente fictício.
 *
 * Existe para a clínica ver o efeito do logotipo e do responsável técnico antes
 * de mandar o primeiro papel para um paciente de verdade — sem precisar criar
 * um orçamento de mentira que depois fica na lista e na numeração.
 */
export async function getSampleDocument(kind: string): Promise<SampleDocument | null> {
  const { tenantId } = await requireOwner();
  const clinic = await loadClinicInfo(tenantId);
  const terms = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { quoteTerms: true, contractTerms: true },
  });

  const now = new Date();
  const items = [
    { name: 'Restauração em resina composta', description: 'Dentes 16 e 26', quantity: 2, unitPrice: 280, discountPercent: 0, total: 560 },
    { name: 'Tratamento de canal (endodontia)', description: 'Dente 36', quantity: 1, unitPrice: 1200, discountPercent: 0, total: 1200 },
    { name: 'Limpeza e profilaxia', quantity: 1, unitPrice: 250, discountPercent: 0, total: 250 },
  ];
  const subtotal = 2010;
  const total = 1909.5;
  const payment = describePayment({ total, downPayment: 500, installments: 3, method: 'CARTAO_CREDITO' });
  const patient = {
    name: 'Paciente de Exemplo',
    document: '123.456.789-09',
    phone: '(11) 90000-0000',
  };
  const professional = clinic.technicalResponsible
    ? { name: clinic.technicalResponsible, registration: clinic.technicalRegistration }
    : undefined;

  if (kind === 'orcamento') {
    return {
      kind,
      props: {
        clinic,
        patient: { ...patient, controlNumber: 1 },
        professional,
        quote: {
          code: 'ORC-EXEMPLO',
          issuedAt: instantDateBR(now),
          validUntil: instantDateBR(new Date(now.getTime() + 30 * 86_400_000)),
          items,
          subtotal,
          discountAmount: subtotal - total,
          discountLabel: '5%',
          total,
          payment,
          notes: 'Exemplo de observação: tratamento previsto em 3 sessões.',
          terms: terms?.quoteTerms?.trim() || DEFAULT_QUOTE_TERMS,
          generatedAt: instantDateTimeBR(now),
        },
      },
    };
  }

  if (kind === 'contrato') {
    return {
      kind,
      props: {
        clinic,
        patient: {
          ...patient,
          maritalStatus: 'casado(a)',
          profession: 'professor(a)',
          birthDate: '15/05/1985',
          address: 'Rua de Exemplo, 100 · Centro · São Paulo/SP · CEP 01000-000',
          isMinor: false,
        },
        professional,
        contract: {
          code: 'CTR-EXEMPLO',
          quoteCode: 'ORC-EXEMPLO',
          title: contractTitle(clinic.technicalRegistration),
          items,
          subtotal,
          discountAmount: subtotal - total,
          discountLabel: '5%',
          total,
          totalText: valorPorExtenso(total),
          payment,
          extraTerms: terms?.contractTerms ?? undefined,
          dateLong: instantDateLongBR(now),
          issuedAt: instantDateBR(now),
          generatedAt: instantDateTimeBR(now),
        },
      },
    };
  }

  if (kind === 'recibo') {
    return {
      kind,
      props: {
        clinic,
        signer: professional,
        receipt: {
          number: 'REC-EXEMPLO',
          payer: { name: patient.name, document: patient.document },
          amount: 500,
          amountText: valorPorExtenso(500),
          method: 'PIX',
          paidAt: instantDateBR(now),
          paidAtLong: instantDateLongBR(now),
          reference: `${/\bCRO\b/i.test(clinic.technicalRegistration ?? '') ? 'tratamento odontológico' : 'serviços prestados'} — Orçamento ORC-EXEMPLO`,
          services: items.map((it) => (it.description ? `${it.name} (${it.description})` : it.name)),
          generatedAt: instantDateTimeBR(now),
        },
      },
    };
  }

  return null;
}
