import {
  CONFIRMATION_BUTTONS,
  CONFIRMATION_PROMPT,
  LEGACY_CONFIRMATION_PROMPT,
  buildAppointmentConfirmationBody,
  buildAppointmentCreatedBody,
  firstName,
  type AppointmentMessageData,
} from '@clinicaiq/whatsapp';

/**
 * Os avisos da agenda pela API oficial: o texto que a clínica escreve (com
 * {nome}, {data}…) vira um modelo da Meta (com {{1}}, {{2}}…). Puro e testado
 * por tabela; quem fala com a Meta e com o banco é `agenda-templates-sync.ts`.
 */

export type AgendaPurpose = 'APPOINTMENT_CREATED' | 'APPOINTMENT_REMINDER';
export const AGENDA_PURPOSES: AgendaPurpose[] = ['APPOINTMENT_CREATED', 'APPOINTMENT_REMINDER'];

/** O começo do nome do modelo na Meta; a versão vai no fim (`dc_lembrete_3`). */
export const AGENDA_TEMPLATE_PREFIX: Record<AgendaPurpose, string> = {
  APPOINTMENT_CREATED: 'dc_agendamento',
  APPOINTMENT_REMINDER: 'dc_lembrete',
};

export const agendaTemplateName = (purpose: AgendaPurpose, version: number) => `${AGENDA_TEMPLATE_PREFIX[purpose]}_${version}`;

/** A versão de um nome nosso (`dc_lembrete_3` → 3), ou null se não for nosso. */
export function agendaTemplateVersion(purpose: AgendaPurpose, name: string): number | null {
  const m = new RegExp(`^${AGENDA_TEMPLATE_PREFIX[purpose]}_(\\d+)$`).exec(name);
  return m ? Number(m[1]) : null;
}

/** Os botões de resposta rápida; o payload é o mesmo id que a agenda já entende. */
export const AGENDA_BUTTONS = CONFIRMATION_BUTTONS.map((b) => ({ payload: b.id, text: b.title }));

export const AGENDA_KEYS = ['nome', 'clinica', 'data', 'hora', 'profissional', 'procedimento'] as const;
export type AgendaKey = (typeof AGENDA_KEYS)[number];

const EXEMPLOS: Record<AgendaKey, string> = {
  nome: 'Ana',
  clinica: 'Clínica Sorriso',
  data: 'quinta-feira, 28/05',
  hora: '14:30',
  profissional: 'Dra. Paula',
  procedimento: 'Limpeza',
};

/** Os textos padrão com as variáveis, como a clínica vê e edita. */
const COM_VARIAVEIS: AppointmentMessageData = {
  patientName: '{nome}',
  clinicName: '{clinica}',
  professionalName: '{profissional}',
  procedureName: '{procedimento}',
  dateLabel: '{data}',
  timeLabel: '{hora}',
};
export const DEFAULT_AGENDA_TEXT: Record<AgendaPurpose, string> = {
  APPOINTMENT_CREATED: buildAppointmentCreatedBody(COM_VARIAVEIS),
  APPOINTMENT_REMINDER: buildAppointmentConfirmationBody(COM_VARIAVEIS),
};

export type MetaTemplateDraft =
  | { ok: true; body: string; varKeys: AgendaKey[]; examples: string[] }
  | { ok: false; message: string };

const VARIAVEL = /\{(nome|clinica|data|hora|profissional|procedimento)\}/gi;

/**
 * O texto da clínica como modelo da Meta. Cada variável vira {{n}} na ordem em
 * que aparece (repetida, ganha outro número), e a ordem fica em `varKeys`.
 * Confere as regras da Meta que dá para conferir antes de mandar.
 */
export function toMetaTemplate(text: string): MetaTemplateDraft {
  // A Meta recusa linhas em branco demais seguidas.
  const limpo = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!limpo) return { ok: false, message: 'Escreva o texto da mensagem.' };

  const varKeys: AgendaKey[] = [];
  const body = limpo.replace(VARIAVEL, (_, k: string) => {
    varKeys.push(k.toLowerCase() as AgendaKey);
    return `{{${varKeys.length}}}`;
  });

  if (body.length > 1024) return { ok: false, message: 'O texto passa do tamanho que a Meta aceita (1024 caracteres).' };
  if (/^\{\{/.test(body) || /\}\}$/.test(body)) {
    return { ok: false, message: 'A Meta não aceita começar nem terminar o texto com uma variável como {nome}. Ponha uma palavra antes ou depois.' };
  }
  if (/\}\}\s*\{\{/.test(body)) {
    return { ok: false, message: 'Ponha pelo menos uma palavra entre duas variáveis (a Meta não aceita {data} {hora} coladas).' };
  }
  return { ok: true, body, varKeys, examples: varKeys.map((k) => EXEMPLOS[k]) };
}

/** Um parâmetro como a Meta aceita: sem quebra de linha, sem tab, sem vazio. */
const param = (s: string | null | undefined, fallback: string) => (s ?? '').replace(/\s+/g, ' ').trim() || fallback;

/** Os valores das variáveis, na ordem do modelo. Sem procedimento, vai "consulta". */
export function agendaParams(varKeys: AgendaKey[], d: AppointmentMessageData): string[] {
  const valor: Record<AgendaKey, string> = {
    nome: param(firstName(d.patientName), 'paciente'),
    clinica: param(d.clinicName, 'clínica'),
    data: param(d.dateLabel, '-'),
    hora: param(d.timeLabel, '-'),
    profissional: param(d.professionalName, 'equipe'),
    procedimento: param(d.procedureName, 'consulta'),
  };
  return varKeys.map((k) => valor[k]);
}

/** O texto que o paciente recebe, para guardar no histórico. */
export function fillMetaBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n: string) => params[Number(n) - 1] ?? m);
}

/** Texto salvo com o antigo "responda 1 ou 2" passa a apontar para os botões. */
export const withButtonPrompt = (text: string) => text.split(LEGACY_CONFIRMATION_PROMPT).join(CONFIRMATION_PROMPT);

/** O texto da clínica para um propósito: o que ela escreveu, ou o padrão. */
export const agendaText = (purpose: AgendaPurpose, custom: string | null | undefined) =>
  custom?.trim() ? withButtonPrompt(custom.trim()) : DEFAULT_AGENDA_TEXT[purpose];

/** `varKeys` vindo do banco (jsonb), conferido. */
export function readVarKeys(raw: unknown): AgendaKey[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.every((k) => (AGENDA_KEYS as readonly string[]).includes(k)) ? (raw as AgendaKey[]) : null;
}
