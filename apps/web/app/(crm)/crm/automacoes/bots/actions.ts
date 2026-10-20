'use server';

import { revalidatePath } from 'next/cache';
import type { ChatbotTrigger } from '@clinicaiq/db';
import { saveBot } from '@/crm/bot-admin';
import { isFlowDoc, type FlowDoc } from '@/crm/flow-engine';
import { readFlow } from '@/crm/flow-legacy';
import { guardCrmAction } from '@/crm/guard';

/**
 * O editor de robôs em quadro (no jeito do Salesbot do Kommo). Só dono e
 * administrador (`crm_config`). Regras em `crm/bot-admin.ts`.
 */

const TRIGGERS: readonly ChatbotTrigger[] = ['NEW_CONTACT', 'KEYWORD', 'STAGE', 'TAG', 'NO_REPLY'];

export async function saveFlowAction(input: {
  id?: string;
  name: string;
  trigger: ChatbotTrigger;
  keywords: string;
  active: boolean;
  doc: FlowDoc;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  if (!TRIGGERS.includes(input.trigger)) return { ok: false, message: 'Gatilho inválido.' };
  if (!isFlowDoc(input.doc)) return { ok: false, message: 'O robô está num formato que não dá para ler.' };
  const r = await saveBot(g.db, g.tenantId, {
    id: input.id || undefined,
    name: input.name,
    trigger: input.trigger,
    keywords: input.keywords.split(','),
    steps: input.doc,
    active: input.active,
  });
  if (!r.ok) return r;
  revalidatePath('/crm/automacoes/bots');
  return { ok: true, id: r.id ?? input.id ?? '' };
}

/** Cópia desligada do robô, para começar outro parecido. */
export async function duplicateFlowAction(id: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const bot = await g.db.chatbotFlow.findFirst({ where: { id } });
  const doc = bot ? readFlow(bot.steps) : null;
  if (!bot || !doc) return { ok: false, message: 'Robô não encontrado.' };
  const copia = await g.db.chatbotFlow.create({
    data: {
      tenantId: g.tenantId,
      name: `${bot.name} (cópia)`.slice(0, 60),
      trigger: bot.trigger,
      keywords: bot.keywords,
      active: false,
      steps: doc as unknown as object,
    },
  });
  revalidatePath('/crm/automacoes/bots');
  return { ok: true, id: copia.id };
}
