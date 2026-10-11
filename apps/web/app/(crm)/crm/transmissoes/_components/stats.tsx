import type { BroadcastStats } from '@/crm/broadcasts';

export const BROADCAST_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Rascunho', cls: 'bg-surface-alt text-muted-foreground' },
  SCHEDULED: { label: 'Agendada', cls: 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100' },
  SENDING: { label: 'Enviando', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100' },
  DONE: { label: 'Concluída', cls: 'bg-green-100 text-green-900 dark:bg-green-900/50 dark:text-green-100' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-surface-alt text-muted-foreground' },
};

/** Os números de uma transmissão, com a parte do total quando faz sentido. */
export function StatsGrid({ s }: { s: BroadcastStats }) {
  const base = s.sent || 1;
  const itens: { label: string; value: number; hint?: string }[] = [
    { label: 'Na fila', value: s.waiting },
    { label: 'Enviadas', value: s.sent },
    { label: 'Entregues', value: s.delivered, hint: s.sent ? `${Math.round((s.delivered / base) * 100)}%` : undefined },
    { label: 'Lidas', value: s.read, hint: s.sent ? `${Math.round((s.read / base) * 100)}%` : undefined },
    { label: 'Responderam', value: s.replied, hint: s.sent ? `${Math.round((s.replied / base) * 100)}%` : undefined },
    { label: 'Falharam', value: s.failed },
    { label: 'Puladas', value: s.skipped },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-7">
      {itens.map((i) => (
        <div key={i.label} className="rounded-lg bg-surface-alt/70 px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">{i.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {i.value}
            {i.hint && <span className="ml-1 text-xs font-normal text-muted-foreground">{i.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
