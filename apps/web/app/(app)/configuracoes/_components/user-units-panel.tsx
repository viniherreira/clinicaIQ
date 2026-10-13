'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setUserUnits } from '../unit-actions';
import type { TeamMember } from '../actions';

/**
 * Em quais unidades cada pessoa trabalha. Quem não tem nenhuma marcada vê
 * todas; quem tem, só vê a agenda delas (o seletor do topo mostra só essas).
 * Pacientes, orçamentos e financeiro continuam da clínica toda.
 */
export function UserUnitsPanel({ team, units }: { team: TeamMember[]; units: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const ativos = team.filter((m) => m.active);

  const alternar = (m: TeamMember, unitId: string) => {
    const atual = m.unitIds.length ? m.unitIds : [];
    const proximo = atual.includes(unitId) ? atual.filter((x) => x !== unitId) : [...atual, unitId];
    // Marcar todas é o mesmo que não restringir.
    const salvar = proximo.length === units.length ? [] : proximo;
    start(async () => {
      const r = await setUserUnits(m.id, salvar);
      setAviso(r.ok ? `${m.name}: ${salvar.length ? salvar.map((id) => units.find((u) => u.id === id)?.name).join(', ') : 'todas as unidades'}.` : r.message);
      if (r.ok) router.refresh();
    });
  };

  return (
    <section aria-labelledby="user-units-heading" className="rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 id="user-units-heading" className="text-base font-semibold">Unidades de cada pessoa</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Marque onde cada um trabalha. Sem nenhuma marcada, a pessoa vê a agenda de todas as unidades.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {ativos.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="min-w-[10rem] flex-1 text-sm font-medium">{m.name}</span>
            <div role="group" aria-label={`Unidades de ${m.name}`} className="flex flex-wrap gap-1.5">
              {units.map((u) => {
                const on = m.unitIds.length === 0 || m.unitIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    aria-pressed={on}
                    disabled={pending || (on && m.unitIds.length === 1)}
                    onClick={() => alternar(m.unitIds.length === 0 ? { ...m, unitIds: units.map((x) => x.id) } : m, u.id)}
                    className={`h-8 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed ${
                      on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-surface-alt'
                    }`}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="px-5 pb-3 pt-1 text-sm text-muted-foreground empty:hidden">
        {aviso}
      </p>
    </section>
  );
}
