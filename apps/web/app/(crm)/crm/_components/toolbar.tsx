'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { KanbanSquare, List, Plus, Search, X } from 'lucide-react';
import type { BoardFilters, BoardPerson, BoardTag } from '@/crm/types';
import { SOURCE_LABEL } from '@/crm/format';
import { NewLeadModal } from './new-lead-modal';

/**
 * Barra do topo do funil e da lista: alternar Quadro | Lista, buscar,
 * filtros rápidos e "Novo lead". Os filtros moram na URL, então o voltar do
 * navegador e um link copiado mostram a mesma coisa.
 */
export function CrmToolbar({
  view,
  filters,
  tags,
  team,
  procedures,
  meId,
}: {
  view: 'quadro' | 'lista';
  filters: BoardFilters;
  tags: BoardTag[];
  team: BoardPerson[];
  procedures: { id: string; name: string }[];
  meId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState(filters.q);
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState('');

  function setParam(changes: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // A busca espera a pessoa parar de digitar.
  useEffect(() => {
    if (busca === filters.q) return;
    const t = setTimeout(() => setParam({ q: busca.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const chip = (ativo: boolean) =>
    [
      'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      ativo ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-muted-foreground hover:text-foreground',
    ].join(' ');
  const selectCls =
    'h-8 rounded-lg border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  const temFiltro = filters.q || filters.resp !== 'all' || filters.tarefa || filters.tag || filters.origem;

  return (
    <div className="space-y-3 px-4 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{view === 'quadro' ? 'Funil' : 'Leads'}</h1>

        <nav aria-label="Modo de visualização" className="segmented">
          <Link href={`/crm${qs}`} aria-current={view === 'quadro' ? 'page' : undefined} className="segmented-item inline-flex items-center gap-1.5">
            <KanbanSquare className="h-3.5 w-3.5" aria-hidden="true" /> Quadro
          </Link>
          <Link href={`/crm/leads${qs}`} aria-current={view === 'lista' ? 'page' : undefined} className="segmented-item inline-flex items-center gap-1.5">
            <List className="h-3.5 w-3.5" aria-hidden="true" /> Lista
          </Link>
        </nav>

        <div className="flex-1" />

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="crm-busca" className="sr-only">Buscar por nome ou telefone</label>
          <input
            id="crm-busca"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou telefone"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>

        <button type="button" onClick={() => setNovo(true)} className="btn-primary btn-md inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" /> Novo lead
        </button>
      </div>

      <div role="group" aria-label="Filtros" className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={filters.resp === 'me'} className={chip(filters.resp === 'me')} onClick={() => setParam({ resp: filters.resp === 'me' ? '' : 'me' })}>
          Meus leads
        </button>
        <button type="button" aria-pressed={filters.tarefa === 'none'} className={chip(filters.tarefa === 'none')} onClick={() => setParam({ tarefa: filters.tarefa === 'none' ? '' : 'none' })}>
          Sem tarefa
        </button>
        <button type="button" aria-pressed={filters.tarefa === 'overdue'} className={chip(filters.tarefa === 'overdue')} onClick={() => setParam({ tarefa: filters.tarefa === 'overdue' ? '' : 'overdue' })}>
          Atrasadas
        </button>

        <label htmlFor="crm-filtro-resp" className="sr-only">Responsável</label>
        <select id="crm-filtro-resp" className={selectCls} value={filters.resp === 'me' || filters.resp === 'all' ? '' : filters.resp} onChange={(e) => setParam({ resp: e.target.value })}>
          <option value="">Todos os responsáveis</option>
          {team.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {tags.length > 0 && (
          <>
            <label htmlFor="crm-filtro-tag" className="sr-only">Tag</label>
            <select id="crm-filtro-tag" className={selectCls} value={filters.tag} onChange={(e) => setParam({ tag: e.target.value })}>
              <option value="">Todas as tags</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </>
        )}

        <label htmlFor="crm-filtro-origem" className="sr-only">Origem</label>
        <select id="crm-filtro-origem" className={selectCls} value={filters.origem} onChange={(e) => setParam({ origem: e.target.value })}>
          <option value="">Todas as origens</option>
          {Object.entries(SOURCE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {temFiltro && (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              setBusca('');
              router.replace(pathname, { scroll: false });
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpar filtros
          </button>
        )}
      </div>

      <NewLeadModal
        open={novo}
        onClose={() => setNovo(false)}
        onCreated={(msg) => {
          setAviso(msg);
          router.refresh();
        }}
        team={team}
        procedures={procedures}
        meId={meId}
      />
      <p role="status" aria-live="polite" className="sr-only">{aviso}</p>
    </div>
  );
}
