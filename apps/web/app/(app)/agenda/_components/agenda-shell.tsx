'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, LayoutGrid, Columns2 } from 'lucide-react';
import { MiniCalendar } from './mini-calendar';
import { ProfessionalFilter } from './professional-filter';
import { CalendarGrid } from './calendar-grid';
import { AppointmentModal, type EditingAppointment } from './appointment-modal';
import { AppointmentDetailModal } from './appointment-detail-modal';
import { getAgendaData } from '../actions';
import { wallClockTime } from '@/lib/tz';

type AgendaData = Awaited<ReturnType<typeof getAgendaData>>;

interface ModalState {
  open: boolean;
  defaultDate: string;
  defaultTime?: string;
  defaultProfessionalId?: string;
}

interface AgendaShellProps {
  initialDate: string;
  initialView: 'day' | 'week';
  initialData: AgendaData;
}

export function AgendaShell({ initialDate, initialView, initialData }: AgendaShellProps) {
  const router = useRouter();

  const [currentDate, setCurrentDate] = useState(initialDate);
  const [view, setView] = useState<'day' | 'week'>(initialView);
  const [mode, setMode] = useState<'grouped' | 'sidebyside'>('sidebyside');
  const [data, setData] = useState<AgendaData>(initialData);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingAppointment | null>(null);
  const [modal, setModal] = useState<ModalState>({ open: false, defaultDate: initialDate });

  const [visibleProfessionals, setVisibleProfessionals] = useState<Set<string>>(
    () => new Set(initialData.professionals.map((p) => p.id)),
  );

  useEffect(() => {
    setVisibleProfessionals((prev) => {
      const ids = new Set(data.professionals.map((p) => p.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      data.professionals.forEach((p) => { if (!prev.has(p.id)) next.add(p.id); });
      return next;
    });
  }, [data.professionals]);

  async function navigate(dateStr: string, nextView?: 'day' | 'week') {
    setLoading(true);
    try {
      const v = nextView ?? view;
      const fresh = await getAgendaData(dateStr, v);
      setData(fresh);
      setCurrentDate(dateStr);
      if (nextView) setView(nextView);
      router.replace(`/agenda?date=${dateStr}&view=${v}`, { scroll: false });
    } finally {
      setLoading(false);
    }
  }

  async function refreshData() {
    setData(await getAgendaData(currentDate, view));
  }

  function goPrev() { navigate(format(subDays(parseISO(currentDate), 1), 'yyyy-MM-dd')); }
  function goNext() { navigate(format(addDays(parseISO(currentDate), 1), 'yyyy-MM-dd')); }
  function goToday() { navigate(format(new Date(), 'yyyy-MM-dd')); }

  function openNewModal(professionalId?: string, timeStr?: string) {
    setEditing(null);
    setModal({ open: true, defaultDate: currentDate, defaultTime: timeStr, defaultProfessionalId: professionalId });
  }

  interface EditableDetail {
    id: string;
    startTime: Date | string;
    endTime: Date | string;
    status: string;
    type: string;
    notes: string | null;
    patient: { id: string; name: string; controlNumber: number };
    professional: { id: string; name: string };
    procedure: { id: string } | null;
  }

  function startEdit(detail: EditableDetail) {
    setDetailId(null);
    setEditing({
      id: detail.id,
      patientId: detail.patient.id,
      patientName: detail.patient.name,
      patientControlNumber: detail.patient.controlNumber,
      professionalId: detail.professional.id,
      procedureId: detail.procedure?.id ?? null,
      date: new Date(detail.startTime).toISOString().slice(0, 10),
      startTime: wallClockTime(detail.startTime),
      endTime: wallClockTime(detail.endTime),
      type: detail.type,
      status: detail.status,
      notes: detail.notes,
    });
    setModal({ open: true, defaultDate: currentDate });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (modal.open || detailId) return;
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 't' || e.key === 'T') goToday();
      else if (e.key === 'd' || e.key === 'D') navigate(currentDate, 'day');
      else if (e.key === 's' || e.key === 'S') navigate(currentDate, 'week');
      else if (e.key === 'n' || e.key === 'N') openNewModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, view, modal.open, detailId]);

  const dateLabel = format(parseISO(currentDate), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  // Plain string compare against the browser's calendar date — immune to
  // timezone/parse quirks that could make other days read as "today".
  const todayActive = currentDate === format(new Date(), 'yyyy-MM-dd');
  const hasProfessionals = data.professionals.length > 0;

  return (
    <>
      <div className="flex h-full overflow-hidden bg-background">
        {/* Sidebar — hidden on small screens; header arrows/mini date nav cover mobile */}
        <aside className="hidden w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-4 lg:flex">
          <MiniCalendar selectedDate={currentDate} onSelect={(d) => navigate(d)} />
          <div className="border-t border-border pt-4">
            <ProfessionalFilter
              professionals={data.professionals}
              selected={visibleProfessionals}
              onChange={setVisibleProfessionals}
            />
          </div>
        </aside>

        {/* Main */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2 sm:px-4">
            <div className="segmented" role="group" aria-label="Navegar entre dias">
              <button type="button" onClick={goPrev} className="segmented-item !px-2" aria-label="Dia anterior (seta esquerda)">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={goToday}
                aria-pressed={todayActive}
                className="segmented-item"
                aria-label="Ir para hoje (T)"
              >
                Hoje
              </button>
              <button type="button" onClick={goNext} className="segmented-item !px-2" aria-label="Próximo dia (seta direita)">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold capitalize text-foreground" aria-live="polite">
              {dateLabel}
              {loading && <span className="ml-2 text-xs font-normal text-muted-foreground" aria-hidden="true">carregando…</span>}
            </h1>

            <div className="segmented" role="group" aria-label="Modo de visualização">
              <button type="button" onClick={() => navigate(currentDate, 'day')} className="segmented-item" aria-pressed={view === 'day'}>Dia</button>
              <button type="button" onClick={() => navigate(currentDate, 'week')} className="segmented-item" aria-pressed={view === 'week'}>Semana</button>
            </div>

            <div className="segmented hidden sm:inline-flex" role="group" aria-label="Layout das agendas">
              <button type="button" onClick={() => setMode('grouped')} title="Agrupado" aria-label="Visualização agrupada" aria-pressed={mode === 'grouped'} className="segmented-item !px-2">
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setMode('sidebyside')} title="Lado a lado" aria-label="Visualização lado a lado" aria-pressed={mode === 'sidebyside'} className="segmented-item !px-2">
                <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => openNewModal()}
              className="btn-primary btn-sm !h-9 sm:px-3.5"
              aria-label="Novo agendamento (N)"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Novo agendamento</span>
              <span className="sm:hidden">Novo</span>
            </button>
          </header>

          {/* Grid / empty state */}
          <div className="flex-1 overflow-auto overscroll-contain bg-surface">
            {hasProfessionals ? (
              <CalendarGrid
                dateStr={currentDate}
                professionals={data.professionals}
                appointments={data.appointments}
                visibleProfessionals={visibleProfessionals}
                mode={mode}
                onAppointmentClick={(id) => setDetailId(id)}
                onSlotClick={(professionalId, _dateStr, timeStr) => openNewModal(professionalId, timeStr)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>
                </div>
                <h2 className="text-base font-semibold">Sua agenda está pronta</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Cadastre os profissionais da clínica para começar a agendar. Cada um recebe uma cor para identificação na agenda.
                </p>
                <Link
                  href="/configuracoes"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Adicionar profissional
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <AppointmentModal
        key={editing?.id ?? 'new'}
        open={modal.open}
        onClose={() => {
          setModal((m) => ({ ...m, open: false }));
          setEditing(null);
        }}
        professionals={data.professionals}
        procedures={data.procedures}
        defaultDate={modal.defaultDate}
        defaultTime={modal.defaultTime}
        defaultProfessionalId={modal.defaultProfessionalId}
        editing={editing}
        onSuccess={() => {
          refreshData();
          setEditing(null);
        }}
      />

      <AppointmentDetailModal
        open={!!detailId}
        appointmentId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={refreshData}
        onEdit={startEdit}
      />
    </>
  );
}
