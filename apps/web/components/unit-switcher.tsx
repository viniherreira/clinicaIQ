'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronDown, MapPin } from 'lucide-react';
import { chooseUnitAction } from '@/lib/unit-actions';
import { shortUnitNames } from '@/lib/unit-rules';

export type UnitChoice = { current: string; options: { id: string; name: string; address: string | null }[] };

/** A unidade da agenda, no topo (como no Clínica nas Nuvens). Só aparece com mais de uma. */
export function UnitSwitcher({ units }: { units: UnitChoice }) {
  const id = useId();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const itens = useRef<(HTMLButtonElement | null)[]>([]);
  const curtos = shortUnitNames(units.options.map((u) => u.name));
  const i = Math.max(0, units.options.findIndex((u) => u.id === units.current));
  const atual = units.options[i];

  useEffect(() => {
    if (!aberto) return;
    itens.current[i]?.focus();
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto, i]);

  const escolher = (unitId: string) => {
    setAberto(false);
    botao.current?.focus();
    if (unitId === units.current) return;
    start(async () => {
      const r = await chooseUnitAction(unitId);
      if (r.ok) router.refresh();
    });
  };

  const teclas = (e: React.KeyboardEvent, n: number) => {
    const total = units.options.length;
    const vai = (k: number) => itens.current[(k + total) % total]?.focus();
    if (e.key === 'ArrowDown') { e.preventDefault(); vai(n + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); vai(n - 1); }
    else if (e.key === 'Home') { e.preventDefault(); vai(0); }
    else if (e.key === 'End') { e.preventDefault(); vai(total - 1); }
    else if (e.key === 'Escape' || e.key === 'Tab') { setAberto(false); if (e.key === 'Escape') botao.current?.focus(); }
  };

  return (
    <div ref={caixa} className="relative">
      <button
        ref={botao}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={`${id}-menu`}
        onClick={() => setAberto((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAberto(true);
          }
        }}
        title={atual?.name}
        className="flex h-10 max-w-[13rem] items-center gap-2 rounded-lg border border-border bg-surface pl-2 pr-2.5 text-left transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-60"
        disabled={pending}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
          <Building2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Unidade</span>
          <span className="block truncate text-sm font-semibold">{pending ? 'Trocando…' : curtos[i]}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {aberto && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label="Escolher a unidade"
          className="absolute right-0 top-full z-50 mt-1.5 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-xl"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">A agenda mostra a unidade escolhida</p>
          {units.options.map((u, n) => {
            const on = u.id === units.current;
            return (
              <button
                key={u.id}
                ref={(el) => {
                  itens.current[n] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                tabIndex={-1}
                onClick={() => escolher(u.id)}
                onKeyDown={(e) => teclas(e, n)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring ${
                  on ? 'bg-primary/10' : 'hover:bg-surface-alt focus:bg-surface-alt'
                }`}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center ${on ? 'text-primary' : 'text-transparent'}`} aria-hidden="true">
                  <Check className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm ${on ? 'font-semibold text-primary' : 'font-medium'}`}>{u.name}</span>
                  {u.address && (
                    <span className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      {u.address}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
