import { Suspense } from 'react';
import { listProcedures, listProfessionals } from './actions';
import type { ProcedureSort } from './actions';
import { ProceduresView } from './_components/procedures-view';

export const metadata = { title: 'Procedimentos' };

const SORTS: ProcedureSort[] = ['name', 'basePrice', 'durationMinutes'];

async function Content({
  search, categoryId, situacao, sort, dir, page,
}: {
  search: string; categoryId: string; situacao: string; sort: ProcedureSort; dir: 'asc' | 'desc'; page: number;
}) {
  const active = situacao === 'true' ? true : situacao === 'false' ? false : undefined;

  const [{ procedures, total, pages, categories }, professionals] = await Promise.all([
    listProcedures({ search, categoryId: categoryId || undefined, active, sort, dir, page }),
    listProfessionals(),
  ]);

  return (
    <ProceduresView
      procedures={procedures}
      categories={categories}
      professionals={professionals}
      total={total}
      pages={pages}
      currentPage={page}
      search={search}
      categoryId={categoryId}
      active={situacao}
      sort={sort}
      dir={dir}
    />
  );
}

export default async function ProceduresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; situacao?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.q ?? '';
  const categoryId = params.categoria ?? '';
  const situacao = params.situacao ?? '';
  const sort: ProcedureSort = SORTS.includes(params.sort as ProcedureSort) ? (params.sort as ProcedureSort) : 'name';
  const dir: 'asc' | 'desc' = params.dir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(params.page ?? 1));

  return (
    <div className="max-w-7xl p-6 lg:p-8">
      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Carregando...</div>}>
        <Content search={search} categoryId={categoryId} situacao={situacao} sort={sort} dir={dir} page={page} />
      </Suspense>
    </div>
  );
}
