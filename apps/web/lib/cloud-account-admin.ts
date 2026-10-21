import { randomInt } from 'node:crypto';
import { decrypt, prisma } from '@clinicaiq/db';
import { CloudApi, CloudApiError, exchangeSignupCode } from '@clinicaiq/whatsapp';
import { activeCloudAccount, cloudClient, graphVersion, sealToken } from './cloud-account';
import { ensureAgendaTemplates } from './agenda-templates-sync';

/**
 * Conectar, testar e desligar a API oficial da clínica. Quem chama já conferiu a
 * permissão: `guardCrmAction('crm_config')` no CRM, `configuracoes` na gestão.
 */

type Result = { ok: true } | { ok: false; message: string };

const why = (e: unknown) => (e instanceof CloudApiError ? e.userMessage : 'Não foi possível falar com a Meta.');

async function audit(tenantId: string, userId: string | null, action: string, metadata: object = {}) {
  await prisma.auditLog
    .create({ data: { tenantId, userId, action, entity: 'WhatsAppCloudAccount', entityId: tenantId, metadata } })
    .catch(() => undefined);
}

async function saveAccount(
  tenantId: string,
  data: { wabaId: string; phoneNumberId: string; token: string; manual: boolean; coexistence: boolean; displayPhone?: string; verifiedName?: string },
): Promise<Result> {
  const outra = await prisma.whatsAppCloudAccount.findUnique({ where: { phoneNumberId: data.phoneNumberId } });
  if (outra && outra.tenantId !== tenantId) return { ok: false, message: 'Este número já está conectado em outra clínica.' };

  const values = {
    wabaId: data.wabaId,
    phoneNumberId: data.phoneNumberId,
    accessTokenEncrypted: sealToken(data.token, tenantId),
    displayPhone: data.displayPhone ?? null,
    verifiedName: data.verifiedName ?? null,
    manual: data.manual,
    coexistence: data.coexistence,
    active: true,
    status: 'CONNECTED' as const,
    lastError: null,
    connectedAt: new Date(),
  };
  // A chave do upsert é a clínica: não alcança conta de outra.
  await prisma.whatsAppCloudAccount.upsert({ where: { tenantId }, create: { tenantId, ...values }, update: values });
  return { ok: true };
}

/**
 * Conta ligada: os avisos da agenda vão para a Meta aprovar. Uma falha aqui não
 * desfaz a conexão; o painel de mensagens mostra e deixa mandar de novo.
 */
async function afterConnect(tenantId: string): Promise<void> {
  try {
    await ensureAgendaTemplates(tenantId);
  } catch (e) {
    console.error('[whatsapp] modelos da agenda não foram enviados', e instanceof Error ? e.message : e);
  }
}

/** Token, número e conta colados à mão (número de teste, ou número da mesma empresa do app). */
export async function connectManual(
  tenantId: string,
  userId: string | null,
  input: { token: string; phoneNumberId: string; wabaId: string },
): Promise<Result> {
  const token = input.token.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  const wabaId = input.wabaId.trim();
  if (!token || !/^\d{5,25}$/.test(phoneNumberId) || !/^\d{5,25}$/.test(wabaId)) {
    return { ok: false, message: 'Preencha o token e os dois identificadores (só números).' };
  }
  const api = new CloudApi({ token, phoneNumberId, wabaId, version: graphVersion() });
  let info;
  try {
    info = await api.getPhoneNumber();
  } catch (e) {
    return { ok: false, message: why(e) };
  }
  // Sem a inscrição o webhook não chega; com o número de teste às vezes já está feita.
  await api.subscribeApp().catch(() => undefined);
  const r = await saveAccount(tenantId, {
    wabaId,
    phoneNumberId,
    token,
    manual: true,
    coexistence: false,
    displayPhone: info.display_phone_number,
    verifiedName: info.verified_name,
  });
  if (r.ok) {
    await audit(tenantId, userId, 'WHATSAPP_CLOUD_CONNECTED', { manual: true, phoneNumberId });
    await afterConnect(tenantId);
  }
  return r;
}

/** Fim do cadastro incorporado: troca o código pelo token e liga a conta. */
export async function finishEmbeddedSignup(
  tenantId: string,
  userId: string | null,
  input: { code: string; wabaId: string; phoneNumberId: string; coexistence: boolean },
): Promise<Result> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, message: 'A conexão com a Meta ainda não está configurada no servidor.' };
  if (!input.code || !/^\d{5,25}$/.test(input.wabaId) || !/^\d{5,25}$/.test(input.phoneNumberId)) {
    return { ok: false, message: 'A Meta não devolveu os dados do número. Tente de novo.' };
  }

  let r: Result;
  try {
    const token = await exchangeSignupCode({ appId, appSecret, code: input.code, version: graphVersion() });
    const api = new CloudApi({ token, phoneNumberId: input.phoneNumberId, wabaId: input.wabaId, version: graphVersion() });
    await api.subscribeApp();
    // Na coexistência o número já está no app do celular; fora dela, registra na Cloud API.
    if (!input.coexistence) await api.registerPhone(String(randomInt(100000, 999999)));
    const info = await api.getPhoneNumber().catch(() => ({ display_phone_number: undefined, verified_name: undefined }));
    r = await saveAccount(tenantId, {
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      token,
      manual: false,
      coexistence: input.coexistence,
      displayPhone: info.display_phone_number,
      verifiedName: info.verified_name,
    });
  } catch (e) {
    return { ok: false, message: why(e) };
  }
  if (r.ok) {
    await audit(tenantId, userId, 'WHATSAPP_CLOUD_CONNECTED', { manual: false, coexistence: input.coexistence });
    await afterConnect(tenantId);
  }
  return r;
}

/** Desliga a API oficial. A conta fica guardada para religar. */
export async function disconnectCloud(tenantId: string, userId: string | null): Promise<Result> {
  const r = await prisma.whatsAppCloudAccount.updateMany({ where: { tenantId }, data: { active: false, status: 'DISCONNECTED' } });
  if (r.count) await audit(tenantId, userId, 'WHATSAPP_CLOUD_DISCONNECTED');
  return r.count ? { ok: true } : { ok: false, message: 'Nenhuma conta oficial conectada.' };
}

/** Pergunta à Meta se o número continua respondendo. */
export async function checkCloud(tenantId: string): Promise<Result> {
  const row = await prisma.whatsAppCloudAccount.findUnique({ where: { tenantId } });
  if (!row) return { ok: false, message: 'Nenhuma conta oficial conectada.' };
  // Testa mesmo com erro: é assim que uma conta volta a funcionar.
  const account = await activeCloudAccount(tenantId);
  const token = account?.token ?? decrypt(row.accessTokenEncrypted, process.env.ENCRYPTION_MASTER_KEY ?? '', tenantId);
  try {
    const info = await cloudClient({ token, phoneNumberId: row.phoneNumberId, wabaId: row.wabaId }).getPhoneNumber();
    await prisma.whatsAppCloudAccount.update({
      where: { tenantId },
      data: { status: 'CONNECTED', lastError: null, displayPhone: info.display_phone_number ?? row.displayPhone, verifiedName: info.verified_name ?? row.verifiedName },
    });
    return { ok: true };
  } catch (e) {
    await prisma.whatsAppCloudAccount.update({ where: { tenantId }, data: { status: 'ERROR', lastError: why(e) } });
    return { ok: false, message: why(e) };
  }
}

/** O que a tela mostra da conta (nunca o token). */
export async function cloudAccountSummary(tenantId: string) {
  return prisma.whatsAppCloudAccount.findUnique({
    where: { tenantId },
    select: { active: true, status: true, displayPhone: true, verifiedName: true, manual: true, coexistence: true, lastError: true, connectedAt: true },
  });
}
