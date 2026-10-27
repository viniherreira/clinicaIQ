'use server';

import { revalidatePath } from 'next/cache';
import { guardCrmAction } from '@/crm/guard';
import * as s from '@/crm/settings';
import { deleteAutomation, saveAutomation, toggleAutomation } from '@/crm/stage-automations';
import type { AutomationAction } from '@clinicaiq/db';
import type { AgendaRole } from '@/crm/defaults';
import { deleteBot, toggleBot } from '@/crm/bot-admin';
import { moveField, saveField, type FieldInput } from '@/crm/lead-fields';
import { deleteCaptureRule, saveCaptureRule, toggleCaptureRule, type CaptureRuleInput } from '@/crm/capture';

type Result = { ok: true } | { ok: false; message: string };

async function run(fn: (g: Extract<Awaited<ReturnType<typeof guardCrmAction>>, { ok: true }>) => Promise<Result>): Promise<Result> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const r = await fn(g);
  if (r.ok) {
    revalidatePath('/crm/configuracoes');
    revalidatePath('/crm');
    revalidatePath('/crm/automacoes', 'layout');
  }
  return r;
}

export const createStageAction = async (name: string, color: string, pipelineId?: string) =>
  run((g) => s.createStage(g.db, g.tenantId, name, color, pipelineId));
export const renamePipelineAction = async (id: string, name: string) => run((g) => s.renamePipeline(g.db, id, name));
export const deletePipelineAction = async (id: string, targetId: string) => run((g) => s.deletePipeline(g.db, g.tenantId, id, targetId));
export const updateStageAction = async (id: string, patch: { name?: string; color?: string }) => run((g) => s.updateStage(g.db, id, patch));
export const moveStageAction = async (id: string, direction: -1 | 1) => run((g) => s.moveStage(g.db, g.tenantId, id, direction === -1 ? -1 : 1));
export const deleteStageAction = async (id: string, targetId: string | null) => run((g) => s.deleteStage(g.db, g.tenantId, id, targetId));
export const setAgendaStageAction = async (role: AgendaRole, stageId: string | null) => run((g) => s.setAgendaStage(g.db, g.tenantId, role, stageId));

export const upsertTagAction = async (input: { id?: string; name: string; color: string }) => run((g) => s.upsertTag(g.db, g.tenantId, input));
export const deleteTagAction = async (id: string) => run((g) => s.deleteTag(g.db, g.tenantId, id));

export const upsertLostReasonAction = async (input: { id?: string; name: string }) => run((g) => s.upsertLostReason(g.db, g.tenantId, input));
export const toggleLostReasonAction = async (id: string, active: boolean) => run((g) => s.toggleLostReason(g.db, id, active));

export const upsertQuickReplyAction = async (input: { id?: string; title: string; body: string }) =>
  run((g) => s.upsertQuickReply(g.db, g.tenantId, input));
export const deleteQuickReplyAction = async (id: string) => run((g) => s.deleteQuickReply(g.db, id));

export const saveAutomationAction = async (input: {
  id?: string;
  stageId: string;
  action: AutomationAction;
  config: Record<string, unknown>;
  delayMinutes: number;
}) => run((g) => saveAutomation(g.db, g.tenantId, input));
export const toggleAutomationAction = async (id: string, active: boolean) => run((g) => toggleAutomation(g.db, id, active));
export const deleteAutomationAction = async (id: string) => run((g) => deleteAutomation(g.db, id));

// Salvar robô: `saveFlowAction` (automacoes/bots/actions.ts), no editor em quadro.
export const toggleBotAction = async (id: string, active: boolean) => run((g) => toggleBot(g.db, id, active));
export const deleteBotAction = async (id: string) => run((g) => deleteBot(g.db, id));

export async function createPipelineAction(name: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const r = await s.createPipeline(g.db, g.tenantId, name);
  if (r.ok) revalidatePath('/crm');
  return r;
}

export const saveCaptureRuleAction = async (input: CaptureRuleInput) => run((g) => saveCaptureRule(g.db, g.tenantId, input));
export const toggleCaptureRuleAction = async (id: string, active: boolean) => run((g) => toggleCaptureRule(g.db, id, active));
export const deleteCaptureRuleAction = async (id: string) => run((g) => deleteCaptureRule(g.db, id));

export const saveFieldAction = async (input: FieldInput) => run((g) => saveField(g.db, g.tenantId, input));
export const moveFieldAction = async (id: string, direction: -1 | 1) => run((g) => moveField(g.db, id, direction === -1 ? -1 : 1));
