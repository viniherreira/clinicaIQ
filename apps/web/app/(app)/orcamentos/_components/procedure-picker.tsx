'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Clock, Plus, Search } from 'lucide-react';
import { formatBRL } from './constants';

export interface ProcedureOption {
  id: string;
  name: string;
  basePrice: number;
  allowsDiscount: boolean;
  maxDiscountPercent: number | null;
  durationMinutes?: number;
  internalCode?: string | null;
  category?: string | null;
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Buscar e adicionar procedimento: digita parte do nome (ou o código), as
 * setas escolhem e Enter adiciona. A lista sai separada por categoria, com
 * preço e duração. Combobox no padrão ARIA (o foco fica no campo).
 */
export function ProcedurePicker({ procedures, onPick, onCustom }: { procedures: ProcedureOption[]; onPick: (p: ProcedureOption) => void; onCustom: () => void }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const filtrados = useMemo(() => {
    const termos = semAcento(q).split(/\s+/).filter(Boolean);
    return procedures.filter((p) => {
      const alvo = semAcento(`${p.name} ${p.internalCode ?? ''} ${p.category ?? ''}`);
      return termos.every((t) => alvo.includes(t));
    });
  }, [procedures, q]);

  const grupos = useMemo(() => {
    const m = new Map<string, ProcedureOption[]>();
    for (const p of filtrados) {
      const g = p.category ?? 'Outros';
      m.set(g, [...(m.get(g) ?? []), p]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === 'Outros' ? 1 : b === 'Outros' ? -1 : a.localeCompare(b, 'pt-BR')));
  }, [filtrados]);
  const ordem = grupos.flatMap(([, ps]) => ps);

  const escolher = (p: ProcedureOption) => {
    onPick(p);
    setQ('');
    setAtivo(0);
    // Fecha para mostrar o item que entrou; digitar de novo reabre.
    setAberto(false);
    input.current?.focus();
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-label="Adicionar procedimento"
            aria-expanded={aberto}
            aria-controls={`${id}-lista`}
            aria-autocomplete="list"
            aria-activedescendant={aberto && ordem[ativo] ? `${id}-op-${ordem[ativo].id}` : undefined}
            value={q}
            placeholder="Buscar procedimento pelo nome ou código…"
            onChange={(e) => {
              setQ(e.target.value);
              setAtivo(0);
              setAberto(true);
            }}
            onFocus={() => setAberto(true)}
            onClick={() => setAberto(true)}
            onBlur={() => setTimeout(() => setAberto(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAberto(true);
                setAtivo((a) => Math.min(a + 1, ordem.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAtivo((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                // Enter no campo adiciona, nunca envia o orçamento.
                e.preventDefault();
                if (aberto && ordem[ativo]) escolher(ordem[ativo]);
              } else if (e.key === 'Escape') {
                setAberto(false);
              }
            }}
            className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
        <button
          type="button"
          onClick={onCustom}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Item avulso
        </button>
      </div>

      {aberto && (
        <div
          id={`${id}-lista`}
          role="listbox"
          aria-label="Procedimentos"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl"
        >
          {ordem.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {procedures.length === 0 ? 'Nenhum procedimento cadastrado. Use "Item avulso" ou cadastre em Procedimentos.' : 'Nenhum procedimento com esse nome.'}
            </p>
          )}
          {grupos.map(([grupo, ps]) => (
            <div key={grupo} role="group" aria-label={grupo}>
              {grupos.length > 1 && (
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" aria-hidden="true">
                  {grupo}
                </p>
              )}
              {ps.map((p) => {
                const i = ordem.indexOf(p);
                return (
                  <div
                    key={p.id}
                    id={`${id}-op-${p.id}`}
                    role="option"
                    // O foco fica no campo (aria-activedescendant); -1 só deixa a opção focável por script.
                    tabIndex={-1}
                    aria-selected={i === ativo}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      escolher(p);
                    }}
                    onMouseEnter={() => setAtivo(i)}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${i === ativo ? 'bg-primary/10' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {p.internalCode && <span>Cód. {p.internalCode}</span>}
                        {p.durationMinutes ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" aria-hidden="true" /> {p.durationMinutes} min
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatBRL(p.basePrice)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
