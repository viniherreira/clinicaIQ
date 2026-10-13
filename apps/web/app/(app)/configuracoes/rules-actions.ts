'use server';

import { revalidatePath } from 'next/cache';
import { prisma, type Prisma } from '@clinicaiq/db';
import { capabilityBlocked, writeBlocked } from '@/lib/access';
import { readAgendaRules, type AgendaRules } from '@/lib/agenda-rules';
import { currentAccess } from '@/lib/guard';
import { cleanReceiptMethods, readReceiptMethods } from '@/lib/payment-methods';

/**
 * Regras da agenda e formas de recebimento (Configurações → Agenda e
 * Financeiro). Ficam em `Tenant.settings`, junto do horário e do agendamento online.
 */

type Result = { ok: true } | { ok: false; message: string };

async function settingsOf(tenantId: string): Promise<Record<string, unknown>> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return (t?.settings ?? {}) as Record<string, unknown>;
}

async function save(patch: Record<string, unknown>, action: string): Promise<Result> {
  const acesso = await currentAccess();
  if (!acesso) return { ok: false, message: 'Entre de novo.' };
  const bloqueio = (await writeBlocked(acesso.tenantId)) ?? (await capabilityBlocked(acesso.tenantId, 'configuracoes'));
  if (bloqueio) return { ok: false, message: bloqueio };
  const atual = await settingsOf(acesso.tenantId);
  await prisma.tenant.update({
    where: { id: acesso.tenantId },
    data: { settings: JSON.parse(JSON.stringify({ ...atual, ...patch })) as Prisma.InputJsonValue },
  });
  await prisma.auditLog.create({ data: { tenantId: acesso.tenantId, userId: acesso.userId, action, entity: 'Tenant', entityId: acesso.tenantId } });
  revalidatePath('/configuracoes');
  revalidatePath('/agenda');
  return { ok: true };
}

export async function getClinicRules(): Promise<{ agenda: AgendaRules; paymentMethods: string[] }> {
  const acesso = await currentAccess();
  const s = acesso ? await settingsOf(acesso.tenantId) : {};
  return { agenda: readAgendaRules(s), paymentMethods: readReceiptMethods(s) };
}

export async function updateAgendaRules(input: AgendaRules): Promise<Result> {
  // Passa pelo mesmo leitor: o que não fizer sentido volta ao padrão em vez de quebrar a agenda.
  const regras = readAgendaRules({ agenda: input });
  if (input.endHour <= input.startHour) return { ok: false, message: 'A agenda precisa terminar depois de começar.' };
  return save({ agenda: regras }, 'UPDATE_AGENDA_RULES');
}

export async function updateReceiptMethods(methods: string[]): Promise<Result> {
  const lista = cleanReceiptMethods(methods);
  if (lista.length === 0) return { ok: false, message: 'Deixe pelo menos uma forma de recebimento.' };
  return save({ paymentMethods: lista }, 'UPDATE_PAYMENT_METHODS');
}
