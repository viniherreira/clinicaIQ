'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { wallClockTime } from '@/lib/tz';
import { getAppointment, updateAppointmentStatus } from '../actions';
import { STATUS_STYLES, STATUS_LABELS, TYPE_LABELS } from './constants';

type Detail = Awaited<ReturnType<typeof getAppointment>>;
type Status = keyof typeof STATUS_LABELS;

interface Props {
  open: boolean;
  appointmentId: string | null;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (detail: NonNullable<Detail>) => void;
}

const ACTIONS: { status: Status; label: string }[] = [
  { status: 'CONFIRMED', label: 'Confirmar' },
  { status: 'ATTENDED', label: 'Compareceu' },
  { status: 'MISSED', label: 'Faltou' },
  { status: 'RESCHEDULED', label: 'Remarcar' },
  { status: 'CANCELLED', label: 'Cancelar' },
];

export function AppointmentDetailModal({ open, appointmentId, onClose, onChanged, onEdit }: Props) {
  const titleId = useId();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !appointmentId) return;
    setDetail(null);
    setLoading(true);
    getAppointment(appointmentId)
      .then((d) => setDetail(d))
      .finally(() => setLoading(false));
  }, [open, appointmentId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function setStatus(status: Status) {
    if (!appointmentId) return;
    startTransition(async () => {
      await updateAppointmentStatus(appointmentId, status);
      onChanged();
      onClose();
    });
  }

  const currentStatus = (detail?.status ?? 'SCHEDULED') as Status;
  const statusStyle = STATUS_STYLES[currentStatus] ?? STATUS_STYLES.SCHEDULED;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Agendamento</p>
            <h2 id={titleId} className="mt-0.5 truncate text-lg font-semibold tracking-tight">
              {loading ? 'Carregando…' : (detail?.patient.name ?? 'Não encontrado')}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {detail && (
              <button
                type="button"
                onClick={() => onEdit(detail)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-alt transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>
        </div>

        {detail && (
          <>
            <dl className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} aria-hidden="true" />
                  {STATUS_LABELS[currentStatus]}
                </span>
                <span className="rounded-full bg-surface-alt px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {TYPE_LABELS[detail.type as keyof typeof TYPE_LABELS] ?? detail.type}
                </span>
              </div>

              <Row label="Quando">
                <span className="capitalize">
                  {format(new Date(detail.startTime), "EEEE, d 'de' MMM", { locale: ptBR })}
                </span>
                {' · '}
                <span className="font-medium tabular-nums">
                  {wallClockTime(detail.startTime)}–{wallClockTime(detail.endTime)}
                </span>
              </Row>
              <Row label="Profissional">{detail.professional.name}</Row>
              {detail.procedure && <Row label="Procedimento">{detail.procedure.name}</Row>}
              {detail.notes && <Row label="Observações">{detail.notes}</Row>}
            </dl>

            <div className="border-t border-border p-4">
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Alterar situação</p>
              <div className="flex flex-wrap gap-2">
                {ACTIONS.map((a) => {
                  const active = currentStatus === a.status;
                  return (
                    <button
                      key={a.status}
                      type="button"
                      disabled={isPending || active}
                      onClick={() => setStatus(a.status)}
                      className={[
                        'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-surface-alt',
                      ].join(' ')}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {!loading && !detail && (
          <p className="p-5 text-sm text-muted-foreground">Este agendamento não está mais disponível.</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
