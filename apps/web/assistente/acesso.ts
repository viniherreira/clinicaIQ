import 'server-only';
import { prisma } from '@clinicaiq/db';
import { rateLimit } from '@/lib/rate-limit';

export const LIMITE_DIA_CLINICA = 100;
export const LIMITE_HORA_USUARIO = 30;

/** Liberado pelo piloto (assinatura) ou pelo plano. Sem assinatura, fechado. */
export async function assistenteLiberado(tenantId: string): Promise<boolean> {
  const s = await prisma.subscription
    .findUnique({ where: { tenantId }, select: { assistantEnabled: true, plan: { select: { assistantEnabled: true } } } })
    .catch(() => null);
  return Boolean(s && (s.assistantEnabled || s.plan.assistantEnabled));
}

export async function checarLimites(
  tenantId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; retryAfter: number; mensagem: string }> {
  const usuario = await rateLimit(`assistente:usuario:${tenantId}:${userId}`, LIMITE_HORA_USUARIO, 60 * 60_000);
  if (!usuario.ok) return { ok: false, retryAfter: usuario.retryAfter, mensagem: 'Muitas perguntas seguidas. Tente de novo daqui a pouco.' };
  const clinica = await rateLimit(`assistente:clinica:${tenantId}`, LIMITE_DIA_CLINICA, 24 * 60 * 60_000);
  if (!clinica.ok) return { ok: false, retryAfter: clinica.retryAfter, mensagem: 'Limite de perguntas de hoje atingido.' };
  return { ok: true };
}
