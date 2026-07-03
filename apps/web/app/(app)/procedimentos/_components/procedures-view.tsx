'use client';

import { useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  getProcedure,
  duplicateProcedure,
  toggleProcedureActive,
  deleteProcedure,
} from '../actions';
import type { ProcedureSort } from '../actions';
import { formatBRL, formatDuration } from './constants';
import { ProcedureModal, type ProcedureModalData } from './procedure-modal';
import { CategoryManager } from './category-manager';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface ProcedureRow {
  id: string;
  name: string;
  color: string | null;
  basePrice: number;
  durationMinutes: number;
  active: boolean;
  category: { id: string; name: string; color: string | null } | null;
}
interface Category {
  id: string;
  name: string;
  color: string | null;
  isDefault: boolean;
  _count: { procedures: number };
}
interface Professional {
  id: string;
  name: string;
  specialty: string | null;
}

interface Props {
  procedures: ProcedureRow[];
  categories: Category[];
  professionals: Professional[];
  total: number;
  pages: number;
  currentPage: number;
  search: string;
  categoryId: string;
  active: string; // '', 'true', 'false'
  sort: ProcedureSort;
  dir: 'asc' | 'desc';
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />Ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />Inativo
    </span>
  );
}

function RowMenu({
  procedure, onEdit, onChanged,
}: {
  procedure: ProcedureRow; onEdit: () => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      setOpen(false);
      setConfirm(false);
      onChanged();
    });
  }

  return (
    <div className="relative">
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-label={`Opções de ${procedure.name}`}
        aria-haspopup="menu" aria-expanded={open}
        className="rounded-md p-1.5 hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
      </button>

      {open && !confirm && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-surface py-1 text-sm shadow-lg">
            <button role="menuitem" type="button" onClick={() => { setOpen(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-alt transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Editar
            </button>
            <button role="menuitem" type="button" disabled={isPending} onClick={() => act(() => duplicateProcedure(procedure.id))} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-alt transition-colors disabled:opacity-50">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
              Duplicar
            </button>
            <button role="menuitem" type="button" disabled={isPending} onClick={() => act(() => toggleProcedureActive(procedure.id))} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-alt transition-colors disabled:opacity-50">
              {procedure.active ? (
                <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18.36 6.64A9 9 0 0 1 20.77 15" /><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68" /><path d="M12 2v4" /><path d="m2 2 20 20" /></svg>Inativar</>
              ) : (
                <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="m9 12 2 2 4-4" /></svg>Ativar</>
              )}
            </button>
            <div className="my-1 border-t border-border" />
            <button role="menuitem" type="button" onClick={() => setConfirm(true)} className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
              Excluir
            </button>
          </div>
        </>
      )}

      {confirm && (
        <>
          <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setConfirm(false)} aria-hidden="true" />
          <div role="alertdialog" aria-modal="true" aria-labelledby={`del-${procedure.id}`} className="fixed left-1/2 top-1/2 z-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h3 id={`del-${procedure.id}`} className="text-sm font-semibold">Excluir procedimento?</h3>
            <p className="mt-1 text-sm text-muted-foreground">&ldquo;{procedure.name}&rdquo; será removido da lista. Agendamentos e orçamentos já criados são preservados.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Cancelar</button>
              <button type="button" disabled={isPending} onClick={() => act(() => deleteProcedure(procedure.id))} className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ProceduresView(props: Props) {
  const { procedures, categories, professionals, total, pages, currentPage, search, categoryId, active, sort, dir } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [inputValue, setInputValue] = useState(search);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProcedureModalData | null | undefined>(null);
  const [catOpen, setCatOpen] = useState(false);

  function setParam(updates: Record<string, string | null>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v); else params.delete(k);
    }
    if (resetPage) params.delete('page');
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  function updateSearch(value: string) {
    setInputValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam({ q: value || null }), 300);
  }

  function toggleSort(col: ProcedureSort) {
    const nextDir = sort === col && dir === 'asc' ? 'desc' : 'asc';
    setParam({ sort: col, dir: nextDir }, false);
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setEditing(undefined); // loading
    setModalOpen(true);
    getProcedure(id).then((p) => {
      if (!p) {
        setModalOpen(false);
        return;
      }
      setEditing({
        id: p.id,
        name: p.name,
        categoryId: p.categoryId,
        description: p.description,
        basePrice: p.basePrice,
        durationMinutes: p.durationMinutes,
        prepTimeMinutes: p.prepTimeMinutes,
        color: p.color,
        internalCode: p.internalCode,
        materials: p.materials,
        allowsDiscount: p.allowsDiscount,
        maxDiscountPercent: p.maxDiscountPercent,
        professionalIds: p.professionalIds,
        linkedCount: p._count.appointments + p._count.quoteItems,
      });
    });
  }

  function onModalSuccess() {
    setModalOpen(false);
    setEditing(null);
    router.refresh();
  }

  function SortHeader({ col, label, className }: { col: ProcedureSort; label: string; className?: string }) {
    const activeSort = sort === col;
    return (
      <th scope="col" className={`px-4 py-3 font-medium ${className ?? ''}`} aria-sort={activeSort ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded">
          {label}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={activeSort ? 'opacity-100' : 'opacity-30'}>
            {activeSort && dir === 'desc' ? <path d="m6 9 6 6 6-6" /> : <path d="m18 15-6-6-6 6" />}
          </svg>
        </button>
      </th>
    );
  }


  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Procedimentos</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => setCatOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Gerenciar categorias
          </button>
          <button type="button" onClick={openCreate} className="touch-target inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <PlusIcon />Adicionar procedimento
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input type="search" value={inputValue} onChange={(e) => updateSearch(e.target.value)} placeholder="Buscar por nome..." aria-label="Buscar procedimento por nome" className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        </div>
        <Select value={categoryId || '__all__'} onValueChange={(v) => setParam({ categoria: v === '__all__' ? null : v })}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrar por categoria"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as categorias</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={active || '__all__'} onValueChange={(v) => setParam({ situacao: v === '__all__' ? null : v })}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as situações</SelectItem>
            <SelectItem value="true">Ativos</SelectItem>
            <SelectItem value="false">Inativos</SelectItem>
          </SelectContent>
        </Select>
        {isPending && <span aria-live="polite" className="sr-only">Atualizando...</span>}
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border overflow-hidden">
        {procedures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mb-4 text-muted-foreground/40"><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></svg>
            <p className="text-sm font-medium text-muted-foreground">Nenhum procedimento encontrado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search || categoryId || active ? 'Ajuste os filtros ou a busca.' : 'Cadastre o primeiro procedimento clicando em "+ Adicionar procedimento".'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Lista de procedimentos — {total} no total</caption>
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-xs text-muted-foreground">
                  <SortHeader col="name" label="Procedimento" />
                  <SortHeader col="durationMinutes" label="Duração" className="hidden sm:table-cell" />
                  <SortHeader col="basePrice" label="Valor" />
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {procedures.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: p.color ?? p.category?.color ?? 'transparent' }} aria-hidden="true" />
                        <div className="min-w-0">
                          <button type="button" onClick={() => openEdit(p.id)} className="truncate text-left font-medium text-foreground hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded">
                            {p.name}
                          </button>
                          <p className="text-xs text-muted-foreground">{p.category?.name ?? 'Sem categoria'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{formatDuration(p.durationMinutes)}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">{formatBRL(p.basePrice)}</td>
                    <td className="px-4 py-3"><StatusBadge active={p.active} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <RowMenu procedure={p} onEdit={() => openEdit(p.id)} onChanged={() => router.refresh()} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {pages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">{total} procedimento{total !== 1 ? 's' : ''}</p>
          <div className="flex items-center gap-1">
            <button type="button" disabled={currentPage <= 1} onClick={() => setParam({ page: String(currentPage - 1) }, false)} aria-label="Página anterior" className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-alt disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">←</button>
            <span className="px-3 py-1.5 text-muted-foreground">{currentPage} / {pages}</span>
            <button type="button" disabled={currentPage >= pages} onClick={() => setParam({ page: String(currentPage + 1) }, false)} aria-label="Próxima página" className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-alt disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">→</button>
          </div>
        </nav>
      )}

      <ProcedureModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSuccess={onModalSuccess}
        categories={categories}
        professionals={professionals}
        procedure={editing}
        loading={editing === undefined}
      />
      <CategoryManager open={catOpen} onClose={() => setCatOpen(false)} categories={categories} />
    </div>
  );
}
