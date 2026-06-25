'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateClinic,
  toggleProfessionalActive,
  deleteProfessional,
  type ClinicFormState,
} from '../actions';
import { ProfessionalModal, type ProfessionalModalData } from './professional-modal';

interface Professional {
  id: string;
  name: string;
  specialty: string | null;
  color: string | null;
  active: boolean;
  _count: { appointments: number };
}
interface Clinic {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
}

interface Props {
  clinic: Clinic;
  professionals: Professional[];
  suggestedColor: string;
}

export function SettingsView({ clinic, professionals, suggestedColor }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie os dados da clínica e a equipe de profissionais.
        </p>
      </header>

      <ClinicSection clinic={clinic} />
      <ProfessionalsSection professionals={professionals} suggestedColor={suggestedColor} />
    </div>
  );
}

// ─── Clinic data ─────────────────────────────────────────────────────────────

function ClinicSection({ clinic }: { clinic: Clinic }) {
  const [state, formAction, pending] = useActionState<ClinicFormState | null, FormData>(
    updateClinic,
    null,
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (state?.success) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state]);

  const errors = state && !state.success ? state.errors : {};
  const err = (k: string) => errors[k]?.[0];
  const inputCls =
    'h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <section aria-labelledby="clinic-heading" className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h2 id="clinic-heading" className="text-base font-semibold">Dados da clínica</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Aparecem nos orçamentos e mensagens.</p>
      </div>
      <form action={formAction} className="space-y-4 p-5">
        <div className="space-y-1.5">
          <label htmlFor="clinic-name" className="text-sm font-medium">
            Nome <span className="text-destructive">*</span>
          </label>
          <input id="clinic-name" name="name" defaultValue={clinic.name} required className={inputCls} aria-invalid={!!err('name')} />
          {err('name') && <p className="text-xs text-destructive">{err('name')}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="clinic-phone" className="text-sm font-medium">Telefone</label>
            <input id="clinic-phone" name="phone" defaultValue={clinic.phone ?? ''} placeholder="(11) 99999-9999" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="clinic-email" className="text-sm font-medium">E-mail</label>
            <input id="clinic-email" name="email" type="email" defaultValue={clinic.email ?? ''} placeholder="contato@clinica.com" className={inputCls} aria-invalid={!!err('email')} />
            {err('email') && <p className="text-xs text-destructive">{err('email')}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="clinic-doc" className="text-sm font-medium">CNPJ</label>
          <input id="clinic-doc" name="document" defaultValue={clinic.document ?? ''} placeholder="00.000.000/0000-00" className={`${inputCls} sm:max-w-xs`} />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pending ? 'Salvando...' : 'Salvar alterações'}
          </button>
          <span aria-live="polite" className="text-sm text-success">
            {saved && '✓ Salvo'}
          </span>
        </div>
      </form>
    </section>
  );
}

// ─── Professionals ───────────────────────────────────────────────────────────

function ProfessionalsSection({
  professionals,
  suggestedColor,
}: {
  professionals: Professional[];
  suggestedColor: string;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProfessionalModalData | null>(null);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(p: Professional) {
    setEditing({ id: p.id, name: p.name, specialty: p.specialty, color: p.color });
    setModalOpen(true);
  }

  return (
    <section aria-labelledby="prof-heading" className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 id="prof-heading" className="text-base font-semibold">Profissionais</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">A equipe que aparece na agenda.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
          Adicionar profissional
        </button>
      </div>

      {professionals.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <p className="text-sm font-medium">Nenhum profissional ainda</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Adicione os dentistas e profissionais da clínica para começar a agendar.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            Adicionar primeiro profissional
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {professionals.map((p) => (
            <ProfessionalRow key={p.id} professional={p} onEdit={() => openEdit(p)} onChanged={() => router.refresh()} />
          ))}
        </ul>
      )}

      <ProfessionalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          router.refresh();
        }}
        professional={editing}
        defaultColor={editing?.color ?? suggestedColor}
      />
    </section>
  );
}

function ProfessionalRow({
  professional,
  onEdit,
  onChanged,
}: {
  professional: Professional;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    startTransition(async () => {
      await toggleProfessionalActive(professional.id);
      onChanged();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteProfessional(professional.id);
      if (!res.ok) {
        setError(res.message ?? 'Não foi possível excluir.');
        setConfirmDelete(false);
        return;
      }
      onChanged();
    });
  }

  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span
        className="h-8 w-8 shrink-0 rounded-full ring-1 ring-inset ring-black/5"
        style={{ backgroundColor: professional.color ?? '#94a3b8' }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate font-medium ${professional.active ? '' : 'text-muted-foreground'}`}>
            {professional.name}
          </p>
          {!professional.active && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Inativo
            </span>
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {professional.specialty || 'Sem especialidade'}
          {professional._count.appointments > 0 && ` · ${professional._count.appointments} agendamento${professional._count.appointments !== 1 ? 's' : ''}`}
        </p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>

      {confirmDelete ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-muted-foreground">Excluir?</span>
          <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border border-border px-2.5 py-1 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Não</button>
          <button type="button" disabled={isPending} onClick={remove} className="rounded-md bg-destructive px-2.5 py-1 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Sim</button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar ${professional.name}`}
            className="rounded-md p-2 text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={toggle}
            aria-label={professional.active ? `Desativar ${professional.name}` : `Ativar ${professional.name}`}
            className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {professional.active ? 'Desativar' : 'Ativar'}
          </button>
          <button
            type="button"
            onClick={() => { setError(null); setConfirmDelete(true); }}
            aria-label={`Excluir ${professional.name}`}
            className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
          </button>
        </div>
      )}
    </li>
  );
}
