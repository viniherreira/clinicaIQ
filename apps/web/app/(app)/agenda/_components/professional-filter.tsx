'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';

interface Professional {
  id: string;
  name: string;
  specialty?: string | null;
  color: string;
}

interface ProfessionalFilterProps {
  professionals: Professional[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export function ProfessionalFilter({ professionals, selected, onChange }: ProfessionalFilterProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = useMemo(
    () => professionals.filter((p) => p.name.toLowerCase().includes(debounced.toLowerCase())),
    [professionals, debounced],
  );

  const allSelected = professionals.length > 0 && professionals.every((p) => selected.has(p.id));

  function toggleAll() {
    onChange(allSelected ? new Set() : new Set(professionals.map((p) => p.id)));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profissionais</p>

      {professionals.length === 0 ? (
        <p className="rounded-md bg-surface-alt px-3 py-2.5 text-xs text-muted-foreground">
          Nenhum profissional. Adicione em <span className="font-medium text-foreground">Configurações</span>.
        </p>
      ) : (
        <>
          {professionals.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                aria-label="Filtrar profissionais"
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-xs placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-alt">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded accent-primary"
              aria-label="Selecionar todos os profissionais"
            />
            <span className="text-xs font-medium">Todos</span>
          </label>

          <div className="space-y-0.5">
            {filtered.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-surface-alt">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 shrink-0 rounded accent-primary"
                  aria-label={`${p.name}${p.specialty ? `, ${p.specialty}` : ''}`}
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/5" style={{ background: p.color }} aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-medium text-foreground">{p.name}</span>
                  {p.specialty && <span className="truncate text-[10px] text-muted-foreground">{p.specialty}</span>}
                </span>
              </label>
            ))}
            {filtered.length === 0 && <p className="px-1.5 text-xs text-muted-foreground">Nenhum encontrado.</p>}
          </div>
        </>
      )}
    </div>
  );
}
