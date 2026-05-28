'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, addDays, subDays, parseISO, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, LayoutGrid, Columns2 } from 'lucide-react';
import { MiniCalendar } from './mini-calendar';
import { ProfessionalFilter } from './professional-filter';
import { CalendarGrid } from './calendar-grid';
import { AppointmentModal } from './appointment-modal';
import { getAgendaData } from '../actions';

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
  const [modal, setModal] = useState<ModalState>({
    open: false,
    defaultDate: initialDate,
  });

  const [visibleProfessionals, setVisibleProfessionals] = useState<Set<string>>(
    () => new Set(initialData.professionals.map((p) => p.id))
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
    const fresh = await getAgendaData(currentDate, view);
    setData(fresh);
  }

  function goPrev() {
    navigate(format(subDays(parseISO(currentDate), 1), 'yyyy-MM-dd'));
  }

  function goNext() {
    navigate(format(addDays(parseISO(currentDate), 1), 'yyyy-MM-dd'));
  }

  function goToday() {
    navigate(format(new Date(), 'yyyy-MM-dd'));
  }

  function openNewModal(professionalId?: string, timeStr?: string) {
    setModal({ open: true, defaultDate: currentDate, defaultTime: timeStr, defaultProfessionalId: professionalId });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (modal.open) return;
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 't' || e.key === 'T') goToday();
      else if (e.key === 'd' || e.key === 'D') navigate(currentDate, 'day');
      else if (e.key === 's' || e.key === 'S') navigate(currentDate, 'week');
      else if (e.key === 'n' || e.key === 'N') openNewModal();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentDate, view, modal.open]);

  const dateLabel = format(parseISO(currentDate), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const todayActive = isToday(parseISO(currentDate));

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-white">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-slate-100 flex flex-col gap-4 p-4 overflow-y-auto">
          <MiniCalendar
            selectedDate={currentDate}
            onSelect={(d) => navigate(d)}
          />
          <div className="border-t border-slate-100 pt-4">
            <ProfessionalFilter
              professionals={data.professionals}
              selected={visibleProfessionals}
              onChange={setVisibleProfessionals}
            />
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="shrink-0 flex items-center gap-2 border-b border-slate-100 px-4 h-14">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                aria-label="Dia anterior (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                aria-label="Próximo dia (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={goToday}
              className={[
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                todayActive
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'text-slate-600 hover:bg-slate-100',
              ].join(' ')}
              aria-label="Ir para hoje (T)"
            >
              Hoje
            </button>

            <h1 className="flex-1 text-sm font-medium text-slate-700 capitalize">
              {dateLabel}
            </h1>

            {loading && <span className="text-xs text-slate-400">Carregando…</span>}

            {/* View toggles */}
            <div className="flex items-center rounded border border-slate-200 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => navigate(currentDate, 'day')}
                className={['px-2.5 py-1', view === 'day' ? 'bg-slate-100 font-medium text-slate-800' : 'text-slate-500 hover:bg-slate-50'].join(' ')}
                aria-pressed={view === 'day'}
              >
                Dia
              </button>
              <button
                type="button"
                onClick={() => navigate(currentDate, 'week')}
                className={['px-2.5 py-1 border-l border-slate-200', view === 'week' ? 'bg-slate-100 font-medium text-slate-800' : 'text-slate-500 hover:bg-slate-50'].join(' ')}
                aria-pressed={view === 'week'}
              >
                Semana
              </button>
            </div>

            {/* Layout toggles */}
            <div className="flex items-center rounded border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setMode('grouped')}
                title="Agrupado"
                aria-pressed={mode === 'grouped'}
                className={['p-1.5', mode === 'grouped' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:bg-slate-50'].join(' ')}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMode('sidebyside')}
                title="Lado a lado"
                aria-pressed={mode === 'sidebyside'}
                className={['p-1.5 border-l border-slate-200', mode === 'sidebyside' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:bg-slate-50'].join(' ')}
              >
                <Columns2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => openNewModal()}
              className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 transition-colors"
              aria-label="Novo agendamento (N)"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Novo
            </button>
          </header>

          {/* Grid */}
          <div className="flex-1 overflow-auto">
            <CalendarGrid
              dateStr={currentDate}
              professionals={data.professionals}
              appointments={data.appointments as any}
              visibleProfessionals={visibleProfessionals}
              mode={mode}
              onAppointmentClick={(id) => {
                // Phase 4: open detail modal — for now, just log
                console.log('appointment clicked:', id);
              }}
              onSlotClick={(professionalId, _dateStr, timeStr) => openNewModal(professionalId, timeStr)}
            />
          </div>
        </div>
      </div>

      {/* New appointment modal */}
      <AppointmentModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        professionals={data.professionals}
        procedures={data.procedures}
        defaultDate={modal.defaultDate}
        defaultTime={modal.defaultTime}
        defaultProfessionalId={modal.defaultProfessionalId}
        onSuccess={refreshData}
      />
    </>
  );
}
