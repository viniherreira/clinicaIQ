import { CLINIC_TZ } from '@/lib/tz';

/** Formatação do CRM, toda em português e no fuso da clínica. */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const formatCents = (cents: number) => brl.format(Math.round(cents / 100));

export const SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  INDICACAO: 'Indicação',
  INSTAGRAM: 'Instagram',
  SITE: 'Site',
  MANUAL: 'Manual',
  OUTRO: 'Outro',
};

export function initials(name: string): string {
  const partes = name.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

/** Instante real (tarefas) → "hoje 14:00", "amanhã 10:00", "12/10 09:00". */
export function formatDue(due: Date, now: Date = new Date()): string {
  const dia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: CLINIC_TZ, hour: '2-digit', minute: '2-digit' }).format(due);
  const amanha = new Date(now.getTime() + 86_400_000);
  const ontem = new Date(now.getTime() - 86_400_000);
  if (dia(due) === dia(now)) return `hoje ${hora}`;
  if (dia(due) === dia(amanha)) return `amanhã ${hora}`;
  if (dia(due) === dia(ontem)) return `ontem ${hora}`;
  const data = new Intl.DateTimeFormat('pt-BR', { timeZone: CLINIC_TZ, day: '2-digit', month: '2-digit' }).format(due);
  return `${data} ${hora}`;
}

/** Hora de parede gravada em UTC (agenda) → "12/10 09:00". */
export function formatWallDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** "há 3 dias", "há 2 h", "agora". */
export function timeAgo(d: Date, now: Date = new Date()): string {
  const min = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}
