'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Search, X } from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { formatCents, SOURCE_LABEL } from '@/crm/format';
import { hasPeriod, NO_PERIOD, periodLabel, periodParams } from '@/crm/period';
import type { BoardFilters, BoardPerson, BoardPipeline, BoardStage } from '@/crm/types';
import { PeriodPicker } from '@/components/crm-period-picker';
import { countLeadsAction } from '../actions';
import { fieldFilterParams, type FieldDef } from '@/crm/custom-fields';

export type TagWithCount = { id: string; name: string; color: string; count: number };

/** O que vai para a URL. Chave vazia = sem esse filtro. */
type FilterParams = Record<string, string>;

function toParams(f: BoardFilters, extra: FilterParams = {}): FilterParams {
  return {
    q: f.q,
    resp: f.resp === 'all' ? '' : f.resp,
    tarefa: f.tarefa,
    tag: f.tags.join(','),
    origem: f.origem,
    funil: f.funil,
    etapa: f.etapa,
    ...periodParams(f.periodo),
    vmin: f.valorMin != null ? String(f.valorMin) : '',
    vmax: f.valorMax != null ? String(f.valorMax) : '',
    ...fieldFilterParams(f.campos),
    ...extra,
  };
}

/** O nome do atalho ativo, que aparece no começo da busca como no Kommo. */
function presetLabel(f: BoardFilters): string {
  const outros = f.q || f.tags.length || f.campos.length || f.origem || f.etapa || hasPeriod(f.periodo) || f.valorMin != null || f.valorMax != null ||
    (f.resp !== 'all' && f.resp !== 'me');
  if (outros) return 'Filtro';
  if (f.resp === 'me' && !f.tarefa) return 'Meus leads';
  if (f.tarefa === 'none' && f.resp === 'all') return 'Sem tarefas';
  if (f.tarefa === 'overdue' && f.resp === 'all') return 'Tarefas atrasadas';
  if (f.resp === 'all' && !f.tarefa) return 'Leads ativos';
  return 'Filtro';
}

const reaisCurto = (v: number) => formatCents(Math.round(v * 100)).replace(/,00$/, '');

/** Cada filtro ligado vira uma etiqueta na busca, com o seu "x". */
function chipsFor(
  f: BoardFilters,
  ctx: { tags: TagWithCount[]; team: BoardPerson[]; stages: BoardStage[]; pipelines: BoardPipeline[]; fields: FieldDef[] },
): { key: string; label: string; clear: Partial<BoardFilters> }[] {
  const out: { key: string; label: string; clear: Partial<BoardFilters> }[] = [];
  const atalho = presetLabel(f) !== 'Filtro';
  if (hasPeriod(f.periodo)) out.push({ key: 'periodo', label: periodLabel(f.periodo), clear: { periodo: { ...NO_PERIOD } } });
  if (f.etapa) out.push({ key: 'etapa', label: `Etapa: ${ctx.stages.find((s) => s.id === f.etapa)?.name ?? '-'}`, clear: { etapa: '' } });
  if (f.funil && ctx.pipelines.length > 1) {
    out.push({ key: 'funil', label: `Funil: ${ctx.pipelines.find((p) => p.id === f.funil)?.name ?? '-'}`, clear: { funil: '', etapa: '' } });
  }
  if (f.tags.length) {
    const nome = f.tags.length === 1 ? ctx.tags.find((t) => t.id === f.tags[0])?.name : null;
    out.push({ key: 'tags', label: nome ? `Tag: ${nome}` : `Tags: ${f.tags.length}`, clear: { tags: [] } });
  }
  if (f.origem) out.push({ key: 'origem', label: `Origem: ${SOURCE_LABEL[f.origem] ?? f.origem}`, clear: { origem: '' } });
  for (const c of f.campos) {
    const nome = ctx.fields.find((d) => d.id === c.id)?.name ?? 'Campo';
    out.push({ key: `campo_${c.id}`, label: `${nome}: ${c.value}`, clear: { campos: f.campos.filter((x) => x.id !== c.id) } });
  }
  if (!atalho && f.resp === 'me') out.push({ key: 'resp', label: 'Responsável: eu', clear: { resp: 'all' } });
  if (f.resp !== 'all' && f.resp !== 'me') {
    out.push({ key: 'resp', label: `Responsável: ${ctx.team.find((p) => p.id === f.resp)?.name ?? '-'}`, clear: { resp: 'all' } });
  }
  if (!atalho && f.tarefa) out.push({ key: 'tarefa', label: f.tarefa === 'none' ? 'Sem tarefas' : 'Tarefas atrasadas', clear: { tarefa: '' } });
  if (f.valorMin != null || f.valorMax != null) {
    const v =
      f.valorMin != null && f.valorMax != null
        ? `${reaisCurto(f.valorMin)} a ${reaisCurto(f.valorMax)}`
        : f.valorMin != null
          ? `a partir de ${reaisCurto(f.valorMin)}`
          : `até ${reaisCurto(f.valorMax!)}`;
    out.push({ key: 'valor', label: `Valor: ${v}`, clear: { valorMin: null, valorMax: null } });
  }
  return out;
}

/**
 * A busca do topo com o painel de filtros do Kommo: atalhos à esquerda
 * (Leads ativos, Meus leads, ganhos, perdidos, sem tarefas, atrasadas), as
 * propriedades do lead no meio — com o período por data — e as tags (com
 * quantos leads cada) à direita.
 *
 * Os filtros ligados aparecem como etiquetas na própria busca; o "x" de cada
 * uma tira só aquele. Digitar e Enter busca na hora. O painel junta as
 * mudanças, conta quantos leads vão aparecer e aplica no "Aplicar" — ou leva
 * direto para uma transmissão com esses leads. Esc fecha sem mudar nada.
 */
export function FilterSearch({
  view,
  filters,
  tags,
  team,
  stages,
  pipelines,
  fields = [],
  canConfig,
  today,
  onApply,
  onBroadcast,
}: {
  view: 'quadro' | 'lista';
  filters: BoardFilters;
  tags: TagWithCount[];
  /** Campos personalizados de lista e sim/não (viram filtro). */
  fields?: FieldDef[];
  team: BoardPerson[];
  stages: BoardStage[];
  /** Só na lista: escolher o funil. */
  pipelines: BoardPipeline[];
  canConfig: boolean;
  /** Dia da clínica, para os atalhos do período. */
  today: string;
  onApply: (params: FilterParams) => void;
  /** Abre a transmissão com estes filtros (quem pode configurar o CRM). */
  onBroadcast?: (params: FilterParams) => void;
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState(filters.q);
  const [rascunho, setRascunho] = useState(filters);
  const [achaTag, setAchaTag] = useState('');
  const [conta, setConta] = useState<number | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // A URL mudou (voltar do navegador, link): o rascunho acompanha.
  useEffect(() => {
    setRascunho(filters);
    setBusca(filters.q);
  }, [filters]);

  // Clique fora fecha; Esc fecha sem aplicar. O calendário do período abre
  // num portal: clicar nele não é clicar fora.
  useEffect(() => {
    if (!aberto) return;
    const dentroDeUmPopover = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest('[data-crm-popover]'));
    const fora = (e: MouseEvent) => {
      if (dentroDeUmPopover(e.target)) return;
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dentroDeUmPopover(e.target)) return;
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

  // Quantos leads o rascunho mostra, contado enquanto a pessoa mexe.
  const chaveDaConta = JSON.stringify(toParams({ ...rascunho, q: busca.trim() }));
  useEffect(() => {
    if (!aberto) return;
    setConta(null);
    const t = setTimeout(async () => {
      try {
        const r = await countLeadsAction(JSON.parse(chaveDaConta), view);
        if (r.ok) setConta(r.count);
      } catch {
        // Sem conexão: a contagem fica de fora; o filtro funciona do mesmo jeito.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [aberto, chaveDaConta, view]);

  const tagsVisiveis = useMemo(() => {
    const t = achaTag.trim().toLowerCase();
    const lista = t ? tags.filter((x) => x.name.toLowerCase().includes(t)) : tags;
    // As marcadas sobem: com muitas tags, o que está escolhido fica à vista.
    return [...lista].sort((a, b) => Number(rascunho.tags.includes(b.id)) - Number(rascunho.tags.includes(a.id)));
  }, [tags, achaTag, rascunho.tags]);

  const aplicar = (f: BoardFilters, extra: FilterParams = {}) => {
    onApply(toParams(f, extra));
    setAberto(false);
  };
  const vazio: BoardFilters = {
    ...filters,
    q: '',
    resp: 'all',
    tarefa: '',
    tags: [],
    origem: '',
    etapa: '',
    periodo: { ...NO_PERIOD },
    valorMin: null,
    valorMax: null,
    campos: [],
  };
  const label = presetLabel(filters);
  const chips = chipsFor(filters, { tags, team, stages, pipelines, fields });
  const rascunhoComBusca = { ...rascunho, q: busca.trim() };

  const presetCls = (ativo: boolean) =>
    `flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
      ativo ? 'bg-primary/15 font-semibold text-link' : 'text-foreground'
    }`;
  const campo =
    'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';
  const rotulo = 'block text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

  return (
    <div ref={caixa} className="relative w-full sm:w-auto sm:min-w-[380px] sm:max-w-3xl sm:flex-1">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          aplicar(rascunhoComBusca);
        }}
        className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-background pl-1.5 pr-2 focus-within:outline focus-within:outline-2 focus-within:outline-ring"
      >
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={`${id}-painel`}
          className="shrink-0 rounded bg-primary/15 px-2 py-0.5 text-xs font-medium text-link hover:bg-primary/25 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {label}
          <span className="sr-only">, abrir filtros</span>
        </button>
        {chips.length > 0 && (
          <ul aria-label="Filtros ligados" className="hidden flex-none items-center gap-1 md:flex">
            {chips.slice(0, 2).map((c) => (
              <li key={c.key} className="flex min-w-0 items-center rounded bg-surface-alt pl-2 text-xs text-foreground">
                <span className="max-w-[200px] truncate">{c.label}</span>
                <button
                  type="button"
                  onClick={() => aplicar({ ...filters, q: busca.trim(), ...c.clear })}
                  className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Tirar o filtro {c.label}</span>
                </button>
              </li>
            ))}
            {chips.length > 2 && (
              <li>
                <button
                  type="button"
                  onClick={() => setAberto(true)}
                  className="rounded bg-surface-alt px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  +{chips.length - 2}
                  <span className="sr-only"> filtros: {chips.slice(2).map((c) => c.label).join(', ')}</span>
                </button>
              </li>
            )}
          </ul>
        )}
        <label htmlFor={`${id}-q`} className="sr-only">Pesquisar e filtrar</label>
        <input
          id={`${id}-q`}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => e.key === 'Escape' && setAberto(false)}
          placeholder={chips.length ? 'Pesquisar' : 'Pesquisar e filtrar'}
          className="h-full min-w-[80px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
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
          className="absolute left-0 top-[calc(100%+6px)] z-50 flex max-h-[min(80vh,720px)] w-[min(94vw,1000px)] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[200px_1fr_280px]">
            {/* Atalhos */}
            <nav aria-label="Atalhos" className="space-y-0.5 border-b border-border p-2 md:border-b-0 md:border-r">
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
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" /> Leads sem tarefas
              </button>
              <button type="button" className={presetCls(label === 'Tarefas atrasadas')} onClick={() => aplicar({ ...vazio, tarefa: 'overdue' })}>
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" /> Leads com tarefas atrasadas
              </button>
            </nav>

            {/* Propriedades */}
            <fieldset className="min-w-0 space-y-3 border-b border-border p-4 md:border-b-0 md:border-r">
              <legend className="sr-only">Propriedades do lead</legend>
              <p aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Propriedades do lead</p>
              <div>
                <label className={rotulo} htmlFor={`${id}-nome`}>Nome ou telefone</label>
                <input
                  id={`${id}-nome`}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome do lead, negócio ou (11) 98765-4321"
                  className={`${campo} mt-1`}
                />
              </div>
              <PeriodPicker
                value={rascunho.periodo}
                onChange={(p) => setRascunho({ ...rascunho, periodo: p })}
                today={today}
                label="Período"
                closedHint={view === 'quadro' ? 'Leads fechados não ficam no quadro: o resultado abre na Lista.' : undefined}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <option value="">Todas</option>
                  {Object.entries(SOURCE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
                <Select label="Responsável" id={`${id}-resp`} value={rascunho.resp === 'all' ? '' : rascunho.resp} onChange={(v) => setRascunho({ ...rascunho, resp: v || 'all' })}>
                  <option value="">Todos</option>
                  <option value="me">Eu</option>
                  {team.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                <Select label="Tarefas" id={`${id}-tarefa`} value={rascunho.tarefa} onChange={(v) => setRascunho({ ...rascunho, tarefa: v as BoardFilters['tarefa'] })}>
                  <option value="">Todas</option>
                  <option value="none">Sem tarefa</option>
                  <option value="overdue">Atrasadas</option>
                </Select>
                {fields.map((d) => {
                  const atual = rascunho.campos.find((c) => c.id === d.id)?.value ?? '';
                  const outros = rascunho.campos.filter((c) => c.id !== d.id);
                  return (
                    <Select
                      key={d.id}
                      label={d.name}
                      id={`${id}-campo-${d.id}`}
                      value={atual}
                      onChange={(v) => setRascunho({ ...rascunho, campos: v ? [...outros, { id: d.id, value: v }] : outros })}
                    >
                      <option value="">Todos</option>
                      {(d.type === 'BOOLEAN' ? ['Sim', 'Não'] : d.options).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </Select>
                  );
                })}
              </div>
              <fieldset>
                <legend className={rotulo}>Valor de venda (R$)</legend>
                <div className="mt-1 flex items-center gap-2">
                  <label htmlFor={`${id}-vmin`} className="sr-only">Valor de venda mínimo (R$)</label>
                  <input
                    id={`${id}-vmin`}
                    inputMode="decimal"
                    placeholder="de"
                    value={rascunho.valorMin ?? ''}
                    onChange={(e) => setRascunho({ ...rascunho, valorMin: reais(e.target.value) })}
                    className={campo}
                  />
                  <span aria-hidden="true" className="text-muted-foreground">a</span>
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
            </fieldset>

            {/* Tags */}
            <fieldset className="flex min-h-0 min-w-0 flex-col p-4">
              <legend className="sr-only">Tags</legend>
              <div className="flex items-baseline justify-between">
                <p aria-hidden="true" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tags{rascunho.tags.length > 0 && <span className="ml-1 normal-case text-link">({rascunho.tags.length})</span>}
                </p>
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
              <ul className="mt-2 flex max-h-80 flex-col items-start gap-1.5 overflow-y-auto pr-1">
                {tagsVisiveis.length === 0 && <li className="text-xs text-muted-foreground">Nenhuma tag.</li>}
                {tagsVisiveis.map((t) => {
                  const marcada = rascunho.tags.includes(t.id);
                  return (
                    <li key={t.id} className="max-w-full">
                      <button
                        type="button"
                        aria-pressed={marcada}
                        onClick={() =>
                          setRascunho({
                            ...rascunho,
                            tags: marcada ? rascunho.tags.filter((x) => x !== t.id) : [...rascunho.tags, t.id],
                          })
                        }
                        className={`inline-flex max-w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${colorClasses(t.color).chip} ${marcada ? 'ring-2 ring-link' : ''}`}
                      >
                        <span className="truncate">{t.name}</span>
                        <span className="tabular-nums opacity-75">{t.count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-alt/40 px-4 py-2.5">
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {conta == null ? (
                <span className="text-xs">Contando os leads…</span>
              ) : (
                <>
                  <strong className="font-semibold tabular-nums text-foreground">{conta.toLocaleString('pt-BR')}</strong>{' '}
                  {conta === 1 ? 'lead' : 'leads'} com estes filtros
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
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
              {canConfig && onBroadcast && (
                <button
                  type="button"
                  disabled={conta === 0}
                  onClick={() => {
                    setAberto(false);
                    onBroadcast(toParams(rascunhoComBusca));
                  }}
                  className="btn-outline btn-sm"
                >
                  <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                  Transmissão para estes leads
                </button>
              )}
              <button type="button" onClick={() => aplicar(rascunhoComBusca)} className="btn-primary btn-sm">
                Aplicar
              </button>
            </div>
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
    <div>
      <label htmlFor={id} className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        {children}
      </select>
    </div>
  );
}
