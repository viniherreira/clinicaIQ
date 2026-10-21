/**
 * O canal das conversas do CRM de cada clínica: a API oficial (Cloud API), quando
 * a conta está conectada e ativa, ou o gateway de QR. A conta é da clínica e mora
 * em `lib/cloud-account.ts`; aqui fica o que é só das conversas.
 */
export {
  accountByPhoneNumberId,
  activeCloudAccount,
  cloudClient,
  graphVersion,
  metaSignupConfigured,
  sealToken,
  type CloudAccount,
} from '@/lib/cloud-account';

/** Janela de 24 horas da API oficial. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export function windowOpen(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  return Boolean(lastInboundAt && now.getTime() - lastInboundAt.getTime() < WINDOW_MS);
}
