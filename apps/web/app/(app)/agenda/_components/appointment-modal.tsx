'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Loader2, Check, CalendarDays } from 'lucide-react';
import { createAppointment, updateAppointment, searchPatients } from '../actions';
import type { AppointmentFormState } from '../actions';
import { STATUS_LABELS, TYPE_LABELS } from './constants';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface Professional {
  id: string;
  name: string;
  specialty?: string | null;
  color: string;
}

interface Procedure {
  id: string;
  name: string;
  durationMinutes: number;
  basePrice: number;
}

interface Patient {
  id: string;
  name: string;
  controlNumber: number;
}

export interface EditingAppointment {
  id: string;
  patientId: string;
  patientName: string;
  patientControlNumber: number;
  professionalId: string;
  procedureId: string | null;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  type: string;
  status: string;
  notes: string | null;
}

interface AppointmentModalProps {
  open: boolean;
  onClose: () => void;
  professionals: Professional[];
  procedures: Procedure[];
  defaultDate: string;
  defaultTime?: string;
  defaultProfessionalId?: string;
  /** When set, the modal edits this appointment instead of creating one.
   *  Callers should also key the modal by the appointment id so state resets. */
  editing?: EditingAppointment | null;
  onSuccess: () => void;
}

const NOTES_LIMIT = 500;

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.min(Math.floor(total / 60), 23);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

const inputCls =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const labelCls = 'text-xs font-medium text-foreground';

export function AppointmentModal({
  open, onClose, professionals, procedures,
  defaultDate, defaultTime = '08:00', defaultProfessionalId,
  editing = null,
  onSuccess,
}: AppointmentModalProps) {
  const [state, formAction, pending] = useActionState<AppointmentFormState | null, FormData>(
    editing ? updateAppointment.bind(null, editing.id) : createAppointment,
    null,
  );

  // Patient search
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showPatients, setShowPatients] = useState(false);
  const [searching, startSearch] = useTransition();
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic id per search — lets us drop out-of-order (stale) responses.
  const searchSeq = useRef(0);

  // Form fields
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultTime);
  const [endTime, setEndTime] = useState(addMinutesToTime(defaultTime, 30));
  const [profId, setProfId] = useState(defaultProfessionalId ?? professionals[0]?.id ?? '');
  const [procId, setProcId] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState(editing?.type ?? 'PARTICULAR');
  const [status, setStatus] = useState(editing?.status ?? 'SCHEDULED');

  // Reset when modal opens (prefilled from `editing` in edit mode)
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date);
      setStartTime(editing.startTime);
      setEndTime(editing.endTime);
      setProfId(editing.professionalId);
      setProcId(editing.procedureId ?? '');
      setType(editing.type);
      setStatus(editing.status);
      setSelectedPatient({
        id: editing.patientId,
        name: editing.patientName,
        controlNumber: editing.patientControlNumber,
      });
      setQuery(editing.patientName);
      setNotes(editing.notes ?? '');
      setPatients([]);
    } else {
      setDate(defaultDate);
      setStartTime(defaultTime);
      setEndTime(addMinutesToTime(defaultTime, 30));
      setProfId(defaultProfessionalId ?? professionals[0]?.id ?? '');
      setProcId('');
      setType('PARTICULAR');
      setStatus('SCHEDULED');
      setQuery('');
      setNotes('');
      setSelectedPatient(null);
      setPatients([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultDate, defaultTime, defaultProfessionalId]);

  // Close on success
  useEffect(() => {
    if (state?.success) {
      onSuccess();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Patient search debounce
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!query.trim() || selectedPatient) {
      setPatients([]);
      setShowPatients(false);
      return;
    }
    searchRef.current = setTimeout(() => {
      const seq = ++searchSeq.current;
      startSearch(async () => {
        const results = await searchPatients(query);
        if (seq !== searchSeq.current) return; // stale response — a newer search is in flight
        setPatients(results);
        setShowPatients(true);
      });
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function selectPatient(p: Patient) {
    setSelectedPatient(p);
    setQuery(p.name);
    setShowPatients(false);
  }

  function onProcedureChange(id: string) {
    setProcId(id);
    const proc = procedures.find((p) => p.id === id);
    if (proc) setEndTime(addMinutesToTime(startTime, proc.durationMinutes));
  }

  function onStartTimeChange(t: string) {
    setStartTime(t);
    const proc = procedures.find((p) => p.id === procId);
    setEndTime(addMinutesToTime(t, proc?.durationMinutes ?? 30));
  }

  const errorFor = (field: string) =>
    state && !state.success ? state.errors?.[field]?.[0] : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
              </span>
              <Dialog.Title className="text-base font-semibold tracking-tight text-foreground">
                {editing ? 'Editar agendamento' : 'Novo agendamento'}
              </Dialog.Title>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </Dialog.Close>
          </div>

          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
              <input type="hidden" name="patientId" value={selectedPatient?.id ?? ''} />
              <input type="hidden" name="professionalId" value={profId} />
              <input type="hidden" name="procedureId" value={procId} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="status" value={status} />

              {state && !state.success && state.message && (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                  {state.message}
                </p>
              )}

              {/* Dados do agendamento */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Dados do agendamento
                </legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="col-span-2 space-y-1.5 sm:col-span-1">
                    <label className={labelCls} htmlFor="date">Data <span className="text-destructive">*</span></label>
                    <input id="date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
                    {errorFor('date') && <p className="text-xs text-destructive">{errorFor('date')}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls} htmlFor="startTime">Início <span className="text-destructive">*</span></label>
                    <input id="startTime" name="startTime" type="time" value={startTime} onChange={(e) => onStartTimeChange(e.target.value)} className={inputCls} />
                    {errorFor('startTime') && <p className="text-xs text-destructive">{errorFor('startTime')}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls} htmlFor="endTime">Fim <span className="text-destructive">*</span></label>
                    <input id="endTime" name="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
                    {errorFor('endTime') && <p className="text-xs text-destructive">{errorFor('endTime')}</p>}
                  </div>
                  <div className="col-span-2 space-y-1.5 sm:col-span-1">
                    <span className={`${labelCls} block`} id="type-label">Tipo</span>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger aria-labelledby="type-label">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TYPE_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <span className={`${labelCls} block`} id="prof-label">Profissional <span className="text-destructive">*</span></span>
                    <Select value={profId || undefined} onValueChange={setProfId}>
                      <SelectTrigger aria-labelledby="prof-label">
                        <SelectValue placeholder="Selecione o profissional" />
                      </SelectTrigger>
                      <SelectContent>
                        {professionals.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                              {p.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errorFor('professionalId') && <p className="text-xs text-destructive">{errorFor('professionalId')}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <span className={`${labelCls} block`} id="proc-label">Procedimento</span>
                    <Select value={procId || undefined} onValueChange={(v) => onProcedureChange(v === '__none__' ? '' : v)}>
                      <SelectTrigger aria-labelledby="proc-label">
                        <SelectValue placeholder="— Selecione —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum procedimento</SelectItem>
                        {procedures.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <span className="inline-flex items-baseline gap-1.5">
                              {p.name}
                              <span className="text-xs text-muted-foreground">({p.durationMinutes}min)</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>

              {/* Paciente */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Paciente
                </legend>
                <div className="space-y-1.5">
                  <label className={labelCls} htmlFor="patient-search">
                    Buscar paciente <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />}
                    {selectedPatient && !searching && (
                      <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" aria-hidden="true" />
                    )}
                    <input
                      id="patient-search"
                      role="combobox"
                      aria-controls="patient-listbox"
                      type="text"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setSelectedPatient(null); }}
                      onFocus={() => { if (query.trim() && !selectedPatient) setShowPatients(true); }}
                      onBlur={() => setTimeout(() => setShowPatients(false), 150)}
                      placeholder="Digite o nome do paciente..."
                      autoComplete="off"
                      className={`${inputCls} pl-9 pr-9`}
                      aria-autocomplete="list"
                      aria-expanded={showPatients}
                    />
                    {showPatients && !selectedPatient && (
                      <ul
                        id="patient-listbox"
                        role="listbox"
                        className="absolute z-10 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1.5 shadow-xl"
                      >
                        {patients.length === 0 && !searching && (
                          <li className="px-3 py-4 text-center text-sm text-muted-foreground" aria-live="polite">
                            Nenhum paciente encontrado para “{query.trim()}”.
                          </li>
                        )}
                        {patients.map((p) => (
                          <li key={p.id} role="option" aria-selected={false}>
                            <button
                              type="button"
                              onMouseDown={() => selectPatient(p)}
                              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-alt"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
                                {p.name.trim().charAt(0).toUpperCase()}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                                <span className="block text-xs text-muted-foreground">Ficha nº {String(p.controlNumber).padStart(4, '0')}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {selectedPatient ? (
                    <p className="text-xs text-muted-foreground">
                      Selecionado: <span className="font-medium text-foreground">{selectedPatient.name}</span> · Ficha nº {String(selectedPatient.controlNumber).padStart(4, '0')}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Digite e clique no paciente na lista.</p>
                  )}
                  {errorFor('patientId') && <p className="text-xs text-destructive">{errorFor('patientId')}</p>}
                </div>
              </fieldset>

              {/* Situação + Observações */}
              <fieldset className="space-y-3">
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Detalhes
                </legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <span className={`${labelCls} block`} id="status-label">Situação do agendamento</span>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger aria-labelledby="status-label">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className={labelCls} htmlFor="notes">Observações</label>
                    <textarea
                      id="notes"
                      name="notes"
                      rows={2}
                      maxLength={NOTES_LIMIT}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observações sobre o agendamento..."
                      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    />
                    <p className="text-right text-[11px] tabular-nums text-muted-foreground">
                      {notes.length} / {NOTES_LIMIT}
                    </p>
                  </div>
                </div>
              </fieldset>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-surface-alt/50 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              {!editing && (
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" name="sendWhatsApp" value="true" defaultChecked className="h-4 w-4 rounded accent-primary" />
                  <span className="text-xs text-foreground">Enviar confirmação por WhatsApp</span>
                </label>
              )}
              <div className="flex flex-1 justify-end gap-2">
                <button type="button" onClick={onClose} className="btn-outline btn-md">
                  <X className="h-4 w-4" aria-hidden="true" />
                  Cancelar
                </button>
                <button type="submit" disabled={pending || !selectedPatient} className="btn-primary btn-md min-w-32">
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                  {editing ? 'Salvar alterações' : 'Agendar'}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
