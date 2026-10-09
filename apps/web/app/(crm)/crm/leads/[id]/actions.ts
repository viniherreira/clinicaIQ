'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@clinicaiq/db';
import { guardCrmAction } from '@/crm/guard';
import { addNote, linkPatient, setTags, updateLead } from '@/crm/leads';
import { findPatientByPhone } from '@/crm/duplicates';
import { completeTask, createTask } from '@/crm/tasks';
import { clinicLocalToInstant } from '@/crm/clock';
import { CRM_COLORS } from '@/crm/defaults';
import { decryptPhone, isValidPhone } from '@/crm/phone';
import type { BoardTag } from '@/crm/types';

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

function refresh(leadId: string) {
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath('/crm');
}

const patchSchema = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  name: z.string().trim().min(2, 'Escreva o nome.').max(120).optional(),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido.')]).nullable().optional(),
  phone: z.string().trim().refine(isValidPhone, 'Telefone com DDD.').optional(),
  source: z.enum(['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO']).optional(),
  interestProcedureId: z.string().nullable().optional(),
  estimatedValue: z.number().nonnegative().max(10_000_000).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
});

export async function updateLeadAction(leadId: string, input: z.input<typeof patchSchema>): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const { estimatedValue, ...rest } = parsed.data;

  if (rest.interestProcedureId && !(await g.db.procedure.findFirst({ where: { id: rest.interestProcedureId }, select: { id: true } }))) {
    return { ok: false, message: 'Procedimento não encontrado.' };
  }
  if (rest.assignedToId && !(await g.db.user.findFirst({ where: { id: rest.assignedToId, active: true }, select: { id: true } }))) {
    return { ok: false, message: 'Responsável não encontrado.' };
  }

  const r = await updateLead(g.db, g, leadId, {
    ...rest,
    email: rest.email === '' ? null : rest.email,
    ...(estimatedValue !== undefined ? { estimatedValueCents: estimatedValue === null ? null : Math.round(estimatedValue * 100) } : {}),
  });
  if (r.ok) refresh(leadId);
  return r;
}

export async function setLeadTagsAction(leadId: string, tagIds: string[]): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const r = await setTags(g.db, g, leadId, tagIds.slice(0, 30));
  if (r.ok) refresh(leadId);
  return r;
}

/** Cria a tag na hora, a partir da ficha. Se o nome já existe, devolve a existente. */
export async function createTagAction(name: string): Promise<Result<{ tag: BoardTag }>> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const nome = name.trim().toLowerCase().slice(0, 30);
  if (!nome) return { ok: false, message: 'Escreva o nome da tag.' };

  const existente = await g.db.leadTag.findFirst({ where: { name: nome } });
  if (existente) return { ok: true, tag: { id: existente.id, name: existente.name, color: existente.color } };

  const total = await g.db.leadTag.count();
  const tag = await g.db.leadTag.create({
    data: { tenantId: g.tenantId, name: nome, color: CRM_COLORS[(total + 1) % CRM_COLORS.length] },
  });
  revalidatePath('/crm');
  return { ok: true, tag: { id: tag.id, name: tag.name, color: tag.color } };
}

export async function addNoteAction(leadId: string, text: string): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const t = text.trim();
  if (!t) return { ok: false, message: 'Escreva a nota.' };
  const r = await addNote(g.db, g, leadId, t.slice(0, 2000));
  if (r.ok) refresh(leadId);
  return r;
}

export async function createTaskAction(
  leadId: string,
  input: { text: string; due: string; assignedToId?: string | null },
): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const dueAt = clinicLocalToInstant(input.due);
  if (!dueAt) return { ok: false, message: 'Escolha a data e a hora.' };
  const r = await createTask(g.db, g, leadId, { text: input.text.slice(0, 300), dueAt, assignedToId: input.assignedToId });
  if (r.ok) refresh(leadId);
  return r.ok ? { ok: true } : r;
}

export async function completeTaskAction(taskId: string, leadId: string): Promise<Result> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const r = await completeTask(g.db, g, taskId);
  if (r.ok) {
    refresh(leadId);
    revalidatePath('/crm/tarefas');
  }
  return r;
}

/**
 * Mostra o telefone inteiro. Fica registrado no histórico de auditoria da
 * clínica: telefone é dado pessoal (LGPD), e ver o número completo é um acesso.
 */
export async function revealPhoneAction(leadId: string): Promise<Result<{ phone: string }>> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  const lead = await g.db.lead.findFirst({ where: { id: leadId, deletedAt: null }, select: { id: true, phoneEncrypted: true } });
  if (!lead) return { ok: false, message: 'Lead não encontrado.' };

  await prisma.auditLog.create({
    data: { tenantId: g.tenantId, userId: g.userId, action: 'LEAD_PHONE_VIEWED', entity: 'Lead', entityId: lead.id },
  });
  return { ok: true, phone: decryptPhone(lead.phoneEncrypted, g.tenantId) };
}

// ─── Conversão em paciente ───────────────────────────────────────────────────

export type ConvertIntent = 'ficha' | 'agendar';

const destinoDepois = (leadId: string, patientId: string, intent: ConvertIntent) =>
  intent === 'agendar' ? `/agenda?novo=1&paciente=${patientId}` : `/crm/leads/${leadId}`;

/** Antes de cadastrar: já existe paciente com o telefone deste lead? */
export async function findPatientMatchAction(
  leadId: string,
): Promise<Result<{ match: { id: string; name: string; controlNumber: number } | null }>> {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  const lead = await g.db.lead.findFirst({ where: { id: leadId, deletedAt: null }, select: { phoneEncrypted: true } });
  if (!lead) return { ok: false, message: 'Lead não encontrado.' };
  const match = await findPatientByPhone(g.db, g.tenantId, decryptPhone(lead.phoneEncrypted, g.tenantId));
  return { ok: true, match };
}

/** Liga o lead a um paciente que já existe. Devolve para onde seguir. */
export async function linkExistingPatientAction(
  leadId: string,
  patientId: string,
  intent: ConvertIntent,
): Promise<Result<{ href: string }>> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const r = await linkPatient(g.db, g, leadId, patientId, 'linked');
  if (!r.ok) return r;
  refresh(leadId);
  return { ok: true, href: destinoDepois(leadId, patientId, intent) };
}

/**
 * Passada ao formulário de paciente (`afterCreate`): roda logo depois do
 * cadastro, liga o lead à ficha nova e diz para onde ir. Se a ligação falhar,
 * o paciente já existe — segue para a ficha dele, e o lead pode ser vinculado
 * depois pela própria ficha do lead.
 */
export async function linkAfterCreateAction(leadId: string, intent: ConvertIntent, patientId: string): Promise<string> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return `/pacientes/${patientId}`;
  const r = await linkPatient(g.db, g, leadId, patientId, 'converted');
  if (!r.ok) return `/pacientes/${patientId}`;
  refresh(leadId);
  return destinoDepois(leadId, patientId, intent);
}
