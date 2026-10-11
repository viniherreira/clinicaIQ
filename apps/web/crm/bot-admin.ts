import type { ChatbotTrigger, Prisma, TenantPrismaClient } from '@clinicaiq/db';
import { normalize, parseSteps, stepsProblem, type BotSteps } from './bot-engine';

/** Cadastro dos robôs. Quem chama já passou por `guardCrmAction('crm_config')`. */

type Result = { ok: true } | { ok: false; message: string };

export interface BotInput {
  id?: string;
  name: string;
  trigger: ChatbotTrigger;
  keywords: string[];
  steps: unknown;
  active: boolean;
}

/** Palavras-chave limpas: sem repetir, sem só números (que são as opções dos menus). */
export function cleanKeywords(raw: string[]): string[] {
  const out = new Set<string>();
  for (const k of raw) {
    const t = normalize(k);
    if (t && !/^\d+$/.test(t) && t.length <= 30) out.add(t);
  }
  return [...out].slice(0, 10);
}

export async function saveBot(db: TenantPrismaClient, tenantId: string, input: BotInput): Promise<Result> {
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, message: 'Dê um nome ao robô.' };
  const steps = parseSteps(input.steps);
  if (!steps) return { ok: false, message: 'O robô precisa de um menu inicial.' };
  const problem = stepsProblem(steps);
  if (problem) return { ok: false, message: problem };
  const keywords = input.trigger === 'KEYWORD' ? cleanKeywords(input.keywords) : [];
  if (input.trigger === 'KEYWORD' && keywords.length === 0) return { ok: false, message: 'Escreva pelo menos uma palavra-chave (ex.: menu).' };

  // O que as ações apontam precisa ser desta clínica.
  const refs = refsOf(steps);
  const [tags, stages, users] = await Promise.all([
    refs.tags.length ? db.leadTag.count({ where: { id: { in: refs.tags } } }) : 0,
    refs.stages.length ? db.pipelineStage.count({ where: { id: { in: refs.stages } } }) : 0,
    refs.users.length ? db.user.count({ where: { id: { in: refs.users }, active: true } }) : 0,
  ]);
  if (tags !== refs.tags.length || stages !== refs.stages.length || users !== refs.users.length) {
    return { ok: false, message: 'Uma ação aponta para tag, etapa ou pessoa que não existe mais.' };
  }

  // Só um robô de "contato novo" ligado por vez: dois responderiam juntos.
  if (input.active && input.trigger === 'NEW_CONTACT') {
    const outro = await db.chatbotFlow.findFirst({ where: { active: true, trigger: 'NEW_CONTACT', ...(input.id ? { id: { not: input.id } } : {}) } });
    if (outro) return { ok: false, message: `Já existe um robô de contato novo ligado (${outro.name}). Desligue aquele primeiro.` };
  }

  const data = { name, trigger: input.trigger, keywords, steps: steps as unknown as Prisma.InputJsonValue, active: input.active };
  if (input.id) {
    const r = await db.chatbotFlow.updateMany({ where: { id: input.id }, data });
    return r.count ? { ok: true } : { ok: false, message: 'Robô não encontrado.' };
  }
  await db.chatbotFlow.create({ data: { tenantId, ...data } });
  return { ok: true };
}

function refsOf(steps: BotSteps) {
  const tags = new Set<string>();
  const stages = new Set<string>();
  const users = new Set<string>();
  for (const s of Object.values(steps.steps)) {
    for (const o of s.options) {
      for (const a of o.actions ?? []) {
        if (a.type === 'tag') tags.add(a.tagId);
        if (a.type === 'stage' || (a.type === 'createLead' && a.stageId)) stages.add(a.type === 'stage' ? a.stageId : a.stageId!);
        if (a.type === 'assign') users.add(a.userId);
      }
    }
  }
  return { tags: [...tags], stages: [...stages], users: [...users] };
}

export async function toggleBot(db: TenantPrismaClient, id: string, active: boolean): Promise<Result> {
  const bot = await db.chatbotFlow.findFirst({ where: { id } });
  if (!bot) return { ok: false, message: 'Robô não encontrado.' };
  if (active && bot.trigger === 'NEW_CONTACT') {
    const outro = await db.chatbotFlow.findFirst({ where: { active: true, trigger: 'NEW_CONTACT', id: { not: id } } });
    if (outro) return { ok: false, message: `Já existe um robô de contato novo ligado (${outro.name}). Desligue aquele primeiro.` };
  }
  await db.chatbotFlow.updateMany({ where: { id }, data: { active } });
  // Desligou: as conversas em que ele estava seguem com a equipe.
  if (!active) await db.conversation.updateMany({ where: { botFlowId: id }, data: { botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0 } });
  return { ok: true };
}

export async function deleteBot(db: TenantPrismaClient, id: string): Promise<Result> {
  await db.conversation.updateMany({ where: { botFlowId: id }, data: { botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0 } });
  const r = await db.chatbotFlow.deleteMany({ where: { id } });
  return r.count ? { ok: true } : { ok: false, message: 'Robô não encontrado.' };
}
