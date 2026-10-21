/**
 * O que a clínica escolhe nos avisos da agenda: os botões de cada aviso e em
 * quantos dias antes da consulta sai cada lembrete. Puro e sem dependência do
 * servidor, porque a tela de Configurações usa o mesmo para a prévia.
 */

/** O que cada botão faz na agenda; é também o payload que volta da Meta. */
export type AgendaPayload = 'confirm' | 'reschedule' | 'cancel';

export interface AgendaButton {
  payload: AgendaPayload;
  text: string;
}

/** Os botões possíveis, na ordem em que aparecem na mensagem. */
export const AGENDA_BUTTON_OPTIONS: { payload: AgendaPayload; text: string; faz: string }[] = [
  { payload: 'confirm', text: 'Confirmar', faz: 'confirma na agenda' },
  { payload: 'reschedule', text: 'Reagendar', faz: 'pede outro horário' },
  { payload: 'cancel', text: 'Cancelar', faz: 'desmarca e libera o horário' },
];

export const AGENDA_PAYLOADS: AgendaPayload[] = AGENDA_BUTTON_OPTIONS.map((o) => o.payload);

/** Sem escolha da clínica: Confirmar e Reagendar (como sempre foi). */
export const DEFAULT_AGENDA_BUTTONS: AgendaButton[] = AGENDA_BUTTON_OPTIONS.slice(0, 2).map(({ payload, text }) => ({ payload, text }));

/** A Meta aceita até 25 caracteres no texto do botão. */
export const AGENDA_BUTTON_MAX = 25;

/** Botões vindos do banco (jsonb), conferidos; null se não forem válidos. */
export function readAgendaButtons(raw: unknown): AgendaButton[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AgendaButton[] = [];
  for (const b of raw) {
    const payload = (b as { payload?: unknown })?.payload;
    const text = (b as { text?: unknown })?.text;
    if (typeof payload !== 'string' || !AGENDA_PAYLOADS.includes(payload as AgendaPayload) || typeof text !== 'string') return null;
    out.push({ payload: payload as AgendaPayload, text });
  }
  return out;
}

/** Os botões salvos do aviso, ou os padrão. */
export const agendaButtonsOr = (raw: unknown): AgendaButton[] => readAgendaButtons(raw) ?? DEFAULT_AGENDA_BUTTONS;

export type ButtonsCheck = { ok: true; buttons: AgendaButton[] } | { ok: false; message: string };

/** Confere os botões escolhidos e devolve na ordem da mensagem, com o texto limpo. */
export function checkAgendaButtons(list: AgendaButton[]): ButtonsCheck {
  const vistos = new Set<string>();
  const textos = new Set<string>();
  const limpos: AgendaButton[] = [];
  for (const b of list) {
    if (!AGENDA_PAYLOADS.includes(b.payload) || vistos.has(b.payload)) return { ok: false, message: 'Botão repetido ou desconhecido.' };
    vistos.add(b.payload);
    const text = b.text.replace(/\s+/g, ' ').trim();
    if (!text) return { ok: false, message: 'Escreva o nome de cada botão ligado.' };
    if (text.length > AGENDA_BUTTON_MAX) return { ok: false, message: `O nome do botão "${text}" passa de ${AGENDA_BUTTON_MAX} letras (limite da Meta).` };
    if (textos.has(text.toLowerCase())) return { ok: false, message: 'Dois botões com o mesmo nome. Dê nomes diferentes.' };
    textos.add(text.toLowerCase());
    limpos.push({ payload: b.payload, text });
  }
  limpos.sort((a, b) => AGENDA_PAYLOADS.indexOf(a.payload) - AGENDA_PAYLOADS.indexOf(b.payload));
  return { ok: true, buttons: limpos };
}

export const sameButtons = (a: AgendaButton[], b: AgendaButton[]) =>
  a.length === b.length && a.every((x, i) => x.payload === b[i].payload && x.text === b[i].text);

/** Quando os lembretes podem sair: dias antes da consulta (0 = no dia, de manhã). */
export const REMINDER_DAY_OPTIONS: { days: number; label: string }[] = [
  { days: 7, label: '1 semana antes' },
  { days: 3, label: '3 dias antes' },
  { days: 2, label: '2 dias antes' },
  { days: 1, label: '1 dia antes' },
  { days: 0, label: 'No dia, de manhã' },
];

const DIAS_VALIDOS = REMINDER_DAY_OPTIONS.map((o) => o.days);

/** Os dias salvos, só os que existem, sem repetir, do mais longe para o mais perto. */
export function readReminderDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [1];
  return [...new Set(raw.filter((d): d is number => typeof d === 'number' && DIAS_VALIDOS.includes(d)))].sort((a, b) => b - a);
}

const EXEMPLO: Record<string, string> = {
  nome: 'Ana',
  clinica: 'Clínica Sorriso',
  data: 'quinta-feira, 28/05',
  hora: '14:30',
  profissional: 'Dra. Paula',
  procedimento: 'Limpeza',
};

/** O texto com um paciente de exemplo, para a prévia na tela. */
export const previewAgendaText = (text: string) =>
  text.replace(/\{(nome|clinica|data|hora|profissional|procedimento)\}/gi, (_, k: string) => EXEMPLO[k.toLowerCase()]);
