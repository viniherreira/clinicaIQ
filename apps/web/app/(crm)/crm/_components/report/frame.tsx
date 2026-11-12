'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

/**
 * O topo das telas de números: título, período e filtros numa linha só, acima
 * de tudo o que eles mudam. Ao trocar o período, a tela anterior fica no lugar,
 * mais clara, até a nova chegar: sem piscar e sem pular.
 */
export function ReportFrame({
  title,
  basePath,
  periods,
  period,
  defaultPeriod,
  params = {},
  select,
  refresh,
  updatedAt,
  children,
}: {
  title: string;
  basePath: string;
  periods: { key: string; label: string }[];
  period: string;
  defaultPeriod: string;
  /** Outros filtros que estão valendo, para manter ao trocar o período. */
  params?: Record<string, string>;
  /** Um filtro em lista (ex.: campanha). */
  select?: { name: string; label: string; all: string; value: string; options: { id: string; name: string }[] };
  /** Busca os números de novo (derruba o cache). */
  refresh?: () => Promise<{ ok: true } | { ok: false; message: string }>;
  /** "Atualizado às 14:32". */
  updatedAt?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');

  const ir = (next: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, periodo: period, ...next })) {
      if (v && !(k === 'periodo' && v === defaultPeriod)) q.set(k, v);
    }
    const s = q.toString();
    start(() => router.push(s ? `${basePath}?${s}` : basePath, { scroll: false }));
  };

  const atualizar = () =>
    start(async () => {
      setErro('');
      const r = await refresh!();
      if (!r.ok) return setErro(r.message);
      router.refresh();
    });

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <div role="group" aria-label="Período" className="segmented -mx-1 max-w-full overflow-x-auto">
            {periods.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={p.key === period}
                onClick={() => p.key !== period && ir({ periodo: p.key })}
                className="segmented-item whitespace-nowrap"
              >
                {p.label}
              </button>
            ))}
          </div>
          {select && select.options.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="sr-only sm:not-sr-only">{select.label}</span>
              <select
                value={select.value}
                onChange={(e) => ir({ [select.name]: e.target.value })}
                aria-label={select.label}
                className="h-8 max-w-[14rem] rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <option value="">{select.all}</option>
                {select.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(updatedAt || refresh) && (
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {updatedAt && <span>{updatedAt}</span>}
              {refresh && (
                <button type="button" onClick={atualizar} disabled={pending} className="btn-outline btn-sm">
                  <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
                  Atualizar
                </button>
              )}
            </div>
          )}
        </div>
        {erro && (
          <p role="alert" className="mx-auto mt-2 w-full max-w-[1400px] text-sm text-destructive">
            {erro}
          </p>
        )}
      </div>
      <div
        aria-busy={pending}
        className={`flex-1 bg-board px-4 py-5 transition-opacity duration-200 sm:px-6 ${pending ? 'opacity-60' : ''}`}
      >
        <div className="mx-auto w-full max-w-[1400px] space-y-5">{children}</div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? 'Carregando os números…' : ''}
      </p>
    </div>
  );
}

/** O esqueleto das telas de números, no formato real, para o primeiro carregamento. */
export function ReportSkeleton({ title, tiles = 5 }: { title: string; tiles?: number }) {
  const bloco = 'animate-pulse rounded-xl border border-border/70 bg-surface motion-reduce:animate-none';
  return (
    <div className="flex min-h-full flex-col" aria-busy="true">
      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <span className="h-8 w-72 max-w-[50%] animate-pulse rounded-lg bg-surface-alt motion-reduce:animate-none" />
        </div>
      </div>
      <div className="flex-1 bg-board px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-[1400px] space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: tiles }, (_, i) => (
              <div key={i} className={`${bloco} h-[132px] ${i === 0 ? 'col-span-2' : ''}`} />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-5">
            <div className={`${bloco} h-80 lg:col-span-2`} />
            <div className={`${bloco} h-80 lg:col-span-3`} />
          </div>
          <div className={`${bloco} h-64`} />
        </div>
      </div>
      <p role="status" className="sr-only">
        Carregando os números…
      </p>
    </div>
  );
}
