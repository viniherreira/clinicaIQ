'use client';

import { useId, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { chooseUnitAction } from '@/lib/unit-actions';

export type UnitChoice = { current: string; options: { id: string; name: string }[] };

/** A unidade da agenda, no topo (como no Clínica nas Nuvens). Só aparece com mais de uma. */
export function UnitSwitcher({ units }: { units: UnitChoice }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1.5">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">Unidade</label>
      <select
        id={id}
        value={units.current}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          start(async () => {
            const r = await chooseUnitAction(v);
            if (r.ok) router.refresh();
          });
        }}
        className="h-9 max-w-[11rem] rounded-lg border border-border bg-surface px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-60"
      >
        {units.options.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
    </div>
  );
}
