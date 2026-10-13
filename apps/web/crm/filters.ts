import type { LeadSource } from '@clinicaiq/db';
import type { BoardFilters, CreatedFilter } from './types';

const SOURCES: readonly LeadSource[] = ['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO'];
const CREATED: readonly CreatedFilter[] = ['hoje', '7d', '30d', 'mes'];

/** Lê os filtros da URL, sem confiar em nada que venha dela. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): BoardFilters {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const reais = (k: string) => {
    const n = Number(one(k).replace(',', '.'));
    return one(k) && Number.isFinite(n) && n >= 0 ? Math.min(n, 100_000_000) : null;
  };
  const tarefa = one('tarefa');
  const origem = one('origem');
  const criado = one('criado') as CreatedFilter;
  return {
    q: one('q').trim().slice(0, 80),
    resp: one('resp') || 'all',
    tarefa: tarefa === 'none' || tarefa === 'overdue' ? tarefa : '',
    // Várias tags separadas por vírgula; ids são cuid, o resto é descartado.
    tags: one('tag')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => /^[a-z0-9]{8,40}$/i.test(t))
      .slice(0, 20),
    origem: (SOURCES as readonly string[]).includes(origem) ? origem : '',
    funil: one('funil').slice(0, 40),
    etapa: one('etapa').slice(0, 40),
    criado: CREATED.includes(criado) ? criado : '',
    valorMin: reais('vmin'),
    valorMax: reais('vmax'),
  };
}

/** Começo do período "criado em", no fuso da clínica (Brasília, sem horário de verão). */
export function createdSince(c: CreatedFilter, now: Date = new Date()): Date | null {
  if (!c) return null;
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now); // AAAA-MM-DD
  const meiaNoite = new Date(`${hoje}T00:00:00-03:00`);
  if (c === 'hoje') return meiaNoite;
  if (c === 'mes') return new Date(`${hoje.slice(0, 8)}01T00:00:00-03:00`);
  const dias = c === '7d' ? 6 : 29;
  return new Date(meiaNoite.getTime() - dias * 86_400_000);
}
