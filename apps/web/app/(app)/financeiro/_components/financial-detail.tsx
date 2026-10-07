'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, FileBarChart, FileText, Printer } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { ReportResult, ReportType } from '../report-actions';

/**
 * O detalhamento do Financeiro: as linhas por trás dos números do topo.
 *
 * Era a tela de Relatórios, separada — com o mesmo período, os mesmos filtros e
 * a mesma tabela de recebimentos que o Financeiro já mostrava. Duas telas para
 * a mesma pergunta obrigavam a clínica a escolher onde procurar. Agora o resumo
 * fica em cima e o detalhe embaixo, e os filtros do topo valem para os dois.
 */

interface Props {
  type: ReportType;
  status: string;
  from: string;
  to: string;
  data: ReportResult;
}

const TYPE_LABELS: Record<ReportType, string> = {
  recebimentos: 'Recebimentos',
  orcamentos: 'Orçamentos',
  agendamentos: 'Agendamentos',
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

/** CSV for pt-BR Excel: semicolon separator + BOM, quotes escaped. */
function toCsv(columns: string[], rows: { cells: string[] }[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [columns.map(esc).join(';'), ...rows.map((r) => r.cells.map(esc).join(';'))];
  return '﻿' + lines.join('\r\n');
}

export function FinancialDetail({ type, status, from, to, data }: Props) {
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
    startTransition(() => router.replace(`${pathname}?${params.toString()}#detalhe`, { scroll: false }));
  }

  function exportCsv() {
    const csv = toCsv(data.columns, data.rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro-${type}-${from}-a-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusOptions = type === 'agendamentos' ? APPT_STATUS : type === 'orcamentos' ? QUOTE_STATUS : null;
  const comRecibo = data.rows.some((r) => r.receiptHref);

  return (
    <section
      id="detalhe"
      aria-labelledby="detalhe-titulo"
      className="scroll-mt-6 overflow-hidden rounded-xl border border-border bg-surface shadow-card print:border-0 print:shadow-none"
    >
      <div className="space-y-3 border-b border-border px-4 py-4 sm:px-5 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="detalhe-titulo" className="text-sm font-semibold">Detalhamento</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="btn-outline btn-sm">
              <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir
            </button>
            <button type="button" onClick={exportCsv} disabled={data.rows.length === 0} className="btn-primary btn-sm">
              <Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented" role="group" aria-label="O que detalhar">
            {(Object.keys(TYPE_LABELS) as ReportType[]).map((t) => (
              <button
                key={t}
                type="button"
                // A situação muda de significado entre os tipos — zera na troca.
                onClick={() => setParams({ type: t, status: null })}
                aria-pressed={type === t}
                className="segmented-item"
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          {statusOptions && (
            <Select value={status || '__all__'} onValueChange={(v) => setParams({ status: v === '__all__' ? null : v })}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as situações</SelectItem>
                {statusOptions.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isPending && <span aria-live="polite" className="text-xs text-muted-foreground">Atualizando…</span>}
        </div>
      </div>

      {/* Título que só existe no papel: na tela, as abas já dizem o que é. */}
      <div className="hidden px-1 pb-2 print:block">
        <h2 className="text-base font-semibold">{TYPE_LABELS[type]}</h2>
      </div>

      <div className="flex flex-wrap gap-3 px-4 pt-4 sm:px-5 print:px-1">
        {data.summary.map((s) => (
          <div key={s.label} className="min-w-32 flex-1 rounded-lg bg-surface-alt/60 px-3.5 py-2.5 sm:flex-none">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 text-base font-semibold tracking-tight tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="p-4 sm:p-5 print:p-1">
        {data.rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-14 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileBarChart className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium">Nenhum registro no período</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {type === 'recebimentos'
                ? 'Registre o pagamento dentro de um orçamento aprovado e ele aparece aqui.'
                : 'Ajuste o período ou os filtros acima.'}
            </p>
            <Link href={type === 'agendamentos' ? '/agenda' : '/orcamentos'} className="btn-outline btn-sm mt-4">
              Ir para {type === 'agendamentos' ? 'a agenda' : 'os orçamentos'}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border print:border-0">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {TYPE_LABELS[type]} de {from.split('-').reverse().join('/')} a {to.split('-').reverse().join('/')}
              </caption>
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-xs text-muted-foreground">
                  {data.columns.map((c) => (
                    <th key={c} scope="col" className={`whitespace-nowrap px-4 py-3 font-medium ${isNumericCol(c) ? 'text-right' : ''}`}>
                      {c}
                    </th>
                  ))}
                  {comRecibo && (
                    <th scope="col" className="px-4 py-3 text-right font-medium print:hidden">Recibo</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0 transition-colors hover:bg-surface-alt/60">
                    {row.cells.map((cell, j) => (
                      <td key={j} className={`whitespace-nowrap px-4 py-2.5 ${isNumericCol(data.columns[j]) ? 'text-right tabular-nums' : ''}`}>
                        {j === 0 && row.href ? (
                          <Link
                            href={row.href}
                            className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:text-foreground print:no-underline"
                          >
                            {cell}
                          </Link>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                    {comRecibo && (
                      <td className="px-4 py-2.5 text-right print:hidden">
                        {row.receiptHref && (
                          <a
                            href={row.receiptHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Recibo em PDF de ${row.cells[1] ?? 'pagamento'} em ${row.cells[0]}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <FileText className="h-3.5 w-3.5" aria-hidden="true" /> PDF
                          </a>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {data.totals && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface-alt/60 text-sm font-semibold">
                    {data.columns.map((c, j) => (
                      <td key={c} className={`px-4 py-3 ${isNumericCol(c) ? 'text-right tabular-nums' : ''}`}>
                        {j === 0 ? 'Total' : (data.totals?.[j] ?? '')}
                      </td>
                    ))}
                    {comRecibo && <td className="print:hidden" />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground print:hidden">
          {data.rows.length} registro{data.rows.length !== 1 ? 's' : ''} · clique no primeiro campo da linha para abrir{' '}
          {type === 'agendamentos' ? 'o paciente' : type === 'orcamentos' ? 'o orçamento' : 'o orçamento ou o paciente'} · o
          CSV abre direto no Excel.
        </p>
      </div>
    </section>
  );
}
