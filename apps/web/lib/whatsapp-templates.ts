import { prisma, type TemplateCategory } from '@clinicaiq/db';
import { CloudApiError, countTemplateVariables, type GraphTemplate } from '@clinicaiq/whatsapp';
import { META_TEMPLATE_STATUS as STATUS, approvedAgendaTemplate } from './agenda-templates-sync';
import { AGENDA_PURPOSES, type AgendaPurpose } from './agenda-templates';
import { activeCloudAccount, cloudClient } from './cloud-account';

/**
 * Os modelos de mensagem da API oficial da clínica: trazer da Meta, criar e
 * mandar para aprovação. Servem à gestão (Configurações › Modelos do WhatsApp)
 * e ao CRM (Automações › Modelos); quem chama já conferiu a permissão.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const why = (e: unknown) => (e instanceof CloudApiError ? e.userMessage : 'Não foi possível falar com a Meta.');

const CATEGORY: Record<string, TemplateCategory> = { MARKETING: 'MARKETING', UTILITY: 'UTILITY', AUTHENTICATION: 'AUTHENTICATION' };

/** Botões de resposta rápida: até 3, com até 25 letras. */
export const TEMPLATE_BUTTON_MAX = 3;
export const TEMPLATE_BUTTON_CHARS = 25;

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

export interface NewTemplateInput {
  name: string;
  category: 'MARKETING' | 'UTILITY';
  body: string;
  examples: string[];
  /** Botões de resposta rápida (opcional). */
  buttons?: string[];
}

/** Problema no modelo antes de mandar para a Meta (ou null). */
export function templateProblem(input: Pick<NewTemplateInput, 'name' | 'body' | 'examples' | 'buttons'>): string | null {
  if (!/^[a-z0-9_]{1,60}$/.test(input.name)) return 'Nome: só letras minúsculas, números e _ (ex.: retomar_contato).';
  // O prefixo dc_ é dos avisos da agenda, que o sistema numera sozinho.
  if (/^dc_(agendamento|lembrete)_/.test(input.name)) return 'Esse nome é dos avisos da agenda. Escolha outro.';
  const body = input.body.trim();
  if (!body) return 'Escreva o texto do modelo.';
  if (body.length > 1024) return 'O texto passa de 1024 caracteres.';
  const n = countTemplateVariables(body);
  for (let i = 1; i <= n; i++) {
    if (!new RegExp(`\\{\\{\\s*${i}\\s*\\}\\}`).test(body)) return `As variáveis precisam ir de {{1}} a {{${n}}} sem pular.`;
  }
  if (/^\s*\{\{|\}\}\s*$/.test(body)) return 'A Meta não aceita variável no começo nem no fim do texto.';
  if (input.examples.slice(0, n).some((e) => !e.trim()) || input.examples.length < n) return 'Dê um exemplo para cada variável.';
  const buttons = (input.buttons ?? []).map((b) => b.trim());
  if (buttons.length > TEMPLATE_BUTTON_MAX) return `No máximo ${TEMPLATE_BUTTON_MAX} botões.`;
  if (buttons.some((b) => !b)) return 'Dê um nome para cada botão ou tire o botão vazio.';
  if (buttons.some((b) => b.length > TEMPLATE_BUTTON_CHARS)) return `Cada botão tem no máximo ${TEMPLATE_BUTTON_CHARS} letras.`;
  if (new Set(buttons.map((b) => b.toLowerCase())).size < buttons.length) return 'Dois botões com o mesmo nome.';
  return null;
}

export async function createTemplate(tenantId: string, input: NewTemplateInput): Promise<Result> {
  const problem = templateProblem(input);
  if (problem) return { ok: false, message: problem };
  const account = await activeCloudAccount(tenantId);
  if (!account) return { ok: false, message: 'Conecte a API oficial primeiro.' };
  const body = input.body.trim();
  const examples = input.examples.slice(0, countTemplateVariables(body)).map((e) => e.trim());
  const buttons = (input.buttons ?? []).map((b) => b.trim());
  // O payload de cada botão é o próprio texto: é o que volta no webhook quando tocam.
  const stored = buttons.length ? buttons.map((text) => ({ text, payload: text })) : undefined;
  try {
    const r = await cloudClient(account).createTemplate({
      name: input.name,
      category: input.category,
      language: 'pt_BR',
      body,
      examples,
      quickReplies: buttons,
    });
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
        buttons: stored,
      },
      update: { status: STATUS[r.status] ?? 'PENDING', body, variables: examples.length, externalId: r.id, category: input.category, buttons: stored },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: why(e) };
  }
}

// ─── A lista do painel ───────────────────────────────────────────────────────

export interface TemplateRow {
  id: string;
  name: string;
  category: string;
  status: string;
  body: string;
  rejectedReason: string | null;
  buttons: string[];
  /** Aviso da agenda que este modelo atende (null = modelo livre, do CRM). */
  purpose: AgendaPurpose | null;
  /** É o aprovado que a agenda manda hoje para este aviso. */
  inUse: boolean;
}

const asPurpose = (p: string | null): AgendaPurpose | null =>
  p && (AGENDA_PURPOSES as readonly string[]).includes(p) ? (p as AgendaPurpose) : null;

function buttonTexts(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((b) => (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? [(b as { text: string }).text] : []));
}

/** Todos os modelos da clínica: os da agenda primeiro (o em uso no topo), depois os livres. */
export async function listTemplateRows(tenantId: string): Promise<TemplateRow[]> {
  const [rows, ...emUso] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true, name: true, category: true, status: true, body: true, rejectedReason: true, buttons: true, purpose: true },
    }),
    ...AGENDA_PURPOSES.map((p) => approvedAgendaTemplate(tenantId, p)),
  ]);
  const nomesEmUso = new Set(emUso.flatMap((t) => (t ? [t.name] : [])));
  const out = rows.map<TemplateRow>((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    status: t.status,
    body: t.body,
    rejectedReason: t.rejectedReason,
    buttons: buttonTexts(t.buttons),
    purpose: asPurpose(t.purpose),
    inUse: Boolean(t.purpose) && nomesEmUso.has(t.name),
  }));
  const ordem = (t: TemplateRow) => (t.purpose ? (t.inUse ? 0 : 1) : 2);
  return out.sort((a, b) => ordem(a) - ordem(b));
}
