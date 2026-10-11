'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guardCrmAction } from '@/crm/guard';
import { createLead, moveLead, softDeleteLead } from '@/crm/leads';
import { findOpenLeadByPhone, findPatientByPhone } from '@/crm/duplicates';
import { isValidPhone } from '@/crm/phone';
import { runDueAutomations } from '@/crm/stage-automations';

export type ActionResult = { ok: true } | { ok: false; message: string };

export type CreateLeadResult =
  | { ok: true; leadId: string; linkedPatient: string | null }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }
  | { ok: false; duplicate: { leadId: string; name: string } };

const SOURCES = ['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO'] as const;

const newLeadSchema = z.object({
  name: z.string().trim().min(2, 'Escreva o nome.').max(120),
  phone: z.string().trim().refine(isValidPhone, 'Telefone com DDD, por exemplo (11) 98765-4321.'),
  title: z.string().trim().max(120).optional().nullable(),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido.')]).optional().nullable(),
  source: z.enum(SOURCES).optional(),
  interestProcedureId: z.string().optional().nullable(),
  estimatedValue: z.number().nonnegative().max(10_000_000).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  stageId: z.string().optional().nullable(),
  /** Criar mesmo havendo um lead aberto com o mesmo telefone. */
  force: z.boolean().optional(),
});

export type NewLeadForm = z.input<typeof newLeadSchema>;

export async function createLeadAction(input: NewLeadForm): Promise<CreateLeadResult> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return { ok: false, message: g.message };

  const parsed = newLeadSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? '']),
    );
    return { ok: false, message: 'Confira os campos destacados.', fieldErrors };
  }
  const d = parsed.data;

  // Ids que vêm da tela precisam ser desta clínica.
  const [procedimento, responsavel] = await Promise.all([
    d.interestProcedureId ? g.db.procedure.findFirst({ where: { id: d.interestProcedureId }, select: { id: true } }) : null,
    d.assignedToId ? g.db.user.findFirst({ where: { id: d.assignedToId, active: true }, select: { id: true } }) : null,
  ]);
  if (d.interestProcedureId && !procedimento) return { ok: false, message: 'Procedimento não encontrado.' };
  if (d.assignedToId && !responsavel) return { ok: false, message: 'Responsável não encontrado.' };

  if (!d.force) {
    const dup = await findOpenLeadByPhone(g.db, g.tenantId, d.phone);
    if (dup) return { ok: false, duplicate: { leadId: dup.id, name: dup.name } };
  }

  // Telefone de paciente: o lead já nasce ligado à ficha.
  const paciente = await findPatientByPhone(g.db, g.tenantId, d.phone);

  const r = await createLead(g.db, g, {
    name: paciente?.name ?? d.name,
    phone: d.phone,
    title: d.title,
    email: d.email || null,
    source: d.source,
    interestProcedureId: d.interestProcedureId || null,
    estimatedValueCents: d.estimatedValue != null ? Math.round(d.estimatedValue * 100) : null,
    assignedToId: d.assignedToId === undefined ? g.userId : d.assignedToId || null,
    patientId: paciente?.id ?? null,
    stageId: d.stageId || null,
  });
  if (!r.ok) return r;

  revalidatePath('/crm');
  after(() => runDueAutomations(new Date(), { tenantId: g.tenantId }));
  return { ok: true, leadId: r.leadId, linkedPatient: paciente?.name ?? null };
}

const moveSchema = z.object({
  leadId: z.string().min(1),
  stageId: z.string().min(1),
  index: z.number().int().min(0).max(10_000).optional(),
  lostReasonId: z.string().optional().nullable(),
});

export async function moveLeadAction(input: z.input<typeof moveSchema>): Promise<ActionResult> {
  const g = await guardCrmAction('crm');
  if (!g.ok) return g;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Movimento inválido.' };

  const r = await moveLead(g.db, g, parsed.data.leadId, parsed.data);
  if (r.ok) {
    revalidatePath('/crm');
    // Automações "na hora" da etapa nova saem já, sem esperar o relógio.
    after(() => runDueAutomations(new Date(), { tenantId: g.tenantId }));
  }
  return r;
}

export async function deleteLeadAction(leadId: string): Promise<ActionResult> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const r = await softDeleteLead(g.db, g, leadId);
  if (r.ok) revalidatePath('/crm');
  return r;
}
