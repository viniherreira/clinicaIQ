import { normalize } from './bot-engine';

/**
 * Campos personalizados do lead (como no Kommo), sem banco — testado em
 * `custom-fields.test.ts`. A definição fica em `LeadField`; o valor, em
 * `Lead.fields` (`{ [fieldId]: valor }`).
 *
 * Valores guardados: texto, número, data `AAAA-MM-DD`, opção (texto), opções
 * (lista de textos) e sim/não (booleano). Vazio não é guardado.
 */

export type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'MULTISELECT' | 'BOOLEAN';
export type FieldValue = string | number | boolean | string[];
export type FieldValues = Record<string, FieldValue>;

export interface FieldDef {
  id: string;
  name: string;
  type: FieldType;
  options: string[];
  showOnCard: boolean;
  active: boolean;
}

export const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: 'TEXT', label: 'Texto' },
  { type: 'NUMBER', label: 'Número' },
  { type: 'DATE', label: 'Data' },
  { type: 'SELECT', label: 'Lista (uma opção)' },
  { type: 'MULTISELECT', label: 'Lista (várias opções)' },
  { type: 'BOOLEAN', label: 'Sim ou não' },
];

export const MAX_FIELDS = 40;
export const MAX_OPTIONS = 100;
/** Campos de lista e sim/não entram nos filtros do funil e da lista. */
export const isFilterable = (t: FieldType) => t === 'SELECT' || t === 'MULTISELECT' || t === 'BOOLEAN';
export const hasOptions = (t: FieldType) => t === 'SELECT' || t === 'MULTISELECT';

/** Opções de uma lista: sem espaço sobrando, sem repetir, até 60 letras cada. */
export function cleanOptions(raw: string[]): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const o of raw) {
    const t = o.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!t || vistas.has(normalize(t))) continue;
    vistas.add(normalize(t));
    out.push(t);
  }
  return out.slice(0, MAX_OPTIONS);
}

/** O que veio do banco (`Lead.fields`), aceitando qualquer coisa e ficando só com o que faz sentido. */
export function readFieldValues(raw: unknown): FieldValues {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: FieldValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = v as string[];
  }
  return out;
}

type Parsed = { ok: true; value: FieldValue | null } | { ok: false; message: string };

/** "1.234,56", "1234.56", 1234.56 → 1234.56. */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let t = raw.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!t) return null;
  // Com vírgula, a vírgula é o decimal e o ponto separa milhar (jeito brasileiro).
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "2026-10-16", "16/10/2026", "16/10/26" → "2026-10-16"; data que não existe → null. */
export function parseDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  let a: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (r) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t))) {
    [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (a < 100) a += 2000;
  } else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseBoolean(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  const t = normalize(String(raw ?? ''));
  if (['sim', 's', 'true', '1', 'yes', 'y', 'x'].includes(t)) return true;
  if (['nao', 'n', 'false', '0', 'no'].includes(t)) return false;
  return null;
}

const opcao = (def: FieldDef, raw: string) => def.options.find((o) => normalize(o) === normalize(raw));

/** Valida e normaliza o que a pessoa (ou a planilha) mandou. `null` = apagar o valor. */
export function parseFieldInput(def: FieldDef, raw: unknown): Parsed {
  const vazio = raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim()) || (Array.isArray(raw) && raw.length === 0);
  if (vazio) return { ok: true, value: null };
  switch (def.type) {
    case 'TEXT': {
      const t = String(raw).trim().slice(0, 1000);
      return { ok: true, value: t };
    }
    case 'NUMBER': {
      const n = parseNumber(raw);
      return n === null ? { ok: false, message: `${def.name}: escreva um número.` } : { ok: true, value: n };
    }
    case 'DATE': {
      const d = parseDate(raw);
      return d === null ? { ok: false, message: `${def.name}: data inválida (use dd/mm/aaaa).` } : { ok: true, value: d };
    }
    case 'SELECT': {
      const o = opcao(def, String(raw));
      return o ? { ok: true, value: o } : { ok: false, message: `${def.name}: "${String(raw)}" não é uma das opções.` };
    }
    case 'MULTISELECT': {
      const itens = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[,;]/);
      const out: string[] = [];
      for (const i of itens.map((x) => x.trim()).filter(Boolean)) {
        const o = opcao(def, i);
        if (!o) return { ok: false, message: `${def.name}: "${i}" não é uma das opções.` };
        if (!out.includes(o)) out.push(o);
      }
      return { ok: true, value: out.length ? out : null };
    }
    case 'BOOLEAN': {
      const b = parseBoolean(raw);
      return b === null ? { ok: false, message: `${def.name}: use sim ou não.` } : { ok: true, value: b };
    }
  }
}

const numeroBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Como o valor aparece na tela e na planilha exportada. */
export function formatFieldValue(def: Pick<FieldDef, 'type'>, value: FieldValue | null | undefined): string {
  if (value === null || value === undefined) return '';
  switch (def.type) {
    case 'NUMBER':
      return typeof value === 'number' ? numeroBR.format(value) : String(value);
    case 'DATE': {
      const d = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
      return d ? `${d[3]}/${d[2]}/${d[1]}` : String(value);
    }
    case 'BOOLEAN':
      return value === true ? 'Sim' : value === false ? 'Não' : String(value);
    case 'MULTISELECT':
      return Array.isArray(value) ? value.join(', ') : String(value);
    default:
      return Array.isArray(value) ? value.join(', ') : String(value);
  }
}

export function sameValue(a: FieldValue | null | undefined, b: FieldValue | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Filtro do Prisma (JSON do Postgres) para um campo de lista ou sim/não.
 * `valor` vem da URL: a opção, ou "sim"/"nao".
 */
export function fieldFilterWhere(def: Pick<FieldDef, 'id' | 'type' | 'options'>, valor: string) {
  if (def.type === 'BOOLEAN') {
    const b = parseBoolean(valor);
    return b === null ? null : { fields: { path: [def.id], equals: b } };
  }
  const o = def.options.find((x) => normalize(x) === normalize(valor));
  if (!o) return null;
  if (def.type === 'SELECT') return { fields: { path: [def.id], equals: o } };
  if (def.type === 'MULTISELECT') return { fields: { path: [def.id], array_contains: [o] } };
  return null;
}

// ─── Filtros na URL (`campo_<id>=valor`) ────────────────────────────────────────

export interface FieldFilter {
  id: string;
  value: string;
}

/** Os filtros de campo da URL. Até 10; id no formato das nossas ids, valor curto. */
export function parseFieldFilters(sp: Record<string, string | string[] | undefined>): FieldFilter[] {
  const out: FieldFilter[] = [];
  for (const [k, v] of Object.entries(sp)) {
    const m = /^campo_([a-z0-9]{8,40})$/i.exec(k);
    if (!m || typeof v !== 'string' || !v.trim()) continue;
    out.push({ id: m[1], value: v.trim().slice(0, 60) });
  }
  return out.slice(0, 10);
}

export const fieldFilterParams = (filters: FieldFilter[]): Record<string, string> =>
  Object.fromEntries(filters.map((f) => [`campo_${f.id}`, f.value]));

/**
 * O filtro do Prisma sem precisar saber o tipo do campo: a opção escolhida
 * (lista), contida na lista (várias opções) ou sim/não. O painel só oferece
 * as opções do próprio campo, então o valor bate com o que foi guardado.
 */
export function anyFieldWhere(f: FieldFilter) {
  const b = parseBoolean(f.value);
  return {
    OR: [
      { fields: { path: [f.id], equals: f.value } },
      { fields: { path: [f.id], array_contains: [f.value] } },
      ...(b === null ? [] : [{ fields: { path: [f.id], equals: b } }]),
    ],
  };
}
