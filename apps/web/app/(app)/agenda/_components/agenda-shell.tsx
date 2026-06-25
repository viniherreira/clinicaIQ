'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, addDays, subDays, parseISO, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, LayoutGrid, Columns2 } from 'lucide-react';
import { MiniCalendar } from './mini-calendar';
import { ProfessionalFilter } from './professional-filter';
import { CalendarGrid } from './calendar-grid';
import { AppointmentModal } from './appointment-modal';
import { AppointmentDetailModal } from './appointment-detail-modal';
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
  const [detailId, setDetailId] = useState<string | null>(null);
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
    setModal({ open: true, defaultDate: currentDate, defaultTime: timeStr, defaultProfessionalId: professionalId });
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
  const todayActive = isToday(parseISO(currentDate));
  const hasProfessionals = data.professionals.length > 0;

  const segBtn = (active: boolean) =>
    [
      'px-2.5 py-1 text-xs font-medium transition-colors',
      active ? 'bg-surface-alt text-foreground' : 'text-muted-foreground hover:bg-surface-alt/60',
    ].join(' ');
  const iconBtn = (active: boolean) =>
    [
      'p-1.5 transition-colors',
      active ? 'bg-surface-alt text-foreground' : 'text-muted-foreground hover:bg-surface-alt/60',
    ].join(' ');

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <aside className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-4">
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
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-4">
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={goPrev} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="Dia anterior (seta esquerda)">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={goNext} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="Próximo dia (seta direita)">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={goToday}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                todayActive ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20' : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground',
              ].join(' ')}
              aria-label="Ir para hoje (T)"
            >
              Hoje
            </button>

            <h1 className="flex-1 truncate text-sm font-semibold capitalize text-foreground" aria-live="polite">
              {dateLabel}
            </h1>

            {loading && <span className="text-xs text-muted-foreground" aria-hidden="true">Carregando…</span>}

            <div className="flex items-center overflow-hidden rounded-md border border-border">
              <button type="button" onClick={() => navigate(currentDate, 'day')} className={segBtn(view === 'day')} aria-pressed={view === 'day'}>Dia</button>
              <button type="button" onClick={() => navigate(currentDate, 'week')} className={`border-l border-border ${segBtn(view === 'week')}`} aria-pressed={view === 'week'}>Semana</button>
            </div>

            <div className="flex items-center overflow-hidden rounded-md border border-border">
              <button type="button" onClick={() => setMode('grouped')} title="Agrupado" aria-label="Visualização agrupada" aria-pressed={mode === 'grouped'} className={iconBtn(mode === 'grouped')}>
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setMode('sidebyside')} title="Lado a lado" aria-label="Visualização lado a lado" aria-pressed={mode === 'sidebyside'} className={`border-l border-border ${iconBtn(mode === 'sidebyside')}`}>
                <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => openNewModal()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="Novo agendamento (N)"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Novo
            </button>
          </header>

          {/* Grid / empty state */}
          <div className="flex-1 overflow-auto">
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
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        professionals={data.professionals}
        procedures={data.procedures}
        defaultDate={modal.defaultDate}
        defaultTime={modal.defaultTime}
        defaultProfessionalId={modal.defaultProfessionalId}
        onSuccess={refreshData}
      />

      <AppointmentDetailModal
        open={!!detailId}
        appointmentId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={refreshData}
      />
    </>
  );
}
