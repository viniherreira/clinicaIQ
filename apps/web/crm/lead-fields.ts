import { Prisma, type TenantPrismaClient } from '@clinicaiq/db';
import {
  cleanOptions,
  formatFieldValue,
  hasOptions,
  MAX_FIELDS,
  parseFieldInput,
  readFieldValues,
  sameValue,
  type FieldDef,
  type FieldType,
  type FieldValue,
} from './custom-fields';
import type { Actor } from './leads';

/**
 * Campos personalizados no banco: o cadastro (Configurações do CRM › Campos)
 * e o valor no lead, com histórico. Regras puras em `custom-fields.ts`.
 * Quem chama o cadastro já passou por `guardCrmAction('crm_config')`.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const TYPES: readonly FieldType[] = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTISELECT', 'BOOLEAN'];

export async function listFieldDefs(db: TenantPrismaClient, opts: { activeOnly?: boolean } = {}): Promise<FieldDef[]> {
  const rows = await db.leadField.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, type: true, options: true, showOnCard: true, active: true },
  });
  return rows;
}

export interface FieldInput {
  id?: string;
  name: string;
  type: FieldType;
  options: string[];
  showOnCard: boolean;
  active: boolean;
}

export async function saveField(db: TenantPrismaClient, tenantId: string, input: FieldInput): Promise<Result<{ id: string }>> {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) return { ok: false, message: 'Dê um nome ao campo (ex.: Convênio).' };
  if (!TYPES.includes(input.type)) return { ok: false, message: 'Tipo de campo inválido.' };
  const options = hasOptions(input.type) ? cleanOptions(input.options) : [];
  if (hasOptions(input.type) && options.length === 0) return { ok: false, message: 'Escreva pelo menos uma opção da lista.' };

  const todos = await db.leadField.findMany({ select: { id: true, name: true, type: true, active: true, order: true } });
  if (todos.some((f) => f.id !== input.id && f.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: 'Já existe um campo com esse nome.' };
  }
  const ativos = todos.filter((f) => f.active && f.id !== input.id).length;
  if (input.active && ativos >= MAX_FIELDS) return { ok: false, message: `Limite de ${MAX_FIELDS} campos ativos.` };

  if (input.id) {
    const atual = todos.find((f) => f.id === input.id);
    if (!atual) return { ok: false, message: 'Campo não encontrado.' };
    // O tipo não muda depois de criado: os valores já guardados deixariam de fazer sentido.
    if (atual.type !== input.type) return { ok: false, message: 'O tipo do campo não pode mudar depois de criado.' };
    await db.leadField.updateMany({ where: { id: input.id }, data: { name, options, showOnCard: input.showOnCard, active: input.active } });
    return { ok: true, id: input.id };
  }
  const order = Math.max(0, ...todos.map((f) => f.order)) + 1;
  const novo = await db.leadField.create({ data: { tenantId, name, type: input.type, options, showOnCard: input.showOnCard, active: input.active, order } });
  return { ok: true, id: novo.id };
}

export async function moveField(db: TenantPrismaClient, id: string, direction: -1 | 1): Promise<Result> {
  const todos = await db.leadField.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
  const i = todos.findIndex((f) => f.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= todos.length) return { ok: true };
  [todos[i], todos[j]] = [todos[j], todos[i]];
  await Promise.all(todos.map((f, k) => db.leadField.updateMany({ where: { id: f.id }, data: { order: k } })));
  return { ok: true };
}

/**
 * Grava o valor de vários campos de um lead de uma vez (ficha, Novo lead,
 * importação, robô). Valida cada um; o que mudar vira `FIELD_CHANGED` no
 * histórico. A gravação é um único `jsonb ||` no banco: duas pessoas mexendo em
 * campos diferentes ao mesmo tempo não apagam o que a outra escreveu.
 */
export async function setLeadFields(
  db: TenantPrismaClient,
  actor: Actor,
  leadId: string,
  raw: Record<string, unknown>,
  opts: { history?: boolean } = {},
): Promise<Result> {
  const ids = Object.keys(raw);
  if (ids.length === 0) return { ok: true };
  const [lead, defs] = await Promise.all([
    db.lead.findFirst({ where: { id: leadId, deletedAt: null }, select: { id: true, fields: true } }),
    db.leadField.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, type: true, options: true, showOnCard: true, active: true } }),
  ]);
  if (!lead) return { ok: false, message: 'Lead não encontrado.' };

  const atuais = readFieldValues(lead.fields);
  const gravar: Record<string, FieldValue> = {};
  const apagar: string[] = [];
  const mudou: { def: FieldDef; from: FieldValue | undefined; to: FieldValue | null }[] = [];
  for (const id of ids) {
    const def = defs.find((d) => d.id === id);
    if (!def) return { ok: false, message: 'Um dos campos não existe mais.' };
    const p = parseFieldInput(def, raw[id]);
    if (!p.ok) return p;
    if (sameValue(atuais[id], p.value)) continue;
    if (p.value === null) apagar.push(id);
    else gravar[id] = p.value;
    mudou.push({ def, from: atuais[id], to: p.value });
  }
  if (mudou.length === 0) return { ok: true };

  await db.$executeRaw`
    UPDATE "leads"
    SET "fields" = (COALESCE("fields", '{}'::jsonb) - ${apagar}::text[]) || ${JSON.stringify(gravar)}::jsonb,
        "updatedAt" = NOW(),
        "updatedById" = ${actor.userId}
    WHERE "id" = ${leadId} AND "tenantId" = ${actor.tenantId}`;

  if (opts.history !== false) {
    await db.leadActivity.createMany({
      data: mudou.map((m) => ({
        tenantId: actor.tenantId,
        leadId,
        type: 'FIELD_CHANGED' as const,
        actorId: actor.userId,
        data: { fieldId: m.def.id, name: m.def.name, from: formatFieldValue(m.def, m.from), to: formatFieldValue(m.def, m.to) } as Prisma.InputJsonValue,
      })),
    });
  }
  return { ok: true };
}
