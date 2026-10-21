import { prisma, type TemplateCategory } from '@clinicaiq/db';
import { CloudApiError, countTemplateVariables, type GraphTemplate } from '@clinicaiq/whatsapp';
import { META_TEMPLATE_STATUS as STATUS } from '@/lib/agenda-templates-sync';
import { activeCloudAccount, cloudClient } from './cloud';

/**
 * A API oficial no CRM: conectar, testar e desligar (a conta é da clínica e mora
 * em `lib/cloud-account-admin.ts`) e os modelos do CRM. Quem chama já passou por
 * `guardCrmAction('crm_config')`.
 */
export { checkCloud, connectManual, disconnectCloud, finishEmbeddedSignup } from '@/lib/cloud-account-admin';

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const why = (e: unknown) => (e instanceof CloudApiError ? e.userMessage : 'Não foi possível falar com a Meta.');

// ─── Modelos ─────────────────────────────────────────────────────────────────

const CATEGORY: Record<string, TemplateCategory> = { MARKETING: 'MARKETING', UTILITY: 'UTILITY', AUTHENTICATION: 'AUTHENTICATION' };

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
