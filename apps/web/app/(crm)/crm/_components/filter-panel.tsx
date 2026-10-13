'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { SOURCE_LABEL } from '@/crm/format';
import type { BoardFilters, BoardPerson, BoardPipeline, BoardStage, CreatedFilter } from '@/crm/types';

export type TagWithCount = { id: string; name: string; color: string; count: number };

/** O que vai para a URL. Chave vazia = sem esse filtro. */
type FilterParams = Record<string, string>;

const CRIADO: { v: CreatedFilter; label: string }[] = [
  { v: '', label: 'A qualquer hora' },
  { v: 'hoje', label: 'Hoje' },
  { v: '7d', label: 'Últimos 7 dias' },
  { v: '30d', label: 'Últimos 30 dias' },
  { v: 'mes', label: 'Este mês' },
];

function toParams(f: BoardFilters, extra: FilterParams = {}): FilterParams {
  return {
    q: f.q,
    resp: f.resp === 'all' ? '' : f.resp,
    tarefa: f.tarefa,
    tag: f.tags.join(','),
    origem: f.origem,
    funil: f.funil,
    etapa: f.etapa,
    criado: f.criado,
    vmin: f.valorMin != null ? String(f.valorMin) : '',
    vmax: f.valorMax != null ? String(f.valorMax) : '',
    ...extra,
  };
}

/** O nome do atalho ativo, que aparece no começo da busca como no Kommo. */
function presetLabel(f: BoardFilters): string {
  const outros = f.q || f.tags.length || f.origem || f.etapa || f.criado || f.valorMin != null || f.valorMax != null ||
    (f.resp !== 'all' && f.resp !== 'me');
  if (outros) return 'Filtro';
  if (f.resp === 'me' && !f.tarefa) return 'Meus leads';
  if (f.tarefa === 'none' && f.resp === 'all') return 'Sem tarefas';
  if (f.tarefa === 'overdue' && f.resp === 'all') return 'Tarefas atrasadas';
  if (f.resp === 'all' && !f.tarefa) return 'Leads ativos';
  return 'Filtro';
}

/**
 * A busca do topo com o painel de filtros do Kommo: atalhos à esquerda
 * (Leads ativos, Meus leads, ganhos, perdidos, sem tarefas, atrasadas), as
 * propriedades do lead no meio e as tags (com quantos leads cada) à direita.
 *
 * Digitar e Enter busca na hora. O painel junta as mudanças e aplica no
 * "Aplicar"; Esc fecha sem mudar nada.
 */
export function FilterSearch({
  view,
  filters,
  tags,
  team,
  stages,
  pipelines,
  canConfig,
  onApply,
}: {
  view: 'quadro' | 'lista';
  filters: BoardFilters;
  tags: TagWithCount[];
  team: BoardPerson[];
  stages: BoardStage[];
  /** Só na lista: escolher o funil. */
  pipelines: BoardPipeline[];
  canConfig: boolean;
  onApply: (params: FilterParams) => void;
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState(filters.q);
  const [rascunho, setRascunho] = useState(filters);
  const [achaTag, setAchaTag] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  // A URL mudou (voltar do navegador, link): o rascunho acompanha.
  useEffect(() => {
    setRascunho(filters);
    setBusca(filters.q);
  }, [filters]);

  // Clique fora fecha; Esc fecha sem aplicar.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setRascunho(filters);
      setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto, filters]);

  const tagsVisiveis = useMemo(() => {
    const t = achaTag.trim().toLowerCase();
    return t ? tags.filter((x) => x.name.toLowerCase().includes(t)) : tags;
  }, [tags, achaTag]);

  const aplicar = (f: BoardFilters, extra: FilterParams = {}) => {
    onApply(toParams(f, extra));
    setAberto(false);
  };
  const vazio: BoardFilters = { ...filters, q: '', resp: 'all', tarefa: '', tags: [], origem: '', etapa: '', criado: '', valorMin: null, valorMax: null };
  const label = presetLabel(filters);

  const presetCls = (ativo: boolean) =>
    `flex w-full items-center gap-2 border-b border-border/60 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${ativo ? 'font-semibold text-link' : ''}`;
  const campo =
    'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';

  return (
    <div ref={caixa} className="relative w-full sm:w-auto sm:min-w-[320px] sm:max-w-xl sm:flex-1">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          aplicar({ ...rascunho, q: busca.trim() });
        }}
        className="flex h-9 items-center gap-2 rounded-md border border-border bg-background pl-1.5 pr-2 focus-within:outline focus-within:outline-2 focus-within:outline-ring"
      >
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={`${id}-painel`}
          className="shrink-0 rounded bg-primary/15 px-2 py-0.5 text-xs font-medium text-link hover:bg-primary/25 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {label}
          <span className="sr-only"> — abrir filtros</span>
        </button>
        <label htmlFor={`${id}-q`} className="sr-only">Pesquisar e filtrar</label>
        <input
          id={`${id}-q`}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => e.key === 'Escape' && setAberto(false)}
          placeholder="Pesquisar e filtrar"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {label !== 'Leads ativos' ? (
          <button
            type="button"
            onClick={() => {
              setBusca('');
              aplicar(vazio);
            }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Limpar filtros</span>
          </button>
        ) : (
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </form>

      {aberto && (
        <div
          id={`${id}-painel`}
          role="dialog"
          aria-label="Filtros"
          className="absolute left-0 top-[calc(100%+6px)] z-50 grid w-[min(92vw,960px)] grid-cols-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl md:grid-cols-[200px_1fr_280px]"
        >
          {/* Atalhos */}
          <nav aria-label="Atalhos" className="border-b border-border md:border-b-0 md:border-r">
            <button type="button" className={presetCls(label === 'Leads ativos')} onClick={() => aplicar(vazio, view === 'lista' ? { situacao: '' } : {})}>
              Leads ativos
            </button>
            <button type="button" className={presetCls(label === 'Meus leads')} onClick={() => aplicar({ ...vazio, resp: 'me' })}>
              Meus leads
            </button>
            <Link href="/crm/leads?situacao=ganhos" className={presetCls(false)}>
              Leads ganhos
            </Link>
            <Link href="/crm/leads?situacao=perdidos" className={presetCls(false)}>
              Leads perdidos
            </Link>
            <button type="button" className={presetCls(label === 'Sem tarefas')} onClick={() => aplicar({ ...vazio, tarefa: 'none' })}>
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> Leads sem tarefas
            </button>
            <button type="button" className={presetCls(label === 'Tarefas atrasadas')} onClick={() => aplicar({ ...vazio, tarefa: 'overdue' })}>
              <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> Leads com tarefas atrasadas
            </button>
          </nav>

          {/* Propriedades */}
          <fieldset className="space-y-2 border-b border-border p-3 md:border-b-0 md:border-r">
            <legend className="mb-1 px-0 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Propriedades do lead</legend>
            <label className="sr-only" htmlFor={`${id}-nome`}>Nome ou telefone</label>
            <input
              id={`${id}-nome`}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do lead ou telefone"
              className={campo}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select label="Criado" id={`${id}-criado`} value={rascunho.criado} onChange={(v) => setRascunho({ ...rascunho, criado: v as CreatedFilter })}>
                {CRIADO.map((c) => (
                  <option key={c.v} value={c.v}>{c.v ? `Criado: ${c.label}` : c.label}</option>
                ))}
              </Select>
              <Select label="Etapa" id={`${id}-etapa`} value={rascunho.etapa} onChange={(v) => setRascunho({ ...rascunho, etapa: v })}>
                <option value="">Etapas ativas</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              {pipelines.length > 1 && (
                <Select label="Funil" id={`${id}-funil`} value={rascunho.funil} onChange={(v) => setRascunho({ ...rascunho, funil: v, etapa: '' })}>
                  <option value="">Todos os funis</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              )}
              <Select label="Origem" id={`${id}-origem`} value={rascunho.origem} onChange={(v) => setRascunho({ ...rascunho, origem: v })}>
                <option value="">Origem: todas</option>
                {Object.entries(SOURCE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
              <Select label="Responsável" id={`${id}-resp`} value={rascunho.resp === 'all' ? '' : rascunho.resp} onChange={(v) => setRascunho({ ...rascunho, resp: v || 'all' })}>
                <option value="">Usuários: todos</option>
                <option value="me">Eu</option>
                {team.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <Select label="Tarefas" id={`${id}-tarefa`} value={rascunho.tarefa} onChange={(v) => setRascunho({ ...rascunho, tarefa: v as BoardFilters['tarefa'] })}>
                <option value="">Tarefas: todas</option>
                <option value="none">Sem tarefa</option>
                <option value="overdue">Atrasadas</option>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-vmin`} className="sr-only">Valor de venda mínimo (R$)</label>
              <input
                id={`${id}-vmin`}
                inputMode="decimal"
                placeholder="Valor de venda"
                value={rascunho.valorMin ?? ''}
                onChange={(e) => setRascunho({ ...rascunho, valorMin: reais(e.target.value) })}
                className={campo}
              />
              <span aria-hidden="true">–</span>
              <label htmlFor={`${id}-vmax`} className="sr-only">Valor de venda máximo (R$)</label>
              <input
                id={`${id}-vmax`}
                inputMode="decimal"
                placeholder="até"
                value={rascunho.valorMax ?? ''}
                onChange={(e) => setRascunho({ ...rascunho, valorMax: reais(e.target.value) })}
                className={campo}
              />
            </div>
          </fieldset>

          {/* Tags */}
          <fieldset className="flex min-h-0 flex-col p-3">
            <div className="flex items-baseline justify-between">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</legend>
              {canConfig && (
                <Link href="/crm/configuracoes?aba=tags" className="text-xs text-link underline-offset-2 hover:underline">
                  Gerenciar
                </Link>
              )}
            </div>
            <label htmlFor={`${id}-acha-tag`} className="sr-only">Localizar tags</label>
            <input
              id={`${id}-acha-tag`}
              value={achaTag}
              onChange={(e) => setAchaTag(e.target.value)}
              placeholder="Localizar tags"
              className={`${campo} mt-2`}
            />
            <ul className="mt-2 flex max-h-72 flex-col items-start gap-1.5 overflow-y-auto pr-1">
              {tagsVisiveis.length === 0 && <li className="text-xs text-muted-foreground">Nenhuma tag.</li>}
              {tagsVisiveis.map((t) => {
                const marcada = rascunho.tags.includes(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      aria-pressed={marcada}
                      onClick={() =>
                        setRascunho({
                          ...rascunho,
                          tags: marcada ? rascunho.tags.filter((x) => x !== t.id) : [...rascunho.tags, t.id],
                        })
                      }
                      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${colorClasses(t.color).chip} ${marcada ? 'ring-2 ring-link' : ''}`}
                    >
                      {t.name}
                      <span className="tabular-nums opacity-75">{t.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-border px-3 py-2.5 md:col-span-3">
            <button
              type="button"
              onClick={() => {
                setBusca('');
                aplicar(vazio);
              }}
              className="btn-ghost btn-sm"
            >
              Limpar
            </button>
            <button type="button" onClick={() => aplicar({ ...rascunho, q: busca.trim() })} className="btn-primary btn-sm">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function reais(v: string): number | null {
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return v.trim() && Number.isFinite(n) && n >= 0 ? n : null;
}

function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        {children}
      </select>
    </>
  );
}
