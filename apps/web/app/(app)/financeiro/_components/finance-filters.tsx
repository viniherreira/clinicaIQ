'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface Option { id: string; name: string }

interface Props {
  from: string;
  to: string;
  professionalId: string;
  procedureId: string;
  professionals: Option[];
  procedures: Option[];
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function iso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function FinanceFilters({ from, to, professionalId, procedureId, professionals, procedures }: Props) {
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

  function preset(kind: 'today' | '7d' | 'month' | 'lastMonth') {
    const now = new Date();
    let f: Date;
    let t: Date = now;
    if (kind === 'today') {
      f = now;
    } else if (kind === '7d') {
      f = new Date(now.getTime() - 6 * 86400000);
    } else if (kind === 'month') {
      f = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      t = new Date(now.getFullYear(), now.getMonth(), 0);
    }
    setParams({ from: iso(f), to: iso(t) });
  }

  const isActive = (() => {
    const now = new Date();
    if (from === to && from === iso(now)) return 'today';
    if (from === iso(new Date(now.getTime() - 6 * 86400000)) && to === iso(now)) return '7d';
    if (from === iso(new Date(now.getFullYear(), now.getMonth(), 1)) && to === iso(now)) return 'month';
    if (
      from === iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)) &&
      to === iso(new Date(now.getFullYear(), now.getMonth(), 0))
    ) return 'lastMonth';
    return 'custom';
  })();

  const presets = [
    { k: 'today', l: 'Hoje' },
    { k: '7d', l: '7 dias' },
    { k: 'month', l: 'Este mês' },
    { k: 'lastMonth', l: 'Mês passado' },
  ] as const;

  const dateCls = 'h-9 rounded-md border border-border bg-background px-2.5 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-3 shadow-card sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="segmented" role="group" aria-label="Período rápido">
          {presets.map((p) => (
            <button
              key={p.k}
              type="button"
              onClick={() => preset(p.k)}
              aria-pressed={isActive === p.k}
              className="segmented-item"
            >
              {p.l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setParams({ from: e.target.value })} aria-label="Data inicial" className={dateCls} />
          <span className="text-sm text-muted-foreground">até</span>
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setParams({ to: e.target.value })} aria-label="Data final" className={dateCls} />
        </div>

        {isPending && <span aria-live="polite" className="text-xs text-muted-foreground">Atualizando…</span>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={professionalId || '__all__'} onValueChange={(v) => setParams({ professionalId: v === '__all__' ? null : v })}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar por profissional"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os profissionais</SelectItem>
            {professionals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={procedureId || '__all__'} onValueChange={(v) => setParams({ procedureId: v === '__all__' ? null : v })}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar por procedimento"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os procedimentos</SelectItem>
            {procedures.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
