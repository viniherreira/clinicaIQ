'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Plus, Search, FileText, FileBarChart, Wallet } from 'lucide-react';
import { QUOTE_STATUS, formatBRL, quoteCode } from './constants';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface QuoteRow {
  id: string;
  number: number;
  status: string;
  total: number;
  paid: number;
  validUntil: Date | string;
  createdAt: Date | string;
  patient: { id: string; name: string };
  _count: { items: number };
}

interface Props {
  quotes: QuoteRow[];
  total: number;
  pages: number;
  currentPage: number;
  search: string;
  status: string;
  totals: { value: number; paid: number; pending: number; accepted: number };
}

export function QuotesView({ quotes, total, pages, currentPage, search, status, totals }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState(search);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  function setParam(updates: Record<string, string | null>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v); else params.delete(k);
    }
    if (resetPage) params.delete('page');
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  function onSearch(v: string) {
    setInput(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setParam({ q: v || null }), 300);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orçamentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} orçamento{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/financeiro" className="btn-ghost btn-md">
            <Wallet className="h-4 w-4" aria-hidden="true" /> Financeiro
          </Link>
          <Link href="/relatorios?type=orcamentos" className="btn-outline btn-md">
            <FileBarChart className="h-4 w-4" aria-hidden="true" /> Relatório
          </Link>
          <Link href="/orcamentos/novo" className="btn-primary btn-md">
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo orçamento
          </Link>
        </div>
      </div>

      {/* Totals for the whole filtered set */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Valor total" value={formatBRL(totals.value)} />
        <Summary label="Recebido" value={formatBRL(totals.paid)} tone="success" href="/financeiro" />
        <Summary label="Em aberto" value={formatBRL(totals.pending)} tone={totals.pending > 0 ? 'warning' : 'muted'} />
        <Summary label="Aprovados" value={String(totals.accepted)} href="/orcamentos?status=ACCEPTED" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={input} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar por paciente..." aria-label="Buscar orçamento por paciente" className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        </div>
        <Select value={status || '__all__'} onValueChange={(v) => setParam({ status: v === '__all__' ? null : v })}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as situações</SelectItem>
            {Object.entries(QUOTE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {isPending && <span aria-live="polite" className="sr-only">Atualizando…</span>}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium">Nenhum orçamento {search || status ? 'encontrado' : 'ainda'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || status ? 'Ajuste a busca ou o filtro.' : 'Crie o primeiro orçamento para um paciente.'}
            </p>
          </div>
        ) : (
          <>
          {/* Mobile: card list */}
          <ul className="divide-y divide-border sm:hidden">
            {quotes.map((q) => {
              const meta = QUOTE_STATUS[q.status] ?? QUOTE_STATUS.DRAFT;
              return (
                <li key={q.id}>
                  <Link
                    href={`/orcamentos/${q.id}`}
                    className="flex items-start justify-between gap-3 p-3 transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0">
                      <span className="font-mono text-xs font-medium text-primary">{quoteCode(q.number)}</span>
                      <span className="block truncate text-sm font-medium text-foreground">{q.patient.name}</span>
                      <span className="mt-1 block">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.bg} ${meta.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
                          {meta.label}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">{formatBRL(q.total)}</span>
                      {q.total > 0 && q.paid >= q.total ? (
                        <span className="block text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Pago</span>
                      ) : q.paid > 0 ? (
                        <span className="block text-xs font-medium text-amber-700 dark:text-amber-400">Parcial · {formatBRL(q.paid)}</span>
                      ) : null}
                      <span className="mt-0.5 block text-xs text-muted-foreground">até {format(new Date(q.validUntil), 'dd/MM/yy')}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Desktop: full table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Lista de orçamentos</caption>
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Nº</th>
                  <th scope="col" className="px-4 py-3 font-medium">Paciente</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">Criado</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">Validade</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Total</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const meta = QUOTE_STATUS[q.status] ?? QUOTE_STATUS.DRAFT;
                  return (
                    <tr key={q.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/orcamentos/${q.id}`} className="font-mono text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded">
                          {quoteCode(q.number)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/orcamentos/${q.id}`} className="font-medium hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded">
                          {q.patient.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {q._count.items} item{q._count.items !== 1 ? 's' : ''} ·{' '}
                          <Link
                            href={`/pacientes/${q.patient.id}`}
                            className="hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            prontuário
                          </Link>
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{format(new Date(q.createdAt), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{format(new Date(q.validUntil), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium tabular-nums">{formatBRL(q.total)}</span>
                        {q.total > 0 && q.paid >= q.total ? (
                          <span className="mt-0.5 block text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Pago</span>
                        ) : q.paid > 0 ? (
                          <span className="mt-0.5 block text-xs font-medium text-amber-700 dark:text-amber-400">
                            Parcial · {formatBRL(q.paid)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.bg} ${meta.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {pages > 1 && (
        <nav aria-label="Paginação" className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {currentPage} de {pages}</span>
          <div className="flex gap-1">
            <button type="button" disabled={currentPage <= 1} onClick={() => setParam({ page: String(currentPage - 1) }, false)} aria-label="Página anterior" className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-alt disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">←</button>
            <button type="button" disabled={currentPage >= pages} onClick={() => setParam({ page: String(currentPage + 1) }, false)} aria-label="Próxima página" className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-alt disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">→</button>
          </div>
        </nav>
      )}
    </div>
  );
}

const SUMMARY_TONE = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  muted: 'text-muted-foreground',
} as const;

function Summary({
  label,
  value,
  tone = 'default',
  href,
}: {
  label: string;
  value: string;
  tone?: keyof typeof SUMMARY_TONE;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tracking-tight tabular-nums ${SUMMARY_TONE[tone]}`}>{value}</p>
    </>
  );
  const cls = 'rounded-xl border border-border bg-surface px-4 py-3 shadow-card';
  return href ? (
    <Link
      href={href}
      className={`${cls} block transition-colors hover:border-primary/40 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
