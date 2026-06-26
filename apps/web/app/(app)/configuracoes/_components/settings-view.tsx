'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateClinic,
  toggleProfessionalActive,
  deleteProfessional,
  updateBusinessHours,
  type ClinicFormState,
  type DayHours,
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
  businessHours: DayHours[];
}

export function SettingsView({ clinic, professionals, suggestedColor, businessHours }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie os dados da clínica, a equipe e os horários de atendimento.
        </p>
      </header>

      <ClinicSection clinic={clinic} />
      <ProfessionalsSection professionals={professionals} suggestedColor={suggestedColor} />
      <BusinessHoursSection initialHours={businessHours} />
      <AppearanceSection />
    </div>
  );
}

function AppearanceSection() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    try {
      const t = localStorage.getItem('theme');
      setTheme(t === 'dark' ? 'dark' : t === 'light' ? 'light' : 'system');
    } catch {
      /* ignore */
    }
  }, []);

  function apply(t: 'light' | 'dark' | 'system') {
    setTheme(t);
    try {
      if (t === 'system') {
        localStorage.removeItem('theme');
        const sys = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', sys);
      } else {
        localStorage.setItem('theme', t);
        document.documentElement.classList.toggle('dark', t === 'dark');
      }
    } catch {
      /* ignore */
    }
  }

  const options = [
    { v: 'light', l: 'Claro' },
    { v: 'dark', l: 'Escuro' },
    { v: 'system', l: 'Sistema' },
  ] as const;

  return (
    <section aria-labelledby="appearance-heading" className="rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 id="appearance-heading" className="text-base font-semibold">Aparência</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Escolha o tema da interface.</p>
      </div>
      <div className="p-5">
        <div role="radiogroup" aria-label="Tema da interface" className="inline-flex rounded-lg border border-border p-1">
          {options.map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={theme === o.v}
              onClick={() => apply(o.v)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                theme === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first display

function BusinessHoursSection({ initialHours }: { initialHours: DayHours[] }) {
  const [hours, setHours] = useState(initialHours);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<DayHours>) {
    setHours((prev) => prev.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  }

  function save() {
    startTransition(async () => {
      await updateBusinessHours(hours);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <section aria-labelledby="hours-heading" className="rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 id="hours-heading" className="text-base font-semibold">Horário de funcionamento</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Dias e horas em que a clínica atende.</p>
      </div>
      <div className="divide-y divide-border">
        {DAY_ORDER.map((i) => {
          const h = hours[i];
          return (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <label className="flex w-32 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={h.open}
                  onChange={(e) => update(i, { open: e.target.checked })}
                  className="h-4 w-4 rounded accent-primary"
                  aria-label={`${DAY_LABELS[i]} — aberto`}
                />
                <span className="text-sm font-medium">{DAY_LABELS[i]}</span>
              </label>
              {h.open ? (
                <div className="flex items-center gap-2 text-sm">
                  <input type="time" value={h.start} onChange={(e) => update(i, { start: e.target.value })} aria-label={`${DAY_LABELS[i]} — abertura`} className="rounded-md border border-border bg-background px-2 py-1.5 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
                  <span className="text-muted-foreground">às</span>
                  <input type="time" value={h.end} onChange={(e) => update(i, { end: e.target.value })} aria-label={`${DAY_LABELS[i]} — fechamento`} className="rounded-md border border-border bg-background px-2 py-1.5 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Fechado</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-border px-5 py-4">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {isPending ? 'Salvando...' : 'Salvar horários'}
        </button>
        <span aria-live="polite" className="text-sm text-success">{saved && '✓ Salvo'}</span>
      </div>
    </section>
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
    <section aria-labelledby="clinic-heading" className="rounded-xl border border-border bg-surface shadow-card">
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
    <section aria-labelledby="prof-heading" className="rounded-xl border border-border bg-surface shadow-card">
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
