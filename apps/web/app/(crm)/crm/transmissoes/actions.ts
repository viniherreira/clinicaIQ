'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { guardCrmAction } from '@/crm/guard';
import { cancelBroadcast, createBroadcast, parseAudience, previewAudience, startBroadcast, type AudiencePreview } from '@/crm/broadcasts';
import { clinicLocalToInstant } from '@/crm/clock';

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

export async function previewAudienceAction(audience: unknown): Promise<Result<{ preview: AudiencePreview }>> {
  const g = await guardCrmAction('crm_config', { write: false });
  if (!g.ok) return g;
  return { ok: true, preview: await previewAudience(g.db, parseAudience(audience)) };
}

export async function createBroadcastAction(input: {
  name: string;
  audience: unknown;
  text?: string;
  templateId?: string;
  templateParams?: string[];
  /** "AAAA-MM-DDTHH:mm" no horário da clínica; vazio = agora. */
  scheduledLocal?: string;
}): Promise<Result<{ broadcastId: string }>> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  let scheduledAt: Date | null = null;
  if (input.scheduledLocal) {
    scheduledAt = clinicLocalToInstant(input.scheduledLocal);
    if (!scheduledAt || scheduledAt.getTime() < Date.now()) return { ok: false, message: 'Escolha uma data e hora no futuro.' };
  }
  const r = await createBroadcast(g.db, g, {
    name: input.name,
    audience: parseAudience(input.audience),
    text: input.text,
    templateId: input.templateId,
    templateParams: input.templateParams,
    scheduledAt,
  });
  if (!r.ok) return r;
  const { broadcastId, startNow } = r;
  if (startNow) after(() => startBroadcast(g.tenantId, broadcastId));
  revalidatePath('/crm/transmissoes');
  return { ok: true, broadcastId };
}

export async function cancelBroadcastAction(broadcastId: string): Promise<Result> {
  const g = await guardCrmAction('crm_config');
  if (!g.ok) return g;
  const r = await cancelBroadcast(g.db, broadcastId);
  if (r.ok) {
    revalidatePath('/crm/transmissoes');
    revalidatePath(`/crm/transmissoes/${broadcastId}`);
  }
  return r.ok ? { ok: true } : r;
}
