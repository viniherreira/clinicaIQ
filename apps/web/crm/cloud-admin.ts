import { randomInt } from 'node:crypto';
import { decrypt, prisma, type TemplateCategory, type TemplateStatus } from '@clinicaiq/db';
import {
  CloudApi,
  CloudApiError,
  countTemplateVariables,
  exchangeSignupCode,
  type GraphTemplate,
} from '@clinicaiq/whatsapp';
import { activeCloudAccount, cloudClient, graphVersion, sealToken } from './cloud';

/**
 * Conectar, testar e desligar a API oficial, e cuidar dos modelos. Quem chama já
 * passou por `guardCrmAction('crm_config')`.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

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

/** Conexão de teste: token, número e conta colados à mão (número de teste da Meta). */
export async function connectManual(
  tenantId: string,
  userId: string,
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
  if (r.ok) await audit(tenantId, userId, 'WHATSAPP_CLOUD_CONNECTED', { manual: true, phoneNumberId });
  return r;
}

/** Fim do cadastro incorporado: troca o código pelo token e liga a conta. */
export async function finishEmbeddedSignup(
  tenantId: string,
  userId: string,
  input: { code: string; wabaId: string; phoneNumberId: string; coexistence: boolean },
): Promise<Result> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, message: 'A conexão com a Meta ainda não está configurada no servidor.' };
  if (!input.code || !/^\d{5,25}$/.test(input.wabaId) || !/^\d{5,25}$/.test(input.phoneNumberId)) {
    return { ok: false, message: 'A Meta não devolveu os dados do número. Tente de novo.' };
  }

  try {
    const token = await exchangeSignupCode({ appId, appSecret, code: input.code, version: graphVersion() });
    const api = new CloudApi({ token, phoneNumberId: input.phoneNumberId, wabaId: input.wabaId, version: graphVersion() });
    await api.subscribeApp();
    // Na coexistência o número já está no app do celular; fora dela, registra na Cloud API.
    if (!input.coexistence) await api.registerPhone(String(randomInt(100000, 999999)));
    const info = await api.getPhoneNumber().catch(() => ({ display_phone_number: undefined, verified_name: undefined }));
    const r = await saveAccount(tenantId, {
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      token,
      manual: false,
      coexistence: input.coexistence,
      displayPhone: info.display_phone_number,
      verifiedName: info.verified_name,
    });
    if (r.ok) await audit(tenantId, userId, 'WHATSAPP_CLOUD_CONNECTED', { manual: false, coexistence: input.coexistence });
    return r;
  } catch (e) {
    return { ok: false, message: why(e) };
  }
}

/** Volta para o QR code. A conta fica guardada para religar. */
export async function disconnectCloud(tenantId: string, userId: string): Promise<Result> {
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

// ─── Modelos ─────────────────────────────────────────────────────────────────

const CATEGORY: Record<string, TemplateCategory> = { MARKETING: 'MARKETING', UTILITY: 'UTILITY', AUTHENTICATION: 'AUTHENTICATION' };
const STATUS: Record<string, TemplateStatus> = {
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  IN_APPEAL: 'PENDING',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
  LIMIT_EXCEEDED: 'DISABLED',
};

export function fromGraph(t: GraphTemplate) {
  const body = t.components?.find((c) => c.type === 'BODY')?.text ?? '';
  return {
    name: t.name,
    language: t.language,
    category: CATEGORY[t.category] ?? 'MARKETING',
    status: STATUS[t.status] ?? 'PENDING',
    body,
    variables: countTemplateVariables(body),
    components: (t.components ?? []) as object,
    externalId: t.id,
    rejectedReason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null,
  };
}

/** Traz da Meta os modelos da conta (situação de aprovação inclusive). */
export async function syncTemplates(tenantId: string): Promise<Result<{ count: number }>> {
  const account = await activeCloudAccount(tenantId);
  if (!account) return { ok: false, message: 'Conecte a API oficial primeiro.' };
  let list: GraphTemplate[];
  try {
    list = await cloudClient(account).listTemplates();
  } catch (e) {
    return { ok: false, message: why(e) };
  }
  const now = new Date();
  for (const t of list) {
    const v = fromGraph(t);
    await prisma.messageTemplate.upsert({
      where: { tenantId_name_language: { tenantId, name: v.name, language: v.language } },
      create: { tenantId, ...v, lastSyncedAt: now },
      update: { ...v, lastSyncedAt: now },
    });
  }
  return { ok: true, count: list.length };
}

/** Problema no modelo antes de mandar para a Meta (ou null). */
export function templateProblem(input: { name: string; body: string; examples: string[] }): string | null {
  if (!/^[a-z0-9_]{1,60}$/.test(input.name)) return 'Nome: só letras minúsculas, números e _ (ex.: retomar_contato).';
  const body = input.body.trim();
  if (!body) return 'Escreva o texto do modelo.';
  if (body.length > 1024) return 'O texto passa de 1024 caracteres.';
  const n = countTemplateVariables(body);
  for (let i = 1; i <= n; i++) {
    if (!new RegExp(`\\{\\{\\s*${i}\\s*\\}\\}`).test(body)) return `As variáveis precisam ir de {{1}} a {{${n}}} sem pular.`;
  }
  if (/^\s*\{\{|\}\}\s*$/.test(body)) return 'A Meta não aceita variável no começo nem no fim do texto.';
  if (input.examples.slice(0, n).some((e) => !e.trim()) || input.examples.length < n) return 'Dê um exemplo para cada variável.';
  return null;
}

export async function createTemplate(
  tenantId: string,
  input: { name: string; category: 'MARKETING' | 'UTILITY'; body: string; examples: string[] },
): Promise<Result> {
  const problem = templateProblem(input);
  if (problem) return { ok: false, message: problem };
  const account = await activeCloudAccount(tenantId);
  if (!account) return { ok: false, message: 'Conecte a API oficial primeiro.' };
  const body = input.body.trim();
  const examples = input.examples.slice(0, countTemplateVariables(body)).map((e) => e.trim());
  try {
    const r = await cloudClient(account).createTemplate({ name: input.name, category: input.category, language: 'pt_BR', body, examples });
    await prisma.messageTemplate.upsert({
      where: { tenantId_name_language: { tenantId, name: input.name, language: 'pt_BR' } },
      create: {
        tenantId,
        name: input.name,
        language: 'pt_BR',
        category: input.category,
        status: STATUS[r.status] ?? 'PENDING',
        body,
        variables: examples.length,
        externalId: r.id,
      },
      update: { status: STATUS[r.status] ?? 'PENDING', body, variables: examples.length, externalId: r.id, category: input.category },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: why(e) };
  }
}
