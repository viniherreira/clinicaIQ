'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { formatFieldValue, type FieldDef } from '@/crm/custom-fields';
import { formatCents, formatDue, SOURCE_LABEL } from '@/crm/format';
import { BASE_COLUMNS, COLUMNS_COOKIE, fieldColumn, serializeColumns } from '@/crm/list-columns';
import type { BoardLead } from '@/crm/types';
import { instantDateBR } from '@/lib/tz';

export type ListRow = BoardLead & { stageName: string; pipelineId: string };
type SortKey = 'nome' | 'etapa' | 'valor' | 'recentes';

/**
 * A lista de leads em tabela, como no Kommo: colunas escolhidas por pessoa
 * (cookie), ordenação pelo cabeçalho e páginas de 100. A seleção para ações
 * em massa entra aqui também.
 */
export function LeadTable({
  rows,
  total,
  page,
  pageSize,
  initialColumns,
  fields,
  pipelines,
  showClosed,
  order,
  sortHrefs,
  pageHrefs,
  caption,
}: {
  rows: ListRow[];
  total: number;
  page: number;
  pageSize: number;
  initialColumns: string[];
  fields: FieldDef[];
  pipelines: { id: string; name: string }[];
  showClosed: boolean;
  order: SortKey;
  sortHrefs: Record<SortKey, string>;
  pageHrefs: { prev: string | null; next: string | null };
  caption: string;
}) {
  const [colunas, setColunas] = useState(initialColumns);
  const visivel = (k: string) => colunas.includes(k);
  const nomeFunil = new Map(pipelines.map((p) => [p.id, p.name]));
  const camposVisiveis = fields.filter((f) => visivel(fieldColumn(f.id)));
  const primeira = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const ultima = Math.min(total, page * pageSize);
  const paginas = Math.max(1, Math.ceil(total / pageSize));

  const escolher = (cols: string[]) => {
    setColunas(cols);
    document.cookie = `${COLUMNS_COOKIE}=${serializeColumns(cols)}; path=/; max-age=31536000; samesite=lax`;
  };

  const Th = ({ label, by }: { label: string; by?: SortKey }) => (
    <th
      scope="col"
      aria-sort={by && order === by ? (by === 'valor' || by === 'recentes' ? 'descending' : 'ascending') : undefined}
      className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
    >
      {by ? (
        <Link href={sortHrefs[by]} className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {label}
          {order === by && <span aria-hidden="true"> ↓</span>}
        </Link>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="mx-4 rounded-xl border border-border bg-surface sm:mx-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {total === 0 ? 'Nenhum lead' : `${primeira.toLocaleString('pt-BR')}–${ultima.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`}
        </p>
        <ColumnPicker colunas={colunas} fields={fields} onChange={escolher} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border bg-surface-alt/50">
            <tr>
              <Th label="Negócio" by="nome" />
              {visivel('etapa') && <Th label="Etapa" by="etapa" />}
              {visivel('funil') && <Th label="Funil" />}
              {visivel('responsavel') && <Th label="Responsável" />}
              {visivel('valor') && <Th label="Valor" by="valor" />}
              {visivel('proxima') && <Th label="Próxima ação" />}
              {visivel('origem') && <Th label="Origem" />}
              {visivel('tags') && <Th label="Tags" />}
              {camposVisiveis.map((f) => (
                <Th key={f.id} label={f.name} />
              ))}
              {visivel('criado') && <Th label="Criado em" by="recentes" />}
              {showClosed && <Th label="Fechado em" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((l) => (
              <tr key={l.id} className="hover:bg-surface-alt/40">
                <td className="px-3 py-2.5">
                  <Link href={`/crm/leads/${l.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                    {l.title || l.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {l.title ? `${l.name} · ` : ''}
                    {l.phoneMasked}
                  </div>
                </td>
                {visivel('etapa') && <td className="px-3 py-2.5">{l.wonAt ? 'Fechou' : l.lostAt ? 'Perdeu' : l.stageName}</td>}
                {visivel('funil') && <td className="px-3 py-2.5">{nomeFunil.get(l.pipelineId) ?? '—'}</td>}
                {visivel('responsavel') && <td className="px-3 py-2.5">{l.assignee?.name ?? <span className="text-muted-foreground">—</span>}</td>}
                {visivel('valor') && <td className="px-3 py-2.5 tabular-nums">{l.valueCents != null ? formatCents(l.valueCents) : '—'}</td>}
                {visivel('proxima') && (
                  <td className="px-3 py-2.5">
                    {l.wonAt || l.lostAt ? (
                      <span className="text-muted-foreground">—</span>
                    ) : l.task.kind === 'none' ? (
                      <span className="font-medium text-amber-700 dark:text-amber-300">Sem tarefa</span>
                    ) : l.task.kind === 'overdue' ? (
                      <span className="font-medium text-destructive">Atrasada</span>
                    ) : (
                      formatDue(new Date(l.task.dueAt))
                    )}
                  </td>
                )}
                {visivel('origem') && <td className="px-3 py-2.5">{SOURCE_LABEL[l.source] ?? l.source}</td>}
                {visivel('tags') && (
                  <td className="px-3 py-2.5">
                    {l.tags.length ? (
                      <div className="flex flex-wrap gap-1">
                        {l.tags.map((t) => (
                          <span key={t.id} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${colorClasses(t.color).chip}`}>{t.name}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )}
                {camposVisiveis.map((f) => (
                  <td key={f.id} className="px-3 py-2.5">
                    {formatFieldValue(f, l.fields[f.id]) || <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
                {visivel('criado') && <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{instantDateBR(l.createdAt)}</td>}
                {showClosed && (
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {l.wonAt ? instantDateBR(l.wonAt) : l.lostAt ? instantDateBR(l.lostAt) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum lead com esses filtros.</p>}
      {paginas > 1 && (
        <nav aria-label="Páginas da lista" className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm">
          {pageHrefs.prev ? (
            <Link href={pageHrefs.prev} className="btn-ghost btn-sm inline-flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            Página {page} de {paginas}
          </span>
          {pageHrefs.next ? (
            <Link href={pageHrefs.next} className="btn-ghost btn-sm inline-flex items-center gap-1">
              Próxima <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

/** "Colunas": o que aparece na tabela. Fica salvo neste navegador. */
function ColumnPicker({ colunas, fields, onChange }: { colunas: string[]; fields: FieldDef[]; onChange: (c: string[]) => void }) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const opcoes = [...BASE_COLUMNS.map((c) => ({ key: c.key as string, label: c.label })), ...fields.map((f) => ({ key: fieldColumn(f.id), label: f.name }))];

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button type="button" aria-expanded={aberto} aria-controls={`${id}-cols`} onClick={() => setAberto((v) => !v)} className="btn-ghost btn-sm inline-flex items-center gap-1.5">
        <Columns3 className="h-4 w-4" aria-hidden="true" /> Colunas
      </button>
      {aberto && (
        <fieldset id={`${id}-cols`} className="absolute right-0 top-full z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl">
          <legend className="sr-only">Colunas da lista</legend>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Mostrar na lista</p>
          {opcoes.map((o) => (
            <label key={o.key} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={colunas.includes(o.key)}
                onChange={(e) => onChange(e.target.checked ? [...colunas, o.key] : colunas.filter((c) => c !== o.key))}
                className="h-4 w-4 accent-primary"
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
