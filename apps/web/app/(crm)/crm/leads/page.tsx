import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireCrm } from '@/crm/guard';
import {
  countLeads,
  effectiveStatus,
  LIST_PAGE_SIZE,
  loadLeadList,
  parseFilters,
  parseListParams,
  statusWhere,
  tagCounts,
  type ListStatus,
} from '@/crm/board-data';
import { can } from '@/lib/permissions';
import { clinicToday } from '@/lib/tz';
import { loadCrmBasics } from '@/crm/page-data';
import { COLUMNS_COOKIE, parseColumns } from '@/crm/list-columns';
import { hasPeriod } from '@/crm/period';
import { CrmToolbar } from '../_components/toolbar';
import { LeadTable } from './_components/lead-table';

export const metadata = { title: 'Leads · DreamClin' };

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
  const { status: pedida, order, page } = parseListParams(sp);
  const status = effectiveStatus(pedida, filters);
  const porFechamento = filters.periodo.field === 'fechado' && hasPeriod(filters.periodo);
  const [basics, leads, total, counts, jar] = await Promise.all([
    loadCrmBasics(ctx),
    loadLeadList(ctx, filters, status, order, new Date(), page),
    countLeads(ctx, filters, statusWhere(status)),
    tagCounts(ctx),
    cookies(),
  ]);
  const colunas = parseColumns(jar.get(COLUMNS_COOKIE)?.value, basics.fields.map((f) => f.id));

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

  const mostraFechado = status !== 'abertos';

  return (
    <div className="flex h-full flex-col gap-4 pb-6">
      <CrmToolbar
        view="lista"
        filters={filters}
        tags={basics.tags.map((t) => ({ ...t, count: counts.get(t.id) ?? 0 }))}
        team={basics.team}
        fields={basics.fields}
        procedures={basics.procedures}
        meId={ctx.userId}
        summary={{ count: total, valueCents: leads.reduce((s, l) => s + (l.valueCents ?? 0), 0) }}
        pipelines={basics.pipelines}
        canConfig={can(ctx.role, 'crm_config')}
        today={clinicToday()}
      />

      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6">
        <nav aria-label="Situação" className="segmented">
          {SITUACOES.map((s) => (
            <Link
              key={s.key}
              // Abertos não têm data de fechamento: o período volta a contar pela entrada.
              href={link({ situacao: s.key === 'abertos' ? '' : s.key, pagina: '', ...(s.key === 'abertos' && porFechamento ? { data: '' } : {}) })}
              aria-current={status === s.key ? 'page' : undefined}
              className="segmented-item"
            >
              {s.label}
            </Link>
          ))}
        </nav>
        {porFechamento && status === 'todos' && (
          <p className="text-xs text-muted-foreground">Ganhos e perdidos no período.</p>
        )}
      </div>

      <LeadTable
        rows={leads}
        total={total}
        page={page}
        pageSize={LIST_PAGE_SIZE}
        initialColumns={colunas}
        fields={basics.fields}
        pipelines={basics.pipelines}
        bulk={{ team: basics.team, tags: basics.tags, lostReasons: basics.lostReasons, canDelete: can(ctx.role, 'crm_config') }}
        showClosed={mostraFechado}
        order={order}
        sortHrefs={{
          nome: link({ ordem: 'nome', pagina: '' }),
          etapa: link({ ordem: 'etapa', pagina: '' }),
          valor: link({ ordem: 'valor', pagina: '' }),
          recentes: link({ ordem: '', pagina: '' }),
        }}
        pageHrefs={{
          prev: page > 1 ? link({ pagina: page - 1 > 1 ? String(page - 1) : '' }) : null,
          next: page * LIST_PAGE_SIZE < total ? link({ pagina: String(page + 1) }) : null,
        }}
        caption={`${total} leads ${SITUACOES.find((s) => s.key === status)?.label.toLowerCase() ?? ''}`}
      />
    </div>
  );
}
