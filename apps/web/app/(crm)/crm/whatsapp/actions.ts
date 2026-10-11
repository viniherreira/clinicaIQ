'use server';

import { revalidatePath } from 'next/cache';
import { guardCrmAction } from '@/crm/guard';
import * as admin from '@/crm/cloud-admin';

type Result = { ok: true } | { ok: false; message: string };

async function run(fn: (g: { tenantId: string; userId: string }) => Promise<Result>): Promise<Result> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const r = await fn(g);
  if (r.ok) {
    revalidatePath('/crm/whatsapp');
    revalidatePath('/crm/conversas');
  }
  return r;
}

export const connectManualAction = async (input: { token: string; phoneNumberId: string; wabaId: string }) =>
  run((g) => admin.connectManual(g.tenantId, g.userId, input));

export const finishSignupAction = async (input: { code: string; wabaId: string; phoneNumberId: string; coexistence: boolean }) =>
  run((g) => admin.finishEmbeddedSignup(g.tenantId, g.userId, input));

export const disconnectCloudAction = async () => run((g) => admin.disconnectCloud(g.tenantId, g.userId));

export const checkCloudAction = async () => run((g) => admin.checkCloud(g.tenantId));

export const syncTemplatesAction = async () => run((g) => admin.syncTemplates(g.tenantId));

export const createTemplateAction = async (input: { name: string; category: 'MARKETING' | 'UTILITY'; body: string; examples: string[] }) =>
  run((g) => admin.createTemplate(g.tenantId, input));
