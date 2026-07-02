import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getPatient, addPatientNote, togglePatientActive } from '../actions';
import { getPatientRecord } from './actions';
import { PatientAvatar } from '../_components/patient-avatar';
import { PatientStatusBadge } from '../_components/patient-status-badge';
import { RecordTabs } from './_components/record-tabs';
import { Odontogram } from './_components/odontogram';
import { FinancialSection } from './_components/financial-section';
import { wallClockTime } from '@/lib/tz';

export const metadata = { title: 'Ficha do paciente' };

function DataField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value || '—'}</dd>
    </div>
  );
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function formatCpf(cpf: string) {
  const d = cpf.replace(/\D/g, '');
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function calcAge(birthDate: Date | null) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

/** Calendar label from a stored wall-clock UTC datetime (server may be UTC). */
function wallDateLabel(d: Date | string, pattern = 'dd/MM/yyyy') {
  const iso = new Date(d).toISOString().slice(0, 10);
  return format(new Date(`${iso}T12:00:00.000Z`), pattern, { locale: ptBR });
}

function brl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

const GENDER_LABELS: Record<string, string> = { M: 'Masculino', F: 'Feminino', O: 'Outro', N: 'Prefiro não informar' };
const MARITAL_LABELS: Record<string, string> = { solteiro: 'Solteiro(a)', casado: 'Casado(a)', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)', uniao: 'União estável' };

const APPT_STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  SCHEDULED: { label: 'Agendado', cls: 'text-muted-foreground', dot: 'bg-slate-400' },
  CONFIRMED: { label: 'Confirmado', cls: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  ATTENDED: { label: 'Compareceu', cls: 'text-sky-700 dark:text-sky-400', dot: 'bg-sky-500' },
  MISSED: { label: 'Faltou', cls: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  CANCELLED: { label: 'Cancelado', cls: 'text-muted-foreground', dot: 'bg-muted-foreground/40' },
  RESCHEDULED: { label: 'Remarcado', cls: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
};

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [patient, record] = await Promise.all([getPatient(id), getPatientRecord(id)]);
  if (!patient) notFound();

  const age = calcAge(patient.birthDate);
  const address = [patient.street, patient.addressNumber, patient.complement, patient.neighborhood, patient.city, patient.state].filter(Boolean).join(', ');
  const teethToTreat = record.teeth.filter((t) => t.status === 'TO_TREAT' || t.status === 'IN_TREATMENT').length;

  const historico = (
    <section aria-label="Histórico de atendimentos" className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {record.appointments.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum atendimento ainda. <Link href="/agenda" className="font-medium text-primary hover:underline">Agendar o primeiro →</Link>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {record.appointments.map((a) => {
            const meta = APPT_STATUS[a.status] ?? APPT_STATUS.SCHEDULED;
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: a.professional.color ?? '#94a3b8' }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className="capitalize">{wallDateLabel(a.startTime, "EEE, dd/MM/yyyy")}</span>
                    <span className="text-muted-foreground"> · {wallClockTime(a.startTime)}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.professional.name}
                    {a.procedure && ` · ${a.procedure.name}`}
                    {a.notes && ` · ${a.notes}`}
                  </p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${meta.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const dados = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-xl border border-border bg-surface p-4 shadow-card" aria-label="Dados de contato">
          <h2 className="mb-3 text-sm font-semibold">Contato</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DataField label="Telefone principal" value={patient.phone ? formatPhone(patient.phone) : null} />
            <DataField label="Telefone secundário" value={patient.phone2 ? formatPhone(patient.phone2) : null} />
            <DataField label="E-mail" value={patient.email} />
            <DataField label="Como prefere ser chamado" value={patient.nickname} />
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 shadow-card" aria-label="Dados pessoais">
          <h2 className="mb-3 text-sm font-semibold">Dados pessoais</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DataField label="CPF" value={patient.cpf ? formatCpf(patient.cpf) : null} />
            <DataField
              label="Data de nascimento"
              value={patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('pt-BR') + (age !== null ? ` (${age} anos)` : '') : null}
            />
            <DataField label="Gênero" value={patient.gender ? GENDER_LABELS[patient.gender] : null} />
            <DataField label="Estado civil" value={patient.maritalStatus ? MARITAL_LABELS[patient.maritalStatus] : null} />
            <DataField label="Profissão" value={patient.profession} />
            <DataField label="Indicado por" value={patient.referredBy} />
          </dl>
        </section>

        {(patient.zipCode || patient.street || patient.city) && (
          <section className="rounded-xl border border-border bg-surface p-4 shadow-card" aria-label="Endereço">
            <h2 className="mb-3 text-sm font-semibold">Endereço</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DataField label="CEP" value={patient.zipCode} />
              <DataField label="Endereço" value={address || null} />
            </dl>
          </section>
        )}

        {patient.notes && (
          <section className="rounded-xl border border-border bg-surface p-4 shadow-card" aria-label="Observações">
            <h2 className="mb-2 text-sm font-semibold">Observações</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{patient.notes}</p>
          </section>
        )}
      </div>

      <aside className="space-y-4">
        <section className="rounded-xl border border-border bg-surface p-4 shadow-card" aria-label="Notas da equipe">
          <h2 className="mb-3 text-sm font-semibold">Notas da equipe</h2>
          <form
            action={async (formData: FormData) => {
              'use server';
              const content = formData.get('content') as string;
              await addPatientNote(patient.id, content);
            }}
            className="mb-4 space-y-2"
          >
            <label htmlFor="note-content" className="sr-only">Nova observação</label>
            <textarea
              id="note-content"
              name="content"
              rows={3}
              required
              placeholder="Adicionar observação..."
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <button
              type="submit"
              className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Salvar nota
            </button>
          </form>
          {patient.patientNotes.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma nota ainda</p>
          ) : (
            <ol className="space-y-3" aria-label="Notas do histórico">
              {patient.patientNotes.map((note) => (
                <li key={note.id} className="border-l-2 border-primary/30 pl-3">
                  <p className="text-xs text-muted-foreground">
                    {note.user.name} · {new Date(note.createdAt).toLocaleString('pt-BR')}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{note.content}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-1 rounded-xl border border-border bg-surface p-4 text-xs text-muted-foreground shadow-card" aria-label="Informações do registro">
          <p>Cadastrado em {new Date(patient.createdAt).toLocaleString('pt-BR')}</p>
          {patient.lgpdConsentAt && <p>LGPD aceito em {new Date(patient.lgpdConsentAt).toLocaleString('pt-BR')}</p>}
        </section>
      </aside>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Breadcrumb + header */}
      <div>
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          Pacientes
        </Link>
        <header className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <PatientAvatar name={patient.name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{patient.name}</h1>
                <PatientStatusBadge active={patient.active} />
              </div>
              <p className="text-sm text-muted-foreground">
                Ficha nº {String(patient.controlNumber).padStart(4, '0')}
                {age !== null && ` · ${age} anos`}
                {patient.phone && ` · ${formatPhone(patient.phone)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <form action={togglePatientActive.bind(null, patient.id)}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {patient.active ? 'Inativar' : 'Ativar'}
              </button>
            </form>
            <Link
              href={`/pacientes/${patient.id}/editar`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Editar cadastro
            </Link>
          </div>
        </header>
      </div>

      {/* Stats */}
      <section aria-label="Resumo do paciente" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-muted-foreground">Consultas realizadas</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{record.stats.visits}</p>
          {record.stats.lastVisit && (
            <p className="mt-0.5 text-xs text-muted-foreground">última em {wallDateLabel(record.stats.lastVisit)}</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-muted-foreground">Faltas</p>
          <p className={`mt-1 text-2xl font-semibold tracking-tight ${record.stats.missed > 0 ? 'text-destructive' : ''}`}>{record.stats.missed}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">de {record.stats.totalAppointments} agendamento{record.stats.totalAppointments !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-muted-foreground">Próxima consulta</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">
            {record.stats.nextAppointment ? (
              <>
                {wallDateLabel(record.stats.nextAppointment, 'dd/MM')}
                <span className="text-muted-foreground"> · {wallClockTime(record.stats.nextAppointment)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </div>
        <div className={`rounded-xl border p-4 shadow-card ${record.financial.balance > 0 ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40' : 'border-border bg-surface'}`}>
          <p className={`text-xs font-medium ${record.financial.balance > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>Em aberto</p>
          <p className={`mt-1 text-lg font-semibold tracking-tight tabular-nums ${record.financial.balance > 0 ? 'text-amber-900 dark:text-amber-200' : 'text-success'}`}>
            {brl(record.financial.balance)}
          </p>
        </div>
      </section>

      {/* Tabs */}
      <RecordTabs
        tabs={[
          { id: 'historico', label: 'Histórico', badge: record.stats.totalAppointments, content: historico },
          {
            id: 'odontograma',
            label: 'Odontograma',
            badge: teethToTreat,
            content: <Odontogram patientId={patient.id} teeth={record.teeth} />,
          },
          {
            id: 'financeiro',
            label: 'Financeiro',
            content: (
              <FinancialSection
                patientId={patient.id}
                contracted={record.financial.contracted}
                paid={record.financial.paid}
                balance={record.financial.balance}
                payments={record.financial.payments}
                acceptedQuotes={record.financial.acceptedQuotes}
              />
            ),
          },
          { id: 'dados', label: 'Dados cadastrais', content: dados },
        ]}
      />
    </div>
  );
}
