/**
 * Regras puras do aviso de conversões à Meta (Conversions API for Business
 * Messaging). O envio fica em `crm/meta-conversions.ts`.
 *
 * A Meta só sabe que a pessoa tocou no anúncio e chamou no WhatsApp. Daqui
 * mandamos o que acontece depois: agendou (LeadSubmitted) e fechou (Purchase,
 * com o valor). Com isso o Gerenciador de Anúncios mostra custo por
 * agendamento e por paciente, e a Meta passa a procurar gente parecida com
 * quem fecha, não só com quem chama.
 */

export type ConversionKind = 'agendou' | 'fechou';

/** O nome do evento na Meta. "Schedule" não existe para WhatsApp. */
export const META_EVENT: Record<ConversionKind, string> = {
  agendou: 'LeadSubmitted',
  fechou: 'Purchase',
};

/** O que fica no histórico do lead (CLINIC_EVENT) e impede mandar duas vezes. */
export const ACTIVITY_EVENT: Record<ConversionKind, string> = {
  agendou: 'meta.agendou',
  fechou: 'meta.fechou',
};

/** Qual aviso a entrada numa etapa gera (pelo papel da etapa), ou null. */
export function conversionForRole(role: string | null | undefined): ConversionKind | null {
  if (role === 'SCHEDULED') return 'agendou';
  if (role === 'WON') return 'fechou';
  return null;
}

/** O id do clique no anúncio guardado na mensagem (`chat_messages.ad.ctwaClid`). */
export function readCtwaClid(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>).ctwaClid;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export interface ConversionInput {
  kind: ConversionKind;
  wabaId: string;
  ctwaClid: string;
  /** Valor do negócio em centavos (só no "fechou"). */
  valueCents?: number | null;
  /** Id do lead: vira o event_id (a Meta não remove repetidos; nós removemos antes). */
  leadId: string;
  now?: Date;
}

/** O corpo do POST /{dataset_id}/events. */
export function buildConversionPayload(input: ConversionInput) {
  const event: Record<string, unknown> = {
    event_name: META_EVENT[input.kind],
    event_time: Math.floor((input.now ?? new Date()).getTime() / 1000),
    event_id: `${input.leadId}:${input.kind}`,
    action_source: 'business_messaging',
    messaging_channel: 'whatsapp',
    user_data: {
      whatsapp_business_account_id: input.wabaId,
      ctwa_clid: input.ctwaClid,
    },
  };
  if (input.kind === 'fechou') {
    const cents = input.valueCents && input.valueCents > 0 ? input.valueCents : 0;
    event.custom_data = { currency: 'BRL', value: Math.round(cents) / 100 };
  }
  return { data: [event], partner_agent: 'dreamclin' };
}

/**
 * O erro da Meta em palavras da clínica. Sem a permissão nova (clínica que
 * conectou antes de 11/11/2026), a Meta responde erro de permissão: a saída é
 * reconectar o WhatsApp.
 */
export function explainMetaError(code: number | undefined, message: string | undefined): string {
  if (code === 10 || code === 200 || code === 190 || /permission/i.test(message ?? '')) {
    return 'A Meta não deixou registrar o evento. Reconecte o WhatsApp em Canais para liberar a permissão nova.';
  }
  return `A Meta recusou o evento${message ? `: ${message.slice(0, 200)}` : ''}.`;
}
