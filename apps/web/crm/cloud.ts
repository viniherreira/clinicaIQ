import { decrypt, encrypt, prisma } from '@clinicaiq/db';
import { CloudApi, DEFAULT_GRAPH_VERSION } from '@clinicaiq/whatsapp';

/**
 * O canal das conversas do CRM de cada clínica: a API oficial (Cloud API), quando
 * a conta está conectada e ativa, ou o gateway de QR.
 */

function masterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY not set');
  return key;
}

export const graphVersion = () => process.env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;

export interface CloudAccount {
  id: string;
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string | null;
  token: string;
}

/** A conta oficial que está valendo, ou null (então é o gateway). */
export async function activeCloudAccount(tenantId: string): Promise<CloudAccount | null> {
  const a = await prisma.whatsAppCloudAccount.findUnique({ where: { tenantId } });
  if (!a || !a.active || a.status !== 'CONNECTED') return null;
  try {
    return {
      id: a.id,
      tenantId,
      wabaId: a.wabaId,
      phoneNumberId: a.phoneNumberId,
      displayPhone: a.displayPhone,
      token: decrypt(a.accessTokenEncrypted, masterKey(), tenantId),
    };
  } catch {
    return null;
  }
}

/** De quem é o número que recebeu (webhook da Meta). */
export async function accountByPhoneNumberId(phoneNumberId: string) {
  return prisma.whatsAppCloudAccount.findUnique({ where: { phoneNumberId } });
}

export function cloudClient(a: Pick<CloudAccount, 'token' | 'phoneNumberId' | 'wabaId'>): CloudApi {
  return new CloudApi({ token: a.token, phoneNumberId: a.phoneNumberId, wabaId: a.wabaId, version: graphVersion() });
}

export const sealToken = (token: string, tenantId: string) => encrypt(token, masterKey(), tenantId);

/** A Meta está configurada no servidor (aprovação saiu e as variáveis existem)? */
export function metaSignupConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_ES_CONFIG_ID);
}

/** Janela de 24 horas da API oficial. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export function windowOpen(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  return Boolean(lastInboundAt && now.getTime() - lastInboundAt.getTime() < WINDOW_MS);
}
