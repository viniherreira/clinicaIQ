'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@clinicaiq/db';
import { guardCrmAction } from '@/crm/guard';
import { distributeUnassigned, savePrefs, saveDistribution, transferPortfolio, updateMember } from '@/crm/team';
import { CRM_ROLES } from '@/lib/crm-roles';

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const refresh = () => {
  revalidatePath('/crm/configuracoes');
  revalidatePath('/crm', 'layout');
};

/** "Disponível / Ausente" de quem está usando: a chave do topo do CRM. */
export async function setMyAvailabilityAction(available: boolean): Promise<Result> {
  // Não é gravar dado de paciente: vale até para clínica com a fatura em atraso.
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return g;
  await prisma.user.updateMany({ where: { id: g.userId, tenantId: g.tenantId }, data: { crmAvailable: Boolean(available) } });
  refresh();
  return { ok: true };
}

const nivel = z.enum(['none', 'own', 'all']);
const rightsSchema = z.object({
  leads: z.object({ create: nivel, view: nivel, edit: nivel, delete: nivel, export: nivel }),
  tasks: z.object({ edit: nivel }),
  config: z.boolean(),
});

const memberSchema = z.object({
  crmRole: z.enum(CRM_ROLES as [string, ...string[]]).optional(),
  rights: rightsSchema.optional(),
  receivesLeads: z.boolean().optional(),
  available: z.boolean().optional(),
});

export async function updateMemberAction(userId: string, patch: z.input<typeof memberSchema>): Promise<Result> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const p = memberSchema.safeParse(patch);
  if (!p.success || typeof userId !== 'string') return { ok: false, message: 'Dados inválidos.' };
  const r = await updateMember(g.tenantId, g.userId, userId, p.data as Parameters<typeof updateMember>[3]);
  if (r.ok) refresh();
  return r;
}

const distributionSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['rotation', 'load']),
  onlyAvailable: z.boolean(),
});

export async function saveDistributionAction(input: z.input<typeof distributionSchema>): Promise<Result> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const p = distributionSchema.safeParse(input);
  if (!p.success) return { ok: false, message: 'Dados inválidos.' };
  await saveDistribution(g.tenantId, p.data);
  await prisma.auditLog.create({
    data: { tenantId: g.tenantId, userId: g.userId, action: 'CRM_DISTRIBUTION_UPDATED', entity: 'Tenant', entityId: g.tenantId, metadata: p.data },
  });
  refresh();
  return { ok: true };
}

export async function distributeUnassignedAction(): Promise<Result<{ count: number }>> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const count = await distributeUnassigned(g.tenantId, g.userId);
  refresh();
  return { ok: true, count };
}

export async function transferPortfolioAction(fromUserId: string, to: string): Promise<Result<{ leads: number; conversations: number }>> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  if (typeof fromUserId !== 'string' || typeof to !== 'string' || !to) return { ok: false, message: 'Escolha para quem passar.' };
  const r = await transferPortfolio(g.tenantId, g.userId, fromUserId, to);
  if (r.ok) {
    await prisma.auditLog.create({
      data: {
        tenantId: g.tenantId,
        userId: g.userId,
        action: 'CRM_PORTFOLIO_TRANSFERRED',
        entity: 'User',
        entityId: fromUserId,
        metadata: { to, leads: r.leads, conversations: r.conversations },
      },
    });
    refresh();
  }
  return r;
}

const prefsSchema = z.object({ autoLead: z.boolean(), reuseClosedLead: z.boolean(), senderName: z.boolean() });

/** Configurações › Geral e Conversas. */
export async function savePrefsAction(input: z.input<typeof prefsSchema>): Promise<Result> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const p = prefsSchema.safeParse(input);
  if (!p.success) return { ok: false, message: 'Dados inválidos.' };
  await savePrefs(g.tenantId, p.data);
  await prisma.auditLog.create({
    data: { tenantId: g.tenantId, userId: g.userId, action: 'CRM_PREFS_UPDATED', entity: 'Tenant', entityId: g.tenantId, metadata: p.data },
  });
  refresh();
  return { ok: true };
}
