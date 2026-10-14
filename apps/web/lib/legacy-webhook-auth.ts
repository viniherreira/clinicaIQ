import { verifyMetaSignature } from '@clinicaiq/whatsapp';

/**
 * Quem pode chamar o webhook antigo do WhatsApp (`/api/webhooks/whatsapp`).
 *
 * Ele confirma, cancela e remarca consultas a partir do telefone do paciente.
 * Sem trava, bastava saber o celular de alguém (ou o id de um agendamento) para
 * mexer na consulta dele em qualquer clínica.
 *
 * Em produção só passa o que a Meta assinou (`X-Hub-Signature-256` com o segredo
 * do app). Sem segredo configurado, nada passa. Fora de produção o mock continua
 * funcionando sem assinatura, para simular a resposta do paciente.
 */
export function legacyWebhookAuthorized(
  rawBody: string,
  signature: string | null,
  env: { NODE_ENV?: string; WHATSAPP_APP_SECRET?: string; META_APP_SECRET?: string },
): boolean {
  if (env.NODE_ENV !== 'production') return true;
  const secret = env.WHATSAPP_APP_SECRET || env.META_APP_SECRET;
  return verifyMetaSignature(rawBody, signature, secret);
}

/** O atalho `{ appointmentId, text }` é só do mock; em produção não existe. */
export function directShapeAllowed(env: { NODE_ENV?: string }): boolean {
  return env.NODE_ENV !== 'production';
}
