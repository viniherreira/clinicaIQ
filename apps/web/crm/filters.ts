import type { LeadSource } from '@clinicaiq/db';
import { parsePeriod } from './period';
import type { BoardFilters } from './types';

const SOURCES: readonly LeadSource[] = ['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO'];

/** Lê os filtros da URL, sem confiar em nada que venha dela. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): BoardFilters {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const reais = (k: string) => {
    const n = Number(one(k).replace(',', '.'));
    return one(k) && Number.isFinite(n) && n >= 0 ? Math.min(n, 100_000_000) : null;
  };
  const tarefa = one('tarefa');
  const origem = one('origem');
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
    periodo: parsePeriod(sp),
    valorMin: reais('vmin'),
    valorMax: reais('vmax'),
  };
}
