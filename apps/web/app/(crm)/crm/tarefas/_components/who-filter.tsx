'use client';

import { useRouter } from 'next/navigation';
import type { BoardPerson } from '@/crm/types';

/** De quem são as tarefas: minhas (padrão), de todos ou de uma pessoa. */
export function WhoFilter({ value, team }: { value: string; team: BoardPerson[] }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="tarefas-de" className="text-sm text-muted-foreground">Tarefas de</label>
      <select
        id="tarefas-de"
        value={value}
        onChange={(e) => router.replace(e.target.value === 'me' ? '/crm/tarefas' : `/crm/tarefas?de=${e.target.value}`)}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <option value="me">Mim</option>
        <option value="all">Toda a equipe</option>
        {team.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
