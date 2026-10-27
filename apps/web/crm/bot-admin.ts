import type { ChatbotTrigger, Prisma, TenantPrismaClient } from '@clinicaiq/db';
import { DISTRIBUTE } from './distribution-rules';
import { isTargeted, normalize, parseSteps, stepsProblem, type BotSteps } from './bot-engine';
import { flowProblem, isFlowDoc, type FlowDoc } from './flow-engine';
import { readFlow } from './flow-legacy';

/** Cadastro dos robôs. Quem chama já passou por `guardCrmAction('crm_config')`. */

type Result = { ok: true; id?: string } | { ok: false; message: string };

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
  // Formato novo (passos ligados, como o Salesbot) ou o antigo (menu de botões).
  const novo = isFlowDoc(input.steps) ? (input.steps as FlowDoc) : null;
  const steps = novo ?? parseSteps(input.steps);
  if (!steps) return { ok: false, message: 'O robô precisa de um primeiro passo.' };
  const problem = novo ? flowProblem(novo) : stepsProblem(steps as BotSteps);
  if (problem) return { ok: false, message: problem };
  const keywords = input.trigger === 'KEYWORD' ? cleanKeywords(input.keywords) : [];
  if (input.trigger === 'KEYWORD' && keywords.length === 0) return { ok: false, message: 'Escreva pelo menos uma palavra-chave (ex.: menu).' };
  // Gatilhos do Kommo: etapa, tag e sem resposta precisam saber quando.
  const cfg = novo?.trigger ?? {};
  if (input.trigger === 'STAGE' && !cfg.stageIds?.length) return { ok: false, message: 'Escolha em quais etapas o robô começa.' };
  if (input.trigger === 'TAG' && !cfg.tagIds?.length) return { ok: false, message: 'Escolha qual tag faz o robô começar.' };
  if (input.trigger === 'NO_REPLY' && !(cfg.hours && cfg.hours >= 1 && cfg.hours <= 24 * 30)) {
    return { ok: false, message: 'Diga depois de quantas horas sem resposta o robô começa (de 1 hora a 30 dias).' };
  }
  if (cfg.stageIds?.length) {
    const n = await db.pipelineStage.count({ where: { id: { in: cfg.stageIds } } });
    if (n !== cfg.stageIds.length) return { ok: false, message: 'O gatilho aponta para uma etapa que não existe mais.' };
  }
  if (cfg.tagIds?.length) {
    const n = await db.leadTag.count({ where: { id: { in: cfg.tagIds } } });
    if (n !== cfg.tagIds.length) return { ok: false, message: 'O gatilho aponta para uma tag que não existe mais.' };
  }

  // O que as ações apontam precisa ser desta clínica.
  const refs = novo ? refsOfFlow(novo) : refsOf(steps as BotSteps);
  if (refs.bots.length) {
    const bots = await db.chatbotFlow.count({ where: { id: { in: refs.bots } } });
    if (bots !== refs.bots.length) return { ok: false, message: 'O passo "Iniciar outro robô" aponta para um robô que não existe mais.' };
  }
  const [tags, stages, users, fields] = await Promise.all([
    refs.tags.length ? db.leadTag.count({ where: { id: { in: refs.tags } } }) : 0,
    refs.stages.length ? db.pipelineStage.count({ where: { id: { in: refs.stages } } }) : 0,
    refs.users.length ? db.user.count({ where: { id: { in: refs.users }, active: true } }) : 0,
    refs.fields.length ? db.leadField.count({ where: { id: { in: refs.fields }, active: true } }) : 0,
  ]);
  if (tags !== refs.tags.length || stages !== refs.stages.length || users !== refs.users.length) {
    return { ok: false, message: 'Uma ação aponta para tag, etapa ou pessoa que não existe mais.' };
  }
  if (fields !== refs.fields.length) return { ok: false, message: 'Uma pergunta guarda a resposta num campo que não existe mais.' };

  // Só um robô geral de "contato novo" ligado por vez: dois responderiam juntos.
  // Os que pedem tag podem ser vários (cada um para o seu público).
  if (input.active && input.trigger === 'NEW_CONTACT' && !isTargeted(steps)) {
    const outro = await outroGeral(db, input.id);
    if (outro) return { ok: false, message: `Já existe um robô de contato novo para todos ligado (${outro}). Desligue aquele ou escolha tags no passo "Para quem".` };
  }

  const data = { name, trigger: input.trigger, keywords, steps: steps as unknown as Prisma.InputJsonValue, active: input.active };
  if (input.id) {
    const r = await db.chatbotFlow.updateMany({ where: { id: input.id }, data });
    return r.count ? { ok: true, id: input.id } : { ok: false, message: 'Robô não encontrado.' };
  }
  const criado = await db.chatbotFlow.create({ data: { tenantId, ...data } });
  return { ok: true, id: criado.id };
}

function refsOf(steps: BotSteps) {
  const tags = new Set<string>([...(steps.audience?.anyTags ?? []), ...(steps.audience?.noneTags ?? [])]);
  const stages = new Set<string>();
  const users = new Set<string>();
  const fields = new Set<string>();
  for (const s of Object.values(steps.steps)) {
    if (s.saveTo?.startsWith('field:')) fields.add(s.saveTo.slice(6));
    for (const o of [...s.options, ...(s.answer ? [s.answer] : [])]) {
      for (const a of o.actions ?? []) {
        if (a.type === 'tag') tags.add(a.tagId);
        if (a.type === 'stage' || (a.type === 'createLead' && a.stageId)) stages.add(a.type === 'stage' ? a.stageId : a.stageId!);
        if (a.type === 'assign' && a.userId !== DISTRIBUTE) users.add(a.userId);
      }
    }
  }
  return { tags: [...tags], stages: [...stages], users: [...users], fields: [...fields], bots: [] as string[] };
}

/** Tudo que um robô do formato novo cita: tags, etapas, pessoas, campos e outros robôs. */
function refsOfFlow(doc: FlowDoc) {
  const tags = new Set<string>([...(doc.audience?.anyTags ?? []), ...(doc.audience?.noneTags ?? [])]);
  const stages = new Set<string>();
  const users = new Set<string>();
  const fields = new Set<string>();
  const bots = new Set<string>();
  for (const s of Object.values(doc.steps)) {
    if (s.type === 'action') {
      for (const a of s.actions) {
        if (a.type === 'tag' || a.type === 'untag') tags.add(a.tagId);
        if (a.type === 'stage') stages.add(a.stageId);
        if (a.type === 'createLead' && a.stageId) stages.add(a.stageId);
        if (a.type === 'assign' && a.userId !== DISTRIBUTE) users.add(a.userId);
        if (a.type === 'setField' && a.field.startsWith('field:')) fields.add(a.field.slice(6));
      }
    }
    if (s.type === 'condition') {
      for (const c of s.cases) {
        for (const r of c.rules) {
          if (r.subject === 'tag' && r.ref) tags.add(r.ref);
          if (r.subject === 'stage' && r.ref) stages.add(r.ref);
          if (r.subject === 'field' && r.ref) fields.add(r.ref);
        }
      }
    }
    if (s.type === 'startBot' && s.botId) bots.add(s.botId);
  }
  return { tags: [...tags], stages: [...stages], users: [...users], fields: [...fields], bots: [...bots] };
}

export async function toggleBot(db: TenantPrismaClient, id: string, active: boolean): Promise<Result> {
  const bot = await db.chatbotFlow.findFirst({ where: { id } });
  if (!bot) return { ok: false, message: 'Robô não encontrado.' };
  const steps = readFlow(bot.steps);
  if (active && bot.trigger === 'NEW_CONTACT' && !(steps && isTargeted(steps))) {
    const outro = await outroGeral(db, id);
    if (outro) return { ok: false, message: `Já existe um robô de contato novo para todos ligado (${outro}). Desligue aquele primeiro.` };
  }
  await db.chatbotFlow.updateMany({ where: { id }, data: { active } });
  // Desligou: as conversas em que ele estava seguem com a equipe.
  if (!active) await db.conversation.updateMany({ where: { botFlowId: id }, data: { botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0, botWakeAt: null } });
  return { ok: true };
}

/** Nome de outro robô de contato novo ligado que vale para todos (sem tag pedida), se houver. */
async function outroGeral(db: TenantPrismaClient, exceto?: string): Promise<string | null> {
  const ligados = await db.chatbotFlow.findMany({
    where: { active: true, trigger: 'NEW_CONTACT', ...(exceto ? { id: { not: exceto } } : {}) },
    select: { name: true, steps: true },
  });
  const geral = ligados.find((b) => {
    const s = readFlow(b.steps);
    return !s || !isTargeted(s);
  });
  return geral?.name ?? null;
}

export async function deleteBot(db: TenantPrismaClient, id: string): Promise<Result> {
  await db.conversation.updateMany({ where: { botFlowId: id }, data: { botFlowId: null, botStepId: null, botStartedAt: null, botMisses: 0, botWakeAt: null } });
  const r = await db.chatbotFlow.deleteMany({ where: { id } });
  return r.count ? { ok: true } : { ok: false, message: 'Robô não encontrado.' };
}
