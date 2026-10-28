import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  FileHeart,
  FilePlus2,
  FileText,
  History,
  IdCard,
  Images,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  NotebookPen,
  Pencil,
  Phone,
  Smile,
  StickyNote,
  UserRound,
  Wallet,
} from 'lucide-react';
import { getPatient, addPatientNote, togglePatientActive } from '../actions';
import { getPatientRecord } from './actions';
import { PatientAvatar } from '../_components/patient-avatar';
import { PatientStatusBadge } from '../_components/patient-status-badge';
import { RecordTabs } from './_components/record-tabs';
import { Odontogram } from './_components/odontogram';
import { FinancialSection } from './_components/financial-section';
import { AnamnesisSection } from './_components/anamnesis-section';
import { EvolutionsSection } from './_components/evolutions-section';
import { ImagesSection } from './_components/images-section';
import { CopyButton } from './_components/copy-button';
import { ANAMNESIS_QUESTIONS } from './_components/anamnesis-questions';
import { CLINIC_TZ, wallClockTime } from '@/lib/tz';
import { CrmPatientDeals } from '@/components/crm-patient-deals';
import { getReceiptMethods } from '@/lib/clinic-settings';

export const metadata = { title: 'Ficha do paciente' };

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

/** Número para o wa.me: com o 55 do Brasil quando vier só com DDD. */
function whatsappNumber(phone: string) {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
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
  SCHEDULED: { label: 'Agendado', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
  CONFIRMED: { label: 'Confirmado', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300', dot: 'bg-emerald-500' },
  ATTENDED: { label: 'Compareceu', cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300', dot: 'bg-sky-500' },
  MISSED: { label: 'Faltou', cls: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300', dot: 'bg-red-500' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-surface-alt text-muted-foreground', dot: 'bg-muted-foreground/40' },
  RESCHEDULED: { label: 'Remarcado', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300', dot: 'bg-amber-500' },
};

function Field({ icon, label, value, copy }: { icon?: React.ReactNode; label: string; value?: string | null; copy?: string }) {
  return (
    <div className="group flex items-start gap-3">
      {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-alt text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={`mt-0.5 flex items-center gap-1 text-sm ${value ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
          <span className="min-w-0 break-words">{value || 'Não informado'}</span>
          {value && copy && <CopyButton value={copy} label={label.toLowerCase()} />}
        </dd>
      </div>
    </div>
  );
}

function Card({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
        <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <h2 className="mr-auto text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Locked({ what }: { what: string }) {
  return (
    <div className="flex justify-center py-10">
      <div className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-alt text-muted-foreground">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-3 text-sm font-semibold">Sem acesso {what}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">O seu perfil não alcança esta parte da ficha. Peça ao responsável da clínica, em Configurações › Usuários e acessos.</p>
      </div>
    </div>
  );
}

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const [{ id }, { aba }] = await Promise.all([params, searchParams]);
  const [patient, record, methods] = await Promise.all([getPatient(id), getPatientRecord(id), getReceiptMethods()]);
  if (!patient) notFound();

  const age = calcAge(patient.birthDate);
  const address = [
    [patient.street, patient.addressNumber].filter(Boolean).join(', '),
    patient.complement,
    patient.neighborhood,
    [patient.city, patient.state].filter(Boolean).join(' - '),
  ]
    .filter(Boolean)
    .join(' · ');
  const plano = record.findings.filter((f) => f.status === 'PLANNED');
  const totalPlano = plano.reduce((s, f) => s + (f.procedure?.price ?? 0), 0);

  // O que o dentista precisa ver antes de pegar na seringa.
  const alertas = record.anamnesis
    ? ANAMNESIS_QUESTIONS.filter((q) => q.critical && record.anamnesis!.answers.items[q.key]?.value === 'yes').map((q) => ({
        key: q.key,
        texto: { allergy: 'Alergia', anesthesia: 'Reação a anestesia', bleeding: 'Sangramento / cicatrização' }[q.key] ?? q.label,
        detalhe: record.anamnesis!.answers.items[q.key]?.detail,
      }))
    : [];

  const agora = Date.now();
  const proximas = record.appointments
    .filter((a) => new Date(a.startTime).getTime() >= agora && ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(a.status))
    .reverse();
  const anteriores = record.appointments.filter((a) => !proximas.includes(a));

  const linhaConsulta = (a: (typeof record.appointments)[number]) => {
    const meta = APPT_STATUS[a.status] ?? APPT_STATUS.SCHEDULED;
    return (
      <li key={a.id} className="relative flex gap-4 py-3 pl-6">
        <span className={`absolute left-0 top-[18px] h-2.5 w-2.5 rounded-full ring-4 ring-surface ${meta.dot}`} aria-hidden="true" />
        <div className="w-16 shrink-0 text-center">
          <p className="text-lg font-semibold leading-none tabular-nums">{wallDateLabel(a.startTime, 'dd')}</p>
          <p className="mt-0.5 text-[11px] uppercase text-muted-foreground">{wallDateLabel(a.startTime, 'MMM yy')}</p>
        </div>
        <div className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              <span className="capitalize">{wallDateLabel(a.startTime, 'EEEE')}</span>
              <span className="text-muted-foreground"> · {wallClockTime(a.startTime)}</span>
            </p>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.professional.color ?? '#94a3b8' }} aria-hidden="true" />
            {a.professional.name}
            {a.procedure && ` · ${a.procedure.name}`}
          </p>
          {a.notes && <p className="mt-1 text-xs">{a.notes}</p>}
        </div>
      </li>
    );
  };

  const historico =
    record.appointments.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
        <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-sm text-muted-foreground">Nenhum atendimento ainda.</p>
        <Link href={`/agenda?novo=1&paciente=${patient.id}`} className="btn-primary btn-sm mt-3 inline-flex">
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Agendar a primeira consulta
        </Link>
      </div>
    ) : (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Próximas consultas" icon={<CalendarClock />}>
          {proximas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nada marcado.{' '}
              <Link href={`/agenda?novo=1&paciente=${patient.id}`} className="font-medium text-primary hover:underline">
                Agendar
              </Link>
            </p>
          ) : (
            <ol className="relative before:absolute before:bottom-3 before:left-[4px] before:top-3 before:w-px before:bg-border">{proximas.map(linhaConsulta)}</ol>
          )}
        </Card>
        <Card title="Atendimentos anteriores" icon={<History />}>
          {anteriores.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda nenhum.</p>
          ) : (
            <ol className="relative before:absolute before:bottom-3 before:left-[4px] before:top-3 before:w-px before:bg-border">{anteriores.map(linhaConsulta)}</ol>
          )}
        </Card>
      </div>
    );

  const dados = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card
          title="Contato"
          icon={<Phone />}
          action={
            <Link href={`/pacientes/${patient.id}/editar`} className="btn-ghost btn-sm">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
            </Link>
          }
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field icon={<Phone />} label="Telefone principal" value={patient.phone ? formatPhone(patient.phone) : null} copy={patient.phone} />
            <Field icon={<Phone />} label="Telefone secundário" value={patient.phone2 ? formatPhone(patient.phone2) : null} copy={patient.phone2} />
            <Field icon={<Mail />} label="E-mail" value={patient.email} copy={patient.email ?? undefined} />
            <Field icon={<UserRound />} label="Como prefere ser chamado" value={patient.nickname} />
          </dl>
        </Card>

        <Card title="Dados pessoais" icon={<IdCard />}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="CPF" value={patient.cpf ? formatCpf(patient.cpf) : null} copy={patient.cpf} />
            <Field
              label="Data de nascimento"
              value={patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) + (age !== null ? ` (${age} anos)` : '') : null}
            />
            <Field label="Gênero" value={patient.gender ? GENDER_LABELS[patient.gender] : null} />
            <Field label="Estado civil" value={patient.maritalStatus ? MARITAL_LABELS[patient.maritalStatus] : null} />
            <Field label="Profissão" value={patient.profession} />
            <Field label="Indicado por" value={patient.referredBy} />
          </dl>
        </Card>

        <Card title="Endereço" icon={<MapPin />}>
          <dl className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <Field label="CEP" value={patient.zipCode} />
            <Field label="Endereço" value={address || null} />
          </dl>
        </Card>

        {patient.notes && (
          <Card title="Observações do cadastro" icon={<StickyNote />}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{patient.notes}</p>
          </Card>
        )}
      </div>

      <aside className="space-y-4">
        <Card title="Notas da equipe" icon={<NotebookPen />}>
          <form
            action={async (formData: FormData) => {
              'use server';
              const content = formData.get('content') as string;
              await addPatientNote(patient.id, content);
            }}
            className="mb-4 space-y-2"
          >
            <label htmlFor="note-content" className="sr-only">
              Nova nota
            </label>
            <textarea
              id="note-content"
              name="content"
              rows={3}
              required
              placeholder="Ex: prefere horários de manhã, vem acompanhada da filha..."
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <button type="submit" className="btn-primary btn-sm w-full justify-center">
              Salvar nota
            </button>
          </form>
          {patient.patientNotes.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">Nenhuma nota ainda.</p>
          ) : (
            <ol className="space-y-3" aria-label="Notas">
              {patient.patientNotes.map((note) => (
                <li key={note.id} className="rounded-xl bg-surface-alt/60 p-3">
                  <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {note.user.name} · {new Date(note.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: CLINIC_TZ })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <section aria-label="Informações do registro" className="space-y-1 rounded-2xl border border-border bg-surface p-4 text-xs text-muted-foreground shadow-card">
          <p>Cadastrado em {new Date(patient.createdAt).toLocaleDateString('pt-BR', { timeZone: CLINIC_TZ })}</p>
          {patient.lgpdConsentAt ? (
            <p>Consentimento LGPD em {new Date(patient.lgpdConsentAt).toLocaleDateString('pt-BR', { timeZone: CLINIC_TZ })}</p>
          ) : (
            <p className="text-amber-700 dark:text-amber-400">Sem consentimento LGPD registrado</p>
          )}
          <form action={togglePatientActive.bind(null, patient.id)} className="pt-2">
            <button type="submit" className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
              {patient.active ? 'Inativar paciente' : 'Reativar paciente'}
            </button>
          </form>
        </section>
      </aside>
    </div>
  );

  const stats: { label: string; value: React.ReactNode; hint?: string; tone?: 'warn' | 'danger' }[] = [
    {
      label: 'Consultas realizadas',
      value: record.stats.visits,
      hint: record.stats.lastVisit ? `última em ${wallDateLabel(record.stats.lastVisit)}` : 'nenhuma ainda',
    },
    {
      label: 'Próxima consulta',
      value: record.stats.nextAppointment ? (
        <>
          {wallDateLabel(record.stats.nextAppointment, 'dd/MM')}
          <span className="text-base font-medium text-muted-foreground"> {wallClockTime(record.stats.nextAppointment)}</span>
        </>
      ) : (
        '—'
      ),
      hint: record.stats.nextAppointment ? wallDateLabel(record.stats.nextAppointment, 'EEEE') : 'nada marcado',
    },
    {
      label: 'Faltas',
      value: record.stats.missed,
      hint: `de ${record.stats.totalAppointments} agendamento${record.stats.totalAppointments !== 1 ? 's' : ''}`,
      tone: record.stats.missed > 0 ? 'danger' : undefined,
    },
    ...(record.canSeeRecord
      ? [{ label: 'Plano de tratamento', value: plano.length, hint: totalPlano > 0 ? brl(totalPlano) : plano.length ? 'sem valores' : 'nada a fazer' }]
      : []),
    ...(record.canSeeFinance
      ? [{ label: 'Em aberto', value: brl(record.financial.balance), hint: `pago ${brl(record.financial.paid)}`, tone: record.financial.balance > 0 ? ('warn' as const) : undefined }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      <Link
        href="/pacientes"
        className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Pacientes
      </Link>

      {/* Perfil */}
      <header className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="h-16 bg-gradient-to-r from-primary/80 via-primary/50 to-primary/20 sm:h-20" aria-hidden="true" />
        <div className="px-4 pb-4 sm:px-6">
          <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="-mt-11 w-fit shrink-0 rounded-full bg-surface p-1 shadow-card sm:-mt-12">
              <PatientAvatar name={patient.name} size="xl" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{patient.name}</h1>
                <PatientStatusBadge active={patient.active} />
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Ficha nº {String(patient.controlNumber).padStart(4, '0')}
                {age !== null && ` · ${age} anos`}
                {patient.gender && patient.gender !== 'N' && ` · ${GENDER_LABELS[patient.gender]}`}
                {patient.nickname && ` · prefere "${patient.nickname}"`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/agenda?novo=1&paciente=${patient.id}`} className="btn-primary btn-sm">
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Agendar
              </Link>
              {record.canSeeFinance && (
                <Link href={`/orcamentos/novo?patientId=${patient.id}`} className="btn-outline btn-sm">
                  <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" /> Orçamento
                </Link>
              )}
              {patient.phone && (
                <a href={`https://wa.me/${whatsappNumber(patient.phone)}`} target="_blank" rel="noreferrer" className="btn-outline btn-sm">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> WhatsApp
                </a>
              )}
              <Link href={`/pacientes/${patient.id}/editar`} className="btn-outline btn-sm">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {patient.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {formatPhone(patient.phone)}
              </span>
            )}
            {patient.email && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{patient.email}</span>
              </span>
            )}
            {patient.city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {[patient.city, patient.state].filter(Boolean).join(' - ')}
              </span>
            )}
          </div>

          {record.canSeeRecord && (alertas.length > 0 || !record.anamnesis) && (
            <div className="mt-3 flex flex-wrap gap-2" role={alertas.length ? 'alert' : undefined}>
              {alertas.map((a) => (
                <span key={a.key} className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-900">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {a.texto}
                  {a.detalhe && <strong className="font-semibold">: {a.detalhe}</strong>}
                </span>
              ))}
              {!record.anamnesis && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                  <FileHeart className="h-3.5 w-3.5" aria-hidden="true" />
                  Anamnese não preenchida
                </span>
              )}
            </div>
          )}
        </div>

        <dl className={`grid grid-cols-2 border-t border-border sm:grid-cols-3 ${stats.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`px-4 py-3 sm:px-6 ${i > 0 ? 'border-l border-border' : ''} ${s.tone === 'warn' ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}`}
            >
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd
                className={`mt-0.5 text-xl font-semibold tabular-nums tracking-tight ${s.tone === 'danger' ? 'text-destructive' : s.tone === 'warn' ? 'text-amber-800 dark:text-amber-300' : ''}`}
              >
                {s.value}
              </dd>
              {s.hint && <dd className="truncate text-[11px] text-muted-foreground first-letter:uppercase">{s.hint}</dd>}
            </div>
          ))}
        </dl>
      </header>

      <CrmPatientDeals patientId={patient.id} />

      <RecordTabs
        initial={aba}
        tabs={[
          { id: 'historico', label: 'Atendimentos', icon: <CalendarClock />, badge: record.stats.totalAppointments, content: historico },
          {
            id: 'odontograma',
            label: 'Odontograma',
            icon: <Smile />,
            badge: plano.length,
            alert: plano.length > 0,
            content: record.canSeeRecord ? (
              <Odontogram patientId={patient.id} findings={record.findings} procedures={record.procedures} professionals={record.professionals} />
            ) : (
              <Locked what="ao prontuário" />
            ),
          },
          {
            id: 'anamnese',
            label: 'Anamnese',
            icon: <FileHeart />,
            badge: alertas.length,
            alert: alertas.length > 0,
            content: record.canSeeRecord ? <AnamnesisSection patientId={patient.id} initial={record.anamnesis} /> : <Locked what="ao prontuário" />,
          },
          {
            id: 'evolucoes',
            label: 'Evoluções',
            icon: <ClipboardList />,
            badge: record.evolutions.length,
            content: record.canSeeRecord ? (
              <EvolutionsSection patientId={patient.id} evolutions={record.evolutions} professionals={record.professionals} />
            ) : (
              <Locked what="ao prontuário" />
            ),
          },
          {
            id: 'imagens',
            label: 'Imagens',
            icon: <Images />,
            badge: record.files.length,
            content: record.canSeeRecord ? (
              <ImagesSection patientId={patient.id} files={record.files} storageEnabled={record.storageEnabled} />
            ) : (
              <Locked what="ao prontuário" />
            ),
          },
          {
            id: 'financeiro',
            label: 'Financeiro',
            icon: <Wallet />,
            content: record.canSeeFinance ? (
              <FinancialSection
                patientId={patient.id}
                contracted={record.financial.contracted}
                paid={record.financial.paid}
                balance={record.financial.balance}
                payments={record.financial.payments}
                acceptedQuotes={record.financial.acceptedQuotes}
                quotes={record.financial.quotes}
                methods={methods}
              />
            ) : (
              <Locked what="ao financeiro" />
            ),
          },
          { id: 'dados', label: 'Dados cadastrais', icon: <FileText />, content: dados },
        ]}
      />
    </div>
  );
}
