import { listQuotes } from './actions';
import { QuotesView } from './_components/quotes-view';

export const metadata = { title: 'Orçamentos · ClinicaIQ' };

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { quotes, total, pages, totals } = await listQuotes({ search: sp.q ?? '', status: sp.status, page });

  return (
    <QuotesView
      quotes={quotes}
      total={total}
      pages={pages}
      currentPage={page}
      search={sp.q ?? ''}
      status={sp.status ?? ''}
      totals={totals}
    />
  );
}
