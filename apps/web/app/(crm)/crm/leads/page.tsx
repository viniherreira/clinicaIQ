import Link from 'next/link';
import { requireCrm } from '@/crm/guard';
import { loadLeadList, parseFilters, parseListParams, type ListOrder, type ListStatus } from '@/crm/board-data';
import { loadCrmBasics } from '@/crm/page-data';
import { colorClasses } from '@/crm/colors';
import { formatCents, formatDue, SOURCE_LABEL } from '@/crm/format';
import { CrmToolbar } from '../_components/toolbar';

export const metadata = { title: 'Leads · ClinicaIQ' };

const SITUACOES: { key: ListStatus; label: string }[] = [
  { key: 'abertos', label: 'Abertos' },
  { key: 'ganhos', label: 'Ganhos' },
  { key: 'perdidos', label: 'Perdidos' },
  { key: 'todos', label: 'Todos' },
];

/**
 * A mesma informação do quadro em tabela: para quem prefere, para quem usa
 * leitor de tela e para ver ganhos e perdidos, que no quadro não têm coluna.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm');
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const { status, order } = parseListParams(sp);
  const [basics, leads] = await Promise.all([loadCrmBasics(ctx), loadLeadList(ctx, filters, status, order)]);

  const link = (changes: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && v) q.set(k, v);
    for (const [k, v] of Object.entries(changes)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    return s ? `/crm/leads?${s}` : '/crm/leads';
  };

  const Th = ({ label, by }: { label: string; by?: ListOrder }) => (
    <th
      scope="col"
      aria-sort={by && order === by ? (by === 'valor' || by === 'recentes' ? 'descending' : 'ascending') : undefined}
      className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
    >
      {by ? (
        <Link href={link({ ordem: by === 'recentes' ? '' : by })} className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {label}
          {order === by && <span aria-hidden="true"> ↓</span>}
        </Link>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="flex h-full flex-col gap-4 pb-6">
      <CrmToolbar view="lista" filters={filters} tags={basics.tags} team={basics.team} procedures={basics.procedures} meId={ctx.userId} />

      <div className="px-4 sm:px-6">
        <nav aria-label="Situação" className="segmented">
          {SITUACOES.map((s) => (
            <Link key={s.key} href={link({ situacao: s.key === 'abertos' ? '' : s.key })} aria-current={status === s.key ? 'page' : undefined} className="segmented-item">
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mx-4 overflow-x-auto rounded-xl border border-border bg-surface sm:mx-6">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">
            {leads.length} leads {SITUACOES.find((s) => s.key === status)?.label.toLowerCase()}
          </caption>
          <thead className="border-b border-border bg-surface-alt/50">
            <tr>
              <Th label="Negócio" by="nome" />
              <Th label="Etapa" by="etapa" />
              <Th label="Responsável" />
              <Th label="Valor" by="valor" />
              <Th label="Próxima ação" />
              <Th label="Origem" />
              <Th label="Criado" by="recentes" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((l) => (
              <tr key={l.id} className="hover:bg-surface-alt/40">
                <td className="px-3 py-2.5">
                  <Link href={`/crm/leads/${l.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                    {l.title || l.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {l.title ? `${l.name} · ` : ''}
                    {l.phoneMasked}
                  </div>
                  {l.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.tags.map((t) => (
                        <span key={t.id} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${colorClasses(t.color).chip}`}>{t.name}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">{l.wonAt ? 'Fechou' : l.lostAt ? 'Perdeu' : l.stageName}</td>
                <td className="px-3 py-2.5">{l.assignee?.name ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2.5 tabular-nums">{l.valueCents != null ? formatCents(l.valueCents) : '—'}</td>
                <td className="px-3 py-2.5">
                  {l.wonAt || l.lostAt ? (
                    <span className="text-muted-foreground">—</span>
                  ) : l.task.kind === 'none' ? (
                    <span className="font-medium text-amber-700 dark:text-amber-300">Sem tarefa</span>
                  ) : l.task.kind === 'overdue' ? (
                    <span className="font-medium text-destructive">Atrasada</span>
                  ) : (
                    formatDue(new Date(l.task.dueAt))
                  )}
                </td>
                <td className="px-3 py-2.5">{SOURCE_LABEL[l.source] ?? l.source}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{formatDue(new Date(l.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum lead com esses filtros.</p>}
      </div>
    </div>
  );
}
