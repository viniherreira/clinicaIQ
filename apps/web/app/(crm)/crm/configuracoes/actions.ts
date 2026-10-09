'use server';

import { revalidatePath } from 'next/cache';
import { guardCrmAction } from '@/crm/guard';
import * as s from '@/crm/settings';

type Result = { ok: true } | { ok: false; message: string };

async function run(fn: (g: Extract<Awaited<ReturnType<typeof guardCrmAction>>, { ok: true }>) => Promise<Result>): Promise<Result> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const r = await fn(g);
  if (r.ok) {
    revalidatePath('/crm/configuracoes');
    revalidatePath('/crm');
  }
  return r;
}

export const createStageAction = async (name: string, color: string) => run((g) => s.createStage(g.db, g.tenantId, name, color));
export const updateStageAction = async (id: string, patch: { name?: string; color?: string }) => run((g) => s.updateStage(g.db, id, patch));
export const moveStageAction = async (id: string, direction: -1 | 1) => run((g) => s.moveStage(g.db, g.tenantId, id, direction === -1 ? -1 : 1));
export const deleteStageAction = async (id: string, targetId: string | null) => run((g) => s.deleteStage(g.db, g.tenantId, id, targetId));

export const upsertTagAction = async (input: { id?: string; name: string; color: string }) => run((g) => s.upsertTag(g.db, g.tenantId, input));
export const deleteTagAction = async (id: string) => run((g) => s.deleteTag(g.db, g.tenantId, id));

export const upsertLostReasonAction = async (input: { id?: string; name: string }) => run((g) => s.upsertLostReason(g.db, g.tenantId, input));
export const toggleLostReasonAction = async (id: string, active: boolean) => run((g) => s.toggleLostReason(g.db, id, active));
