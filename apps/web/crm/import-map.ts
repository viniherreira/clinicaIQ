import type { LeadSource } from '@clinicaiq/db';
import { normalize } from './bot-engine';
import { parseNumber, type FieldDef } from './custom-fields';
import { normalizeBrazilPhone } from '@/lib/phone';

/**
 * Importar leads de planilha (a exportação do Kommo ou uma planilha da
 * clínica), sem banco — testado em `import-map.test.ts`.
 *
 * O navegador lê o arquivo, adivinha o que é cada coluna (pelos nomes que o
 * Kommo usa em português, inglês e espanhol), a pessoa corrige o que precisar
 * e cada linha vira um `ImportRecord`. O servidor confere tudo de novo antes
 * de gravar (`crm/import.ts`).
 */

export type ImportTarget =
  | 'ignore'
  | 'title'
  | 'name'
  | 'phone'
  | 'email'
  | 'value'
  | 'pipeline'
  | 'stage'
  | 'status'
  | 'responsible'
  | 'tags'
  | 'createdAt'
  | 'closedAt'
  | 'source'
  | 'note'
  | 'lostReason'
  | 'newField'
  | `field:${string}`;

export const TARGETS: { value: ImportTarget; label: string }[] = [
  { value: 'ignore', label: 'Ignorar esta coluna' },
  { value: 'title', label: 'Negócio (título do lead)' },
  { value: 'name', label: 'Pessoa (nome do contato)' },
  { value: 'phone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'value', label: 'Valor' },
  { value: 'pipeline', label: 'Funil' },
  { value: 'stage', label: 'Etapa' },
  { value: 'status', label: 'Situação (ganho/perdido)' },
  { value: 'responsible', label: 'Responsável' },
  { value: 'tags', label: 'Tags' },
  { value: 'createdAt', label: 'Criado em' },
  { value: 'closedAt', label: 'Fechado em' },
  { value: 'source', label: 'Origem' },
  { value: 'note', label: 'Nota (vai para o histórico)' },
  { value: 'lostReason', label: 'Motivo da perda' },
  { value: 'newField', label: 'Criar campo personalizado' },
];

/** Colunas que podem aparecer mais de uma vez (o Kommo exporta vários telefones e notas). */
const MULTI: ReadonlySet<ImportTarget> = new Set(['phone', 'email', 'tags', 'note']);

type Known = Exclude<ImportTarget, 'ignore' | 'newField' | `field:${string}`>;

/** Nomes de coluna conhecidos, já sem acento e em minúsculas. */
const SINONIMOS: Record<Known, string[]> = {
  title: ['titulo do lead', 'nome do lead', 'lead', 'lead title', 'lead name', 'negocio', 'nome do negocio', 'titulo', 'nombre del lead', 'titulo del lead', 'deal', 'deal name'],
  name: ['contato principal', 'nome do contato', 'contato', 'nome', 'nome completo', 'pessoa', 'paciente', 'cliente', 'contact', 'main contact', 'contact name', 'full name', 'name', 'nombre', 'contacto principal', 'nombre del contacto'],
  phone: ['telefone', 'celular', 'whatsapp', 'telefone comercial', 'telefone celular', 'telefone pessoal', 'phone', 'mobile', 'work phone', 'mobile phone', 'telefono', 'movil', 'celular comercial'],
  email: ['email', 'e mail', 'email comercial', 'email pessoal', 'work email', 'personal email', 'correo', 'correo electronico'],
  value: ['venda', 'valor', 'orcamento', 'valor da venda', 'sale', 'budget', 'price', 'value', 'presupuesto', 'venta', 'importe'],
  pipeline: ['funil', 'funil de vendas', 'pipeline', 'embudo', 'embudo de ventas'],
  stage: ['etapa', 'etapa do lead', 'estagio', 'etapa do funil', 'stage', 'lead stage', 'status do lead', 'etapa del lead'],
  status: ['status', 'situacao', 'resultado', 'estado'],
  responsible: ['usuario responsavel', 'responsavel', 'responsible user', 'responsible', 'owner', 'usuario responsable', 'responsable', 'vendedor'],
  tags: ['tags', 'tag', 'etiquetas', 'lead tags', 'tags do lead'],
  createdAt: ['criado em', 'data de criacao', 'data de criacao do lead', 'created', 'created at', 'date created', 'fecha de creacion', 'creado', 'creado el'],
  closedAt: ['fechado em', 'data de fechamento', 'closed at', 'closing date', 'date closed', 'fecha de cierre', 'cerrado el'],
  source: ['origem', 'fonte', 'origem do lead', 'source', 'lead source', 'fuente', 'utm source'],
  note: ['nota', 'notas', 'observacao', 'observacoes', 'note', 'notes', 'comentario', 'comentarios', 'descricao'],
  lostReason: ['motivo da perda', 'motivo de perda', 'loss reason', 'lost reason', 'motivo de perdida', 'razon de perdida'],
};

/** O que é esta coluna, pelo nome. Campo personalizado com o mesmo nome também conta. */
export function guessTarget(header: string, fields: Pick<FieldDef, 'id' | 'name'>[]): ImportTarget {
  const h = normalize(header);
  if (!h) return 'ignore';
  for (const [alvo, nomes] of Object.entries(SINONIMOS) as [Known, string[]][]) if (nomes.includes(h)) return alvo;
  const campo = fields.find((f) => normalize(f.name) === h);
  if (campo) return `field:${campo.id}`;
  // O Kommo põe o tipo junto: "Telefone (celular)", "Email pessoal do contato".
  if (/\b(telefone|celular|phone|mobile|telefono|whatsapp)\b/.test(h)) return 'phone';
  if (/\b(e ?mail|correo)\b/.test(h)) return 'email';
  if (/\b(nota|notas|note|notes)\b/.test(h)) return 'note';
  return 'newField';
}

/** O palpite para todas as colunas: o que só pode aparecer uma vez fica na primeira; as outras, ignoradas. */
export function guessMapping(headers: string[], fields: Pick<FieldDef, 'id' | 'name'>[]): ImportTarget[] {
  const usados = new Set<ImportTarget>();
  return headers.map((h) => {
    const alvo = guessTarget(h, fields);
    if (alvo === 'newField' || alvo === 'ignore' || MULTI.has(alvo)) return alvo;
    if (usados.has(alvo)) return 'ignore';
    usados.add(alvo);
    return alvo;
  });
}

const GANHO = ['venda ganha', 'ganho', 'ganha', 'fechado ganho', 'fechado ganha', 'fechou', 'closed won', 'won', 'successfully realized', 'realizado com sucesso', 'venta ganada', 'ganado', 'cerrado ganado', 'exito', 'sucesso'];
const PERDIDO = ['venda perdida', 'perdido', 'perdida', 'perdeu', 'fechado perdido', 'fechado perdida', 'closed lost', 'lost', 'unrealized', 'closed not realized', 'nao realizado', 'venta perdida', 'cerrado perdido', 'perdido cerrado'];

/** "Venda ganha", "Closed - won" → won; "Venda perdida", "Closed - lost" → lost. */
export function outcomeOf(texto: string | undefined): 'won' | 'lost' | null {
  const t = normalize(texto ?? '');
  if (!t) return null;
  if (GANHO.includes(t)) return 'won';
  if (PERDIDO.includes(t)) return 'lost';
  return null;
}

/**
 * Data de planilha → instante (ISO), lida como hora de Brasília.
 * Aceita "15.10.2026 14:32:10" (Kommo), "15/10/2026", "2026-10-15 14:32" e ISO completo.
 */
export function parseImportDate(raw: string | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  let a: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  let h = 0,
    mi = 0,
    s = 0;
  if (r) {
    [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
    [h, mi, s] = [Number(r[4] ?? 0), Number(r[5] ?? 0), Number(r[6] ?? 0)];
  } else if ((r = /^(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t))) {
    [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (a < 100) a += 2000;
    [h, mi, s] = [Number(r[4] ?? 0), Number(r[5] ?? 0), Number(r[6] ?? 0)];
  } else return null;
  // Dia que não existe (31/02) ou hora torta: não vale.
  const dia = new Date(Date.UTC(a, m - 1, d));
  if (dia.getUTCFullYear() !== a || dia.getUTCMonth() !== m - 1 || dia.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  // Brasília é UTC-3 o ano inteiro (sem horário de verão desde 2019).
  const dt = new Date(Date.UTC(a, m - 1, d, h + 3, mi, s));
  return dt.toISOString();
}

export function sourceOf(texto: string | undefined): LeadSource | null {
  const t = normalize(texto ?? '');
  if (!t) return null;
  if (/whats/.test(t)) return 'WHATSAPP';
  if (/insta/.test(t)) return 'INSTAGRAM';
  if (/\b(site|website|formulario|form|landing|google)\b/.test(t)) return 'SITE';
  if (/\b(indicacao|indicado|referral|referencia|recomendacao)\b/.test(t)) return 'INDICACAO';
  return 'OUTRO';
}

/** Telefone da planilha → só os números com 55, ou null se não for um celular/fixo brasileiro. */
export function importPhone(raw: string | undefined): string | null {
  const digitos = (raw ?? '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const n = normalizeBrazilPhone(digitos);
  return /^55\d{10,11}$/.test(n) ? n : null;
}

export interface ImportRecord {
  /** Linha da planilha (1 = cabeçalho), para dizer onde está o problema. */
  line: number;
  title: string | null;
  name: string;
  phone: string;
  email: string | null;
  valueCents: number | null;
  pipeline: string | null;
  stage: string | null;
  outcome: 'open' | 'won' | 'lost';
  responsible: string | null;
  tags: string[];
  createdAt: string | null;
  closedAt: string | null;
  source: LeadSource | null;
  notes: string[];
  lostReason: string | null;
  /** `field:<id>` (campo que existe) ou `new:<índice da coluna>` (campo a criar) → texto. */
  fields: Record<string, string>;
}

export interface ImportProblem {
  line: number;
  message: string;
}

/** Cada linha da planilha vira um lead a importar (ou um problema). */
export function buildRecords(rows: string[][], mapping: ImportTarget[]): { records: ImportRecord[]; problems: ImportProblem[] } {
  const records: ImportRecord[] = [];
  const problems: ImportProblem[] = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    const de = (alvo: ImportTarget) =>
      mapping.flatMap((m, j) => (m === alvo ? [(row[j] ?? '').trim()] : [])).filter(Boolean);
    const um = (alvo: ImportTarget) => de(alvo)[0] ?? null;

    const telefones = de('phone').flatMap((t) => t.split(/[,;/]/));
    const phone = telefones.map(importPhone).find(Boolean) ?? null;
    if (!phone) {
      problems.push({ line, message: telefones.length ? `telefone "${telefones[0]}" inválido` : 'sem telefone' });
      return;
    }
    const title = um('title');
    const name = um('name') ?? title ?? 'Lead importado';
    const stage = um('stage');
    const outcome = outcomeOf(um('status') ?? undefined) ?? outcomeOf(stage ?? undefined) ?? 'open';
    const valor = um('value');
    const reais = valor ? parseNumber(valor) : null;
    const fields: Record<string, string> = {};
    mapping.forEach((m, j) => {
      const v = (row[j] ?? '').trim();
      if (!v) return;
      if (m.startsWith('field:')) fields[m] = v;
      if (m === 'newField') fields[`new:${j}`] = v;
    });
    records.push({
      line,
      title: title ? title.slice(0, 120) : null,
      name: name.slice(0, 120),
      phone,
      email: um('email')?.slice(0, 200) ?? null,
      valueCents: reais !== null && reais >= 0 ? Math.round(reais * 100) : null,
      pipeline: um('pipeline')?.slice(0, 40) ?? null,
      // Etapa que é só "ganho/perdido" não é uma etapa do funil.
      stage: stage && !outcomeOf(stage) ? stage.slice(0, 40) : null,
      outcome,
      responsible: um('responsible'),
      tags: [...new Set(de('tags').flatMap((t) => t.split(/[,;]/)).map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 20),
      createdAt: parseImportDate(um('createdAt') ?? undefined),
      closedAt: parseImportDate(um('closedAt') ?? undefined),
      source: sourceOf(um('source') ?? undefined),
      notes: de('note').map((n) => n.slice(0, 2000)),
      lostReason: um('lostReason')?.slice(0, 60) ?? null,
      fields,
    });
  });
  return { records, problems };
}

/** Campo novo a partir dos valores da coluna: lista se tiver até 30 valores diferentes (e repetidos); senão, texto. */
export function guessNewFieldType(values: string[]): { type: 'TEXT' | 'SELECT'; options: string[] } {
  const cheios = values.map((v) => v.trim()).filter(Boolean);
  // A primeira grafia de cada valor é a que fica ("Instagram", não "instagram").
  const primeira = new Map<string, string>();
  for (const v of cheios) if (!primeira.has(normalize(v))) primeira.set(normalize(v), v);
  const distintos = [...primeira.values()];
  if (distintos.length >= 1 && distintos.length <= 30 && cheios.length > distintos.length) {
    return { type: 'SELECT', options: distintos.map((v) => v.slice(0, 60)) };
  }
  return { type: 'TEXT', options: [] };
}
