'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LOWER_ROW, toothName, UPPER_ROW } from '@/lib/teeth';

/**
 * Escolher os dentes de um item no odontograma (FDI). Abre embaixo do botão;
 * cada dente é um botão liga/desliga. Esc ou clicar fora fecha.
 */
export function ToothPicker({ value, onChange, itemName }: { value: number[]; onChange: (teeth: number[]) => void; itemName: string }) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node) && !botao.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const tem = new Set(value);
  const alternar = (n: number) => onChange(tem.has(n) ? value.filter((x) => x !== n) : [...value, n]);
  const linha = (dentes: number[], titulo: string) => (
    <div role="group" aria-label={titulo} className="flex justify-center gap-0.5">
      {dentes.map((n, i) => (
        <button
          key={n}
          type="button"
          aria-pressed={tem.has(n)}
          aria-label={toothName(n)}
          title={toothName(n)}
          onClick={() => alternar(n)}
          className={`h-8 w-7 rounded-md border text-[11px] font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${i === 8 ? 'ml-2' : ''} ${tem.has(n) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/60'}`}
        >
          {n}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={`${id}-odonto`}
        className={`inline-flex h-9 items-center gap-1 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${value.length ? 'border-primary/60 bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-surface-alt'}`}
      >
<span aria-hidden="true">🦷</span> {value.length ? `${value.length} ${value.length === 1 ? 'dente' : 'dentes'}` : 'Dentes'}
        <span className="sr-only"> de {itemName || 'item'}</span>
      </button>
      {aberto && (
        <div
          id={`${id}-odonto`}
          ref={caixa}
          role="dialog"
          aria-label={`Dentes de ${itemName || 'item'}`}
          className="absolute right-0 z-30 mt-1 w-[min(92vw,520px)] rounded-xl border border-border bg-surface p-3 shadow-xl"
        >
          <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Superior</p>
          {linha(UPPER_ROW, 'Arcada superior')}
          <div className="my-2 border-t border-dashed border-border" />
          {linha(LOWER_ROW, 'Arcada inferior')}
          <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Inferior</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <div className="flex gap-1.5">
              <button type="button" onClick={() => onChange([...new Set([...value, ...UPPER_ROW])])} className="btn-ghost btn-sm">
                Toda a superior
              </button>
              <button type="button" onClick={() => onChange([...new Set([...value, ...LOWER_ROW])])} className="btn-ghost btn-sm">
                Toda a inferior
              </button>
              {value.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="btn-ghost btn-sm text-destructive">
                  Limpar
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                botao.current?.focus();
              }}
              className="btn-primary btn-sm"
            >
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
