'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, FileBarChart, Printer, Wallet } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { ReportResult, ReportType } from '../actions';

interface Props {
  type: ReportType;
  from: string;
  to: string;
  professionalId: string;
  procedureId: string;
  status: string;
  data: ReportResult;
}

const TYPE_LABELS: Record<ReportType, string> = {
  agendamentos: 'Agendamentos',
  orcamentos: 'Orçamentos',
  recebimentos: 'Recebimentos',
};

const APPT_STATUS = [
  ['SCHEDULED', 'Agendado'], ['CONFIRMED', 'Confirmado'], ['RESCHEDULED', 'Remarcado'],
  ['ATTENDED', 'Compareceu'], ['MISSED', 'Faltou'], ['CANCELLED', 'Cancelado'],
] as const;

const QUOTE_STATUS = [
  ['DRAFT', 'Rascunho'], ['SENT', 'Enviado'], ['VIEWED', 'Visualizado'],
  ['ACCEPTED', 'Aceito'], ['REJECTED', 'Recusado'], ['EXPIRED', 'Expirado'],
] as const;

/** Money columns are right-aligned and get tabular figures. */
function isNumericCol(label: string | undefined) {
  return !!label && label.includes('(R$)');
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function iso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** CSV for pt-BR Excel: semicolon separator + BOM, quotes escaped. */
function toCsv(columns: string[], rows: { cells: string[] }[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [columns.map(esc).join(';'), ...rows.map((r) => r.cells.map(esc).join(';'))];
  return '﻿' + lines.join('\r\n');
}

export function ReportsView({ type, from, to, professionalId, procedureId, status, data }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  function switchType(t: ReportType) {
    // Status values differ per report type — reset it on switch.
    setParams({ type: t, status: null, professionalId: t === 'agendamentos' ? professionalId || null : null });
  }

  function preset(kind: 'today' | '7d' | 'month' | 'lastMonth') {
    const now = new Date();
    let f: Date;
    let t: Date = now;
    if (kind === 'today') f = now;
    else if (kind === '7d') f = new Date(now.getTime() - 6 * 86400000);
    else if (kind === 'month') f = new Date(now.getFullYear(), now.getMonth(), 1);
    else {
      f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      t = new Date(now.getFullYear(), now.getMonth(), 0);
    }
    setParams({ from: iso(f), to: iso(t) });
  }

  function exportCsv() {
    const csv = toCsv(data.columns, data.rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${type}-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusOptions = type === 'agendamentos' ? APPT_STATUS : type === 'orcamentos' ? QUOTE_STATUS : null;
  const dateCls = 'h-9 rounded-md border border-border bg-background px-2.5 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6 lg:p-8 print:p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte o relatório do seu jeito, clique em qualquer linha para abrir o registro e exporte.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/financeiro?from=${from}&to=${to}`} className="btn-ghost btn-md">
            <Wallet className="h-4 w-4" aria-hidden="true" /> Financeiro
          </Link>
          <button type="button" onClick={() => window.print()} className="btn-outline btn-md">
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir
          </button>
          <button type="button" onClick={exportCsv} disabled={data.rows.length === 0} className="btn-primary btn-md">
            <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-3 shadow-card sm:p-4 print:hidden">
        <div className="segmented" role="group" aria-label="Tipo de relatório">
          {(Object.keys(TYPE_LABELS) as ReportType[]).map((t) => (
            <button key={t} type="button" onClick={() => switchType(t)} aria-pressed={type === t} className="segmented-item">
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented" role="group" aria-label="Período rápido">
            <button type="button" onClick={() => preset('today')} className="segmented-item">Hoje</button>
            <button type="button" onClick={() => preset('7d')} className="segmented-item">7 dias</button>
            <button type="button" onClick={() => preset('month')} className="segmented-item">Este mês</button>
            <button type="button" onClick={() => preset('lastMonth')} className="segmented-item">Mês passado</button>
          </div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setParams({ from: e.target.value })} aria-label="Data inicial" className={dateCls} />
            <span className="text-sm text-muted-foreground">até</span>
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setParams({ to: e.target.value })} aria-label="Data final" className={dateCls} />
          </div>
          {isPending && <span aria-live="polite" className="text-xs text-muted-foreground">Atualizando…</span>}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {type === 'agendamentos' && (
            <Select value={professionalId || '__all__'} onValueChange={(v) => setParams({ professionalId: v === '__all__' ? null : v })}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por profissional"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os profissionais</SelectItem>
                {data.filters.professionals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={procedureId || '__all__'} onValueChange={(v) => setParams({ procedureId: v === '__all__' ? null : v })}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por procedimento"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os procedimentos</SelectItem>
              {data.filters.procedures.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {statusOptions && (
            <Select value={status || '__all__'} onValueChange={(v) => setParams({ status: v === '__all__' ? null : v })}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as situações</SelectItem>
                {statusOptions.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-lg font-semibold">Relatório de {TYPE_LABELS[type]}</h1>
        <p className="text-sm">Período: {from.split('-').reverse().join('/')} a {to.split('-').reverse().join('/')}</p>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        {data.summary.map((s) => (
          <div key={s.label} className="min-w-32 flex-1 rounded-xl border border-border bg-surface px-4 py-3 shadow-card sm:flex-none">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Results */}
      <div className="overflow-hidden rounded-lg border border-border print:border-0">
        {data.rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileBarChart className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium">Nenhum registro no período</p>
            <p className="mt-1 text-sm text-muted-foreground">Ajuste o período ou os filtros acima.</p>
            <Link
              href={type === 'agendamentos' ? '/agenda' : type === 'orcamentos' ? '/orcamentos' : '/financeiro'}
              className="btn-outline btn-sm mt-4"
            >
              Ir para {type === 'agendamentos' ? 'a agenda' : type === 'orcamentos' ? 'os orçamentos' : 'o financeiro'}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Relatório de {TYPE_LABELS[type]}</caption>
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-xs text-muted-foreground">
                  {data.columns.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className={`whitespace-nowrap px-4 py-3 font-medium ${isNumericCol(c) ? 'text-right' : ''}`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0 transition-colors hover:bg-surface-alt/60">
                    {row.cells.map((cell, j) => {
                      const numeric = isNumericCol(data.columns[j]);
                      const linkFirst = j === 0 && row.href;
                      return (
                        <td
                          key={j}
                          className={`whitespace-nowrap px-4 py-2.5 ${numeric ? 'text-right tabular-nums' : ''}`}
                        >
                          {linkFirst ? (
                            <Link
                              href={row.href!}
                              className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:text-foreground print:no-underline"
                            >
                              {cell}
                            </Link>
                          ) : (
                            cell
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {data.totals && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface-alt/60 text-sm font-semibold">
                    {data.columns.map((c, j) => (
                      <td
                        key={c}
                        className={`px-4 py-3 ${isNumericCol(c) ? 'text-right tabular-nums' : ''}`}
                      >
                        {j === 0 ? 'Total' : (data.totals?.[j] ?? '')}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground print:hidden">
        {data.rows.length} registro{data.rows.length !== 1 ? 's' : ''} no período · clique no primeiro campo da linha
        para abrir {type === 'agendamentos' ? 'o paciente' : 'o orçamento'} · o CSV abre direto no Excel.
      </p>
    </div>
  );
}
