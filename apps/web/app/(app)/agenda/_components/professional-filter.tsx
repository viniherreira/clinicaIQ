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
    () => professionals.filter((p) =>
      p.name.toLowerCase().includes(debounced.toLowerCase())
    ),
    [professionals, debounced]
  );

  const allSelected = professionals.every((p) => selected.has(p.id));

  function toggleAll() {
    if (allSelected) {
      onChange(new Set());
    } else {
      onChange(new Set(professionals.map((p) => p.id)));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Profissionais</p>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar..."
          className="w-full rounded border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
          aria-label="Filtrar profissionais"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="accent-emerald-500 w-3.5 h-3.5"
          aria-label="Selecionar todos os profissionais"
        />
        <span className="text-xs text-slate-600">Todos</span>
      </label>

      <div className="space-y-1">
        {filtered.map((p) => (
          <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
              className="accent-emerald-500 w-3.5 h-3.5 shrink-0"
              aria-label={`${p.name}${p.specialty ? `, ${p.specialty}` : ''}`}
            />
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: p.color }}
              aria-hidden="true"
            />
            <span className="flex flex-col min-w-0">
              <span className="text-xs text-slate-700 truncate">{p.name}</span>
              {p.specialty && (
                <span className="text-[10px] text-slate-400 truncate">{p.specialty}</span>
              )}
            </span>
          </label>
        ))}

        {filtered.length === 0 && (
          <p className="text-xs text-slate-400 px-1">Nenhum profissional encontrado.</p>
        )}
      </div>
    </div>
  );
}
