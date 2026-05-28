'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Search, Loader2 } from 'lucide-react';
import { createAppointment, searchPatients } from '../actions';
import type { AppointmentFormState } from '../actions';
import { STATUS_LABELS, TYPE_LABELS } from './constants';

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

interface AppointmentModalProps {
  open: boolean;
  onClose: () => void;
  professionals: Professional[];
  procedures: Procedure[];
  defaultDate: string;
  defaultTime?: string;
  defaultProfessionalId?: string;
  onSuccess: () => void;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.min(Math.floor(total / 60), 23);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function AppointmentModal({
  open, onClose, professionals, procedures,
  defaultDate, defaultTime = '08:00', defaultProfessionalId,
  onSuccess,
}: AppointmentModalProps) {
  const [state, formAction, pending] = useActionState<AppointmentFormState | null, FormData>(
    createAppointment,
    null,
  );

  // Patient search
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showPatients, setShowPatients] = useState(false);
  const [searching, startSearch] = useTransition();
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form fields
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultTime);
  const [endTime, setEndTime] = useState(addMinutesToTime(defaultTime, 30));
  const [profId, setProfId] = useState(defaultProfessionalId ?? professionals[0]?.id ?? '');
  const [procId, setProcId] = useState('');

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setStartTime(defaultTime);
      setEndTime(addMinutesToTime(defaultTime, 30));
      setProfId(defaultProfessionalId ?? professionals[0]?.id ?? '');
      setProcId('');
      setQuery('');
      setSelectedPatient(null);
      setPatients([]);
    }
  }, [open, defaultDate, defaultTime, defaultProfessionalId]);

  // Close on success
  useEffect(() => {
    if (state?.success) {
      onSuccess();
      onClose();
    }
  }, [state]);

  // Patient search debounce
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!query.trim()) { setPatients([]); return; }
    searchRef.current = setTimeout(() => {
      startSearch(async () => {
        const results = await searchPatients(query);
        setPatients(results);
        setShowPatients(true);
      });
    }, 300);
  }, [query]);

  function selectPatient(p: Patient) {
    setSelectedPatient(p);
    setQuery(p.name);
    setShowPatients(false);
  }

  function onProcedureChange(id: string) {
    setProcId(id);
    const proc = procedures.find((p) => p.id === id);
    if (proc) {
      setEndTime(addMinutesToTime(startTime, proc.durationMinutes));
    }
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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <Dialog.Title className="text-sm font-semibold text-slate-800">
              Novo agendamento
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </Dialog.Close>
          </div>

          <form action={formAction} className="p-5 space-y-4">
            {/* Hidden fields */}
            <input type="hidden" name="patientId" value={selectedPatient?.id ?? ''} />

            {/* Global error */}
            {state && !state.success && state.message && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                {state.message}
              </p>
            )}

            {/* Patient search */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor="patient-search">
                Paciente <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" aria-hidden="true" />}
                <input
                  id="patient-search"
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedPatient(null); }}
                  onFocus={() => patients.length > 0 && setShowPatients(true)}
                  onBlur={() => setTimeout(() => setShowPatients(false), 150)}
                  placeholder="Buscar paciente..."
                  autoComplete="off"
                  className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  aria-autocomplete="list"
                  aria-expanded={showPatients}
                />
                {showPatients && patients.length > 0 && (
                  <ul
                    role="listbox"
                    className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg py-1"
                  >
                    {patients.map((p) => (
                      <li key={p.id} role="option" aria-selected={selectedPatient?.id === p.id}>
                        <button
                          type="button"
                          onMouseDown={() => selectPatient(p)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-700">{p.name}</span>
                          <span className="ml-2 text-xs text-slate-400">#{p.controlNumber}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {errorFor('patientId') && <p className="text-xs text-red-500">{errorFor('patientId')}</p>}
            </div>

            {/* Professional + Procedure */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="professionalId">
                  Profissional <span className="text-red-500">*</span>
                </label>
                <select
                  id="professionalId"
                  name="professionalId"
                  value={profId}
                  onChange={(e) => setProfId(e.target.value)}
                  className="w-full rounded-md border border-slate-200 py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {errorFor('professionalId') && <p className="text-xs text-red-500">{errorFor('professionalId')}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="procedureId">
                  Procedimento
                </label>
                <select
                  id="procedureId"
                  name="procedureId"
                  value={procId}
                  onChange={(e) => onProcedureChange(e.target.value)}
                  className="w-full rounded-md border border-slate-200 py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <option value="">— Selecione —</option>
                  {procedures.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.durationMinutes}min)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date + Times */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="date">
                  Data <span className="text-red-500">*</span>
                </label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-md border border-slate-200 py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                {errorFor('date') && <p className="text-xs text-red-500">{errorFor('date')}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="startTime">
                  Início <span className="text-red-500">*</span>
                </label>
                <input
                  id="startTime"
                  name="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => onStartTimeChange(e.target.value)}
                  className="w-full rounded-md border border-slate-200 py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                {errorFor('startTime') && <p className="text-xs text-red-500">{errorFor('startTime')}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="endTime">
                  Fim <span className="text-red-500">*</span>
                </label>
                <input
                  id="endTime"
                  name="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-md border border-slate-200 py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                {errorFor('endTime') && <p className="text-xs text-red-500">{errorFor('endTime')}</p>}
              </div>
            </div>

            {/* Type + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="type">Tipo</label>
                <select
                  id="type"
                  name="type"
                  defaultValue="PARTICULAR"
                  className="w-full rounded-md border border-slate-200 py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  defaultValue="SCHEDULED"
                  className="w-full rounded-md border border-slate-200 py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600" htmlFor="notes">Observações</label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                maxLength={500}
                placeholder="Observações sobre o agendamento..."
                className="w-full rounded-md border border-slate-200 py-2 px-3 text-sm text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* WhatsApp */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="sendWhatsApp"
                value="true"
                defaultChecked
                className="accent-emerald-500 w-4 h-4"
              />
              <span className="text-xs text-slate-600">Enviar confirmação por WhatsApp</span>
            </label>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending || !selectedPatient}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                Salvar
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
