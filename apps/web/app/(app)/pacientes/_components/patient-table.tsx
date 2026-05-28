'use client';

import { useTransition, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { PatientAvatar } from './patient-avatar';
import { PatientStatusBadge } from './patient-status-badge';
import { togglePatientActive, deletePatient } from '../actions';

type Patient = {
  id: string;
  controlNumber: number;
  name: string;
  phone: string;
  email: string | null;
  birthDate: Date | null;
  active: boolean;
};

function calcAge(birthDate: Date | null) {
  if (!birthDate) return '—';
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? `${age} anos` : '—';
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function DropdownMenu({ patient }: { patient: Patient }) {
  const [open, setOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  function handleToggle() {
    startTransition(async () => {
      await togglePatientActive(patient.id);
      setOpen(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deletePatient(patient.id);
      setShowConfirm(false);
      setOpen(false);
    });
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1.5 hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {open && !showConfirm && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-surface shadow-lg py-1 text-sm">
            <Link
              href={`/pacientes/${patient.id}/editar`}
              role="menuitem"
              className="flex items-center gap-2 px-3 py-2 hover:bg-surface-alt transition-colors"
              onClick={() => setOpen(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Editar
            </Link>
            <button
              role="menuitem"
              type="button"
              disabled={isPending}
              onClick={handleToggle}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-alt transition-colors disabled:opacity-50"
            >
              {patient.active ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18.36 6.64A9 9 0 0 1 20.77 15" /><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68" /><path d="M12 2v4" /><path d="m2 2 20 20" /></svg>
                  Inativar
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="m9 12 2 2 4-4" /></svg>
                  Ativar
                </>
              )}
            </button>
            <div className="my-1 border-t border-border" />
            <button
              role="menuitem"
              type="button"
              onClick={() => setShowConfirm(true)}
              className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
              Excluir
            </button>
          </div>
        </>
      )}

      {showConfirm && (
        <>
          <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setShowConfirm(false)} aria-hidden="true" />
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="fixed left-1/2 top-1/2 z-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h3 id="confirm-title" className="text-sm font-semibold">Excluir paciente?</h3>
            <p className="mt-1 text-sm text-muted-foreground">Esta ação remove o paciente da lista. Os dados são mantidos no sistema.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConfirm(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Cancelar
              </button>
              <button type="button" disabled={isPending} onClick={handleDelete} className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">
                {isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PatientTable({
  patients,
  total,
  pages,
  currentPage,
  search,
}: {
  patients: Patient[];
  total: number;
  pages: number;
  currentPage: number;
  search: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [inputValue, setInputValue] = useState(search);

  function updateSearch(value: string) {
    setInputValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set('q', value); else params.delete('q');
      params.delete('page');
      startTransition(() => router.replace(`${pathname}?${params.toString()}`));
    }, 300);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={inputValue}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Buscar por nome..."
            aria-label="Buscar paciente por nome"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
        {isPending && <span aria-live="polite" className="sr-only">Buscando...</span>}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        {patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-muted-foreground/40 mb-4">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-sm font-medium text-muted-foreground">Nenhum paciente encontrado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search ? 'Tente uma busca diferente.' : 'Cadastre o primeiro paciente clicando em "+ Adicionar paciente".'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Lista de pacientes — {total} no total</caption>
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Paciente</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">Idade</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">Telefone</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden lg:table-cell">E-mail</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <PatientAvatar name={patient.name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{patient.name}</p>
                          <p className="text-xs text-muted-foreground">Nº {String(patient.controlNumber).padStart(4, '0')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{calcAge(patient.birthDate)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">{formatPhone(patient.phone)}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell truncate max-w-[180px]">{patient.email ?? '—'}</td>
                    <td className="px-4 py-3"><PatientStatusBadge active={patient.active} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/pacientes/${patient.id}`}
                          aria-label={`Ver detalhes de ${patient.name}`}
                          className="rounded-md p-1.5 hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
                          </svg>
                        </Link>
                        <DropdownMenu patient={patient} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {total} paciente{total !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              aria-label="Página anterior"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-alt disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              ←
            </button>
            <span className="px-3 py-1.5 text-muted-foreground">
              {currentPage} / {pages}
            </span>
            <button
              type="button"
              disabled={currentPage >= pages}
              onClick={() => goToPage(currentPage + 1)}
              aria-label="Próxima página"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-alt disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              →
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
