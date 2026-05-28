import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPatient, addPatientNote, togglePatientActive } from '../actions';
import { PatientAvatar } from '../_components/patient-avatar';
import { PatientStatusBadge } from '../_components/patient-status-badge';

export const metadata = { title: 'Paciente' };

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

const GENDER_LABELS: Record<string, string> = { M: 'Masculino', F: 'Feminino', O: 'Outro', N: 'Prefiro não informar' };
const MARITAL_LABELS: Record<string, string> = { solteiro: 'Solteiro(a)', casado: 'Casado(a)', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)', uniao: 'União estável' };

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const age = calcAge(patient.birthDate);
  const address = [patient.street, patient.addressNumber, patient.complement, patient.neighborhood, patient.city, patient.state].filter(Boolean).join(', ');

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <PatientAvatar name={patient.name} size="lg" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight">{patient.name}</h1>
              <PatientStatusBadge active={patient.active} />
            </div>
            <p className="text-sm text-muted-foreground">
              Nº {String(patient.controlNumber).padStart(4, '0')}
              {age !== null && ` · ${age} anos`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form action={togglePatientActive.bind(null, patient.id)}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {patient.active ? 'Inativar' : 'Ativar'}
            </button>
          </form>
          <Link
            href={`/pacientes/${patient.id}/editar`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            Editar
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: patient data */}
        <div className="space-y-4 lg:col-span-2">
          {/* Contact */}
          <section className="rounded-lg border border-border bg-surface p-4" aria-label="Dados de contato">
            <h2 className="mb-3 text-sm font-semibold">Contato</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DataField label="Telefone principal" value={patient.phone ? formatPhone(patient.phone) : null} />
              <DataField label="Telefone secundário" value={patient.phone2 ? formatPhone(patient.phone2) : null} />
              <DataField label="E-mail" value={patient.email} />
              <DataField label="Como prefere ser chamado" value={patient.nickname} />
            </dl>
          </section>

          {/* Personal data */}
          <section className="rounded-lg border border-border bg-surface p-4" aria-label="Dados pessoais">
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

          {/* Address */}
          {(patient.zipCode || patient.street || patient.city) && (
            <section className="rounded-lg border border-border bg-surface p-4" aria-label="Endereço">
              <h2 className="mb-3 text-sm font-semibold">Endereço</h2>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DataField label="CEP" value={patient.zipCode} />
                <DataField label="Endereço" value={address || null} />
              </dl>
            </section>
          )}

          {/* Notes */}
          {patient.notes && (
            <section className="rounded-lg border border-border bg-surface p-4" aria-label="Observações">
              <h2 className="mb-2 text-sm font-semibold">Observações</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{patient.notes}</p>
            </section>
          )}
        </div>

        {/* Right: timeline */}
        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-4" aria-label="Histórico">
            <h2 className="mb-3 text-sm font-semibold">Histórico</h2>

            {/* Add note form */}
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
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring resize-none"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Salvar nota
              </button>
            </form>

            {/* Notes list */}
            {patient.patientNotes.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">Nenhuma nota ainda</p>
            ) : (
              <ol className="space-y-3" aria-label="Notas do histórico">
                {patient.patientNotes.map((note) => (
                  <li key={note.id} className="border-l-2 border-primary/30 pl-3">
                    <p className="text-xs text-muted-foreground">
                      {note.user.name} · {new Date(note.createdAt).toLocaleString('pt-BR')}
                    </p>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap">{note.content}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Metadata */}
          <section className="rounded-lg border border-border bg-surface p-4 text-xs text-muted-foreground space-y-1" aria-label="Informações do registro">
            <p>Cadastrado em {new Date(patient.createdAt).toLocaleString('pt-BR')}</p>
            {patient.lgpdConsentAt && (
              <p>LGPD aceito em {new Date(patient.lgpdConsentAt).toLocaleString('pt-BR')}</p>
            )}
          </section>
        </aside>
      </div>

      {/* Back link */}
      <div>
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          Voltar para lista
        </Link>
      </div>
    </div>
  );
}
