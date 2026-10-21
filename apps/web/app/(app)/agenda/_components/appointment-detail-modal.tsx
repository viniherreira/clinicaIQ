'use client';

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Armchair, CalendarClock, Check, CheckCheck, ChevronDown, Clock, FileText, MessageCircle, MoreHorizontal,
  Pencil, RotateCcw, Stethoscope, Tag, Trash2, UserRound, Wallet, X,
} from 'lucide-react';
import { wallClockTime } from '@/lib/tz';
import { ACTION_LABELS, STAGE_LABELS, actionsFor, stageOf, waitingMinutes, type FlowAction } from '@/lib/appointment-flow';
import { labelClasses } from '@/lib/label-colors';
import { advanceAppointment, deleteAppointment, getAppointmentDetail, setAppointmentLabel } from '../actions';
import { STATUS_STYLES, TYPE_LABELS } from './constants';

type Detail = NonNullable<Awaited<ReturnType<typeof getAppointmentDetail>>>;
type LabelOption = { id: string; name: string; color: string };

interface Props {
  open: boolean;
  appointmentId: string | null;
  labels: LabelOption[];
  onClose: () => void;
  onChanged: () => void;
  onEdit: (detail: Detail['appointment']) => void;
}

const ACTION_ICON: Record<FlowAction, typeof Check> = {
  confirm: Check,
  arrive: Armchair,
  start: Stethoscope,
  finish: CheckCheck,
  miss: X,
  cancel: X,
  reopen: RotateCcw,
};

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hora = (d: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

function idade(nascimento: Date | string | null): string | null {
  if (!nascimento) return null;
  const n = new Date(nascimento);
  const hoje = new Date();
  let anos = hoje.getUTCFullYear() - n.getUTCFullYear();
  if (hoje.getUTCMonth() < n.getUTCMonth() || (hoje.getUTCMonth() === n.getUTCMonth() && hoje.getUTCDate() < n.getUTCDate())) anos -= 1;
  return `${String(n.getUTCDate()).padStart(2, '0')}/${String(n.getUTCMonth() + 1).padStart(2, '0')}/${n.getUTCFullYear()} (${anos} anos)`;
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/**
 * Os detalhes de um agendamento, como no Clínica nas Nuvens: a ficha resumida
 * do paciente no topo (idade, nº de controle, último atendimento, WhatsApp,
 * débito), abas de Detalhes, Financeiro e Histórico, e no rodapé as ações —
 * excluir, rótulo, opções e editar. O botão de destaque é sempre o próximo
 * passo do dia: chegou, iniciar, finalizar.
 */
export function AppointmentDetailModal({ open, appointmentId, labels, onClose, onChanged, onEdit }: Props) {
  const baseId = useId();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState<'detalhes' | 'financeiro' | 'historico'>('detalhes');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [pending, start] = useTransition();

  const carregar = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setDetail(await getAppointmentDetail(id));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !appointmentId) return;
    setDetail(null);
    setErro('');
    setAba('detalhes');
    setCancelando(false);
    setMotivo('');
    void carregar(appointmentId);
  }, [open, appointmentId, carregar]);

  const a = detail?.appointment;
  const stage = a ? stageOf(a) : 'SCHEDULED';
  const style = STATUS_STYLES[stage] ?? STATUS_STYLES.SCHEDULED;
  const acoes = actionsFor(stage);
  const [principal, ...outras] = acoes;

  function agir(action: FlowAction, cancelReason?: string) {
    if (!appointmentId) return;
    // Cancelar pede o motivo antes, ali mesmo na janela.
    if (action === 'cancel' && cancelReason === undefined) {
      setCancelando(true);
      return;
    }
    start(async () => {
      setErro('');
      const r = await advanceAppointment(appointmentId, action, cancelReason);
      if (!r.ok) return setErro(r.message);
      setAviso(`${ACTION_LABELS[action]}: feito.`);
      setCancelando(false);
      onChanged();
      // Faltou e cancelado encerram o dia do paciente: a janela fecha e o resultado aparece na agenda.
      if (action === 'miss' || action === 'cancel') return onClose();
      await carregar(appointmentId);
    });
  }

  function trocarRotulo(labelId: string) {
    if (!appointmentId) return;
    start(async () => {
      setErro('');
      const r = await setAppointmentLabel(appointmentId, labelId || null);
      if (!r.ok) return setErro(r.message);
      setAviso(labelId ? 'Rótulo aplicado.' : 'Rótulo retirado.');
      onChanged();
      await carregar(appointmentId);
    });
  }

  function excluir() {
    if (!appointmentId) return;
    const quem = detail?.patient.name ? ` de ${detail.patient.name}` : '';
    if (!confirm(`Excluir o agendamento${quem}? Ele some da agenda e não dá para desfazer.`)) return;
    start(async () => {
      await deleteAppointment(appointmentId);
      onChanged();
      onClose();
    });
  }

  const abas = [
    { id: 'detalhes' as const, label: 'Detalhes' },
    ...(detail?.financial ? [{ id: 'financeiro' as const, label: 'Financeiro' }] : []),
    { id: 'historico' as const, label: 'Histórico na clínica' },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl border border-border bg-surface shadow-2xl focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(56rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <Dialog.Title className="text-base font-semibold">Detalhes do agendamento</Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !detail && <p className="p-6 text-sm text-muted-foreground">Carregando…</p>}
            {!loading && !detail && <p className="p-6 text-sm text-muted-foreground">Este agendamento não está mais disponível.</p>}

            {detail && a && (
              <>
                {/* Ficha resumida do paciente */}
                <section aria-label="Paciente" className="flex flex-col gap-4 px-5 pt-5 sm:flex-row">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary-hover dark:text-sky-300" aria-hidden="true">
                    {iniciais(detail.patient.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="text-lg font-semibold leading-tight">{detail.patient.name}</h2>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/pacientes/${detail.patient.id}`} className="btn-ghost btn-sm text-primary">
                          <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> Ver ficha completa
                        </Link>
                      </div>
                    </div>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      {idade(detail.patient.birthDate) && <Info label="Nascimento">{idade(detail.patient.birthDate)}</Info>}
                      <Info label="Nº de controle">
                        <span className="font-medium text-primary">{String(detail.patient.controlNumber).padStart(4, '0')}</span>
                      </Info>
                      <Info label="Último atendimento">
                        {detail.lastVisit
                          ? `${format(new Date(detail.lastVisit.at), 'dd/MM/yy')} · ${detail.lastVisit.professional}`
                          : 'Primeira vez'}
                      </Info>
                      {detail.patient.phone && (
                        <Info label="Telefone">
                          <span className="tabular-nums">{detail.patient.phone}</span>
                          {detail.patient.whatsapp && (
                            <a
                              href={`https://wa.me/${detail.patient.whatsapp}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 inline-flex items-center gap-1 font-medium text-green-700 hover:underline dark:text-green-400"
                            >
                              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Chamar no WhatsApp
                              <span className="sr-only"> (abre em outra aba)</span>
                            </a>
                          )}
                        </Info>
                      )}
                      {detail.patient.email && <Info label="E-mail">{detail.patient.email}</Info>}
                    </dl>
                    {detail.financial && detail.financial.balance > 0 && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-sm font-medium text-red-800 dark:bg-red-950/50 dark:text-red-200">
                        <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Em aberto: {brl(detail.financial.balance)}
                      </p>
                    )}
                  </div>
                </section>

                {/* Abas */}
                <div role="tablist" aria-label="Seções do agendamento" className="mt-5 flex gap-1 overflow-x-auto border-b border-border px-5">
                  {abas.map((t) => (
                    <button
                      key={t.id}
                      id={`${baseId}-aba-${t.id}`}
                      role="tab"
                      type="button"
                      aria-selected={aba === t.id}
                      aria-controls={`${baseId}-painel-${t.id}`}
                      onClick={() => setAba(t.id)}
                      className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring ${aba === t.id ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div
                  id={`${baseId}-painel-${aba}`}
                  role="tabpanel"
                  aria-labelledby={`${baseId}-aba-${aba}`}
                  className="bg-canvas p-5"
                >
                  {aba === 'detalhes' && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card titulo="Informações do atendimento">
                        <dl className="space-y-2 text-sm">
                          <Info label="Data">
                            <span className="capitalize">{format(new Date(a.startTime), "EEEE, dd/MM/yyyy", { locale: ptBR })}</span>
                          </Info>
                          <Info label="Horário">
                            <span className="tabular-nums">{wallClockTime(a.startTime)} às {wallClockTime(a.endTime)}</span>
                          </Info>
                          <Info label="Profissional">{a.professional.name}</Info>
                          {a.procedure && <Info label="Procedimento">{a.procedure.name}</Info>}
                          <Info label="Tipo">{TYPE_LABELS[a.type as keyof typeof TYPE_LABELS] ?? a.type}</Info>
                          {a.notes && <Info label="Observações">{a.notes}</Info>}
                          {a.cancelReason && <Info label="Motivo do cancelamento">{a.cancelReason}</Info>}
                        </dl>
                      </Card>

                      <Card titulo="Situação do atendimento">
                        <p className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.bg} ${style.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
                          {STAGE_LABELS[stage]}
                        </p>
                        <ol className="mt-3 space-y-2.5 border-l border-border pl-4 text-sm">
                          <Passo icone={CalendarClock} titulo="Agendado" quando={a.createdAt} quem={detail.createdBy} />
                          {a.status === 'CONFIRMED' && <Passo icone={Check} titulo="Confirmado" />}
                          {a.arrivedAt && <Passo icone={Armchair} titulo="Chegou" quando={a.arrivedAt} />}
                          {a.startedAt && (
                            <Passo
                              icone={Stethoscope}
                              titulo="Entrou para o atendimento"
                              quando={a.startedAt}
                              extra={(() => {
                                const m = waitingMinutes(a);
                                return m != null ? `esperou ${m} min` : undefined;
                              })()}
                            />
                          )}
                          {stage === 'ARRIVED' && (
                            <li className="text-amber-800 dark:text-amber-300">
                              <Clock className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                              Esperando há {waitingMinutes(a) ?? 0} min
                            </li>
                          )}
                          {a.finishedAt && <Passo icone={CheckCheck} titulo="Atendimento finalizado" quando={a.finishedAt} />}
                        </ol>

                        {cancelando ? (
                          <form
                            className="mt-4 space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/30"
                            onSubmit={(ev) => {
                              ev.preventDefault();
                              agir('cancel', motivo);
                            }}
                          >
                            <label htmlFor={`${baseId}-motivo`} className="block text-sm font-medium">
                              Motivo do cancelamento <span className="font-normal text-muted-foreground">(opcional)</span>
                            </label>
                            <input
                              id={`${baseId}-motivo`}
                              value={motivo}
                              onChange={(ev) => setMotivo(ev.target.value)}
                              maxLength={200}
                              autoFocus
                              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                            />
                            <div className="flex gap-2">
                              <button type="submit" disabled={pending} className="btn-sm inline-flex items-center rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50">
                                Confirmar cancelamento
                              </button>
                              <button type="button" onClick={() => setCancelando(false)} className="btn-ghost btn-sm">
                                Voltar
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {principal && (
                              <AcaoBotao action={principal} destaque disabled={pending} onClick={() => agir(principal)} />
                            )}
                            {outras.map((ac) => (
                              <AcaoBotao key={ac} action={ac} disabled={pending} onClick={() => agir(ac)} />
                            ))}
                          </div>
                        )}
                        {erro && (
                          <p role="alert" className="mt-2 text-sm text-destructive">
                            {erro}
                          </p>
                        )}
                      </Card>
                    </div>
                  )}

                  {aba === 'financeiro' && detail.financial && (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Numero label="Contratado" valor={brl(detail.financial.contracted)} />
                        <Numero label="Pago" valor={brl(detail.financial.paid)} tom="text-green-700 dark:text-green-400" />
                        <Numero
                          label="Em aberto"
                          valor={brl(detail.financial.balance)}
                          tom={detail.financial.balance > 0 ? 'text-red-700 dark:text-red-400' : ''}
                        />
                      </div>
                      {detail.financial.lastPayment && (
                        <p className="text-sm text-muted-foreground">
                          Último pagamento: {brl(detail.financial.lastPayment.amount)} em{' '}
                          {format(new Date(detail.financial.lastPayment.paidAt), 'dd/MM/yyyy')}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/pacientes/${detail.patient.id}`} className="btn-primary btn-sm">
                          <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Registrar pagamento na ficha
                        </Link>
                        <Link href={`/orcamentos/novo?patientId=${detail.patient.id}`} className="btn-outline btn-sm">
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Novo orçamento
                        </Link>
                      </div>
                    </div>
                  )}

                  {aba === 'historico' &&
                    (detail.history.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Primeiro agendamento deste paciente na clínica.</p>
                    ) : (
                      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                        {detail.history.map((h) => {
                          const s = stageOf(h);
                          const st = STATUS_STYLES[s] ?? STATUS_STYLES.SCHEDULED;
                          return (
                            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                              <span className="tabular-nums">
                                {format(new Date(h.startTime), 'dd/MM/yyyy')} · {wallClockTime(h.startTime)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                {h.professional.name}
                                {h.procedure ? ` · ${h.procedure.name}` : ''}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.bg} ${st.text}`}>{STAGE_LABELS[s]}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ))}
                </div>
              </>
            )}
          </div>

          {detail && a && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={excluir}
                disabled={pending}
                className="btn-sm inline-flex items-center gap-1.5 rounded-md bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Excluir agendamento
              </button>

              <div className="flex-1" />

              <RotuloSelect labels={labels} atual={a.label} disabled={pending} onChange={trocarRotulo} />

              <DropdownMenu.Root>
                <DropdownMenu.Trigger className="btn-outline btn-sm inline-flex items-center gap-1.5">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" /> Opções
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="z-[60] min-w-52 rounded-xl border border-border bg-surface p-1 shadow-xl">
                    <MenuLink href={`/pacientes/${detail.patient.id}`} icone={UserRound}>Ficha do paciente</MenuLink>
                    <MenuLink href={`/orcamentos/novo?patientId=${detail.patient.id}`} icone={FileText}>Novo orçamento</MenuLink>
                    <DropdownMenu.Item
                      onSelect={() => onEdit(a)}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-alt"
                    >
                      <CalendarClock className="h-4 w-4" aria-hidden="true" /> Remarcar
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <button type="button" onClick={() => onEdit(a)} className="btn-primary btn-sm inline-flex items-center gap-1.5">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
              </button>
            </div>
          )}
          <p role="status" aria-live="polite" className="sr-only">
            {aviso}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4" aria-label={titulo}>
      <h3 className="mb-3 text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

function Numero({ label, valor, tom = '' }: { label: string; valor: string; tom?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tom}`}>{valor}</p>
    </div>
  );
}

function Passo({
  icone: Icone,
  titulo,
  quando,
  quem,
  extra,
}: {
  icone: typeof Check;
  titulo: string;
  quando?: Date | string;
  quem?: string | null;
  extra?: string;
}) {
  return (
    <li className="relative">
      <span className="absolute -left-[25px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface ring-1 ring-border" aria-hidden="true">
        <Icone className="h-2.5 w-2.5 text-muted-foreground" />
      </span>
      <span className="font-medium">{titulo}</span>
      {quando && <span className="text-muted-foreground"> · {format(new Date(quando), 'dd/MM')} às {hora(quando)}</span>}
      {quem && <span className="text-muted-foreground"> · {quem}</span>}
      {extra && <span className="text-muted-foreground"> · {extra}</span>}
    </li>
  );
}

function AcaoBotao({ action, destaque = false, disabled, onClick }: { action: FlowAction; destaque?: boolean; disabled: boolean; onClick: () => void }) {
  const Icone = ACTION_ICON[action];
  const perigo = action === 'cancel' || action === 'miss';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'btn-sm inline-flex items-center gap-1.5 disabled:opacity-50',
        destaque ? 'btn-primary' : perigo ? 'btn-outline text-destructive' : 'btn-outline',
      ].join(' ')}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" /> {ACTION_LABELS[action]}
    </button>
  );
}

function RotuloSelect({
  labels,
  atual,
  disabled,
  onChange,
}: {
  labels: LabelOption[];
  atual: LabelOption | null;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const ref = useRef<HTMLSelectElement>(null);
  const opcoes = atual && !labels.some((l) => l.id === atual.id) ? [...labels, atual] : labels;
  return (
    <div className="relative flex items-center">
      <Tag
        className={`pointer-events-none absolute left-2.5 h-3.5 w-3.5 ${atual ? labelClasses(atual.color).chip.split(' ')[1] : 'text-muted-foreground'}`}
        aria-hidden="true"
      />
      <label htmlFor={id} className="sr-only">
        Rótulo
      </label>
      <select
        ref={ref}
        id={id}
        value={atual?.id ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-border bg-surface pl-7 pr-7 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        <option value="">Sem rótulo</option>
        {opcoes.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function MenuLink({ href, icone: Icone, children }: { href: string; icone: typeof Check; children: React.ReactNode }) {
  return (
    <DropdownMenu.Item asChild>
      <Link href={href} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-alt">
        <Icone className="h-4 w-4" aria-hidden="true" /> {children}
      </Link>
    </DropdownMenu.Item>
  );
}
