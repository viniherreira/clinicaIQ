'use client';

import { addDays, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { stageOf, STAGE_LABELS } from '@/lib/appointment-flow';
import { wallClockTime } from '@/lib/tz';

interface Appt {
  id: string;
  startTime: Date | string;
  status: string;
  arrivedAt?: Date | string | null;
  startedAt?: Date | string | null;
  patient: { name: string };
  professional: { id: string; name: string };
}

const SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MAX_POR_DIA = 3;

/**
 * A agenda do mês, como a do Clínica nas Nuvens: cada dia com os primeiros
 * horários e "+N" para o resto. Clicar no dia abre a agenda daquele dia;
 * clicar num horário abre os detalhes.
 */
export function MonthGrid({
  dateStr,
  appointments,
  professionalColors,
  visibleProfessionals,
  onDayClick,
  onAppointmentClick,
}: {
  dateStr: string;
  appointments: Appt[];
  professionalColors: Record<string, string>;
  visibleProfessionals: Set<string>;
  onDayClick: (date: string) => void;
  onAppointmentClick: (id: string) => void;
}) {
  const ref = parseISO(dateStr);
  const inicio = startOfWeek(startOfMonth(ref), { weekStartsOn: 1 });
  const fim = endOfWeek(endOfMonth(ref), { weekStartsOn: 1 });
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

  const porDia = new Map<string, Appt[]>();
  for (const a of appointments) {
    if (!visibleProfessionals.has(a.professional.id)) continue;
    const dia = new Date(a.startTime).toISOString().slice(0, 10);
    const lista = porDia.get(dia) ?? [];
    lista.push(a);
    porDia.set(dia, lista);
  }

  const dias: Date[] = [];
  for (let d = inicio; d <= fim; d = addDays(d, 1)) dias.push(d);

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="grid grid-cols-7 border-b border-border bg-surface-alt/50" aria-hidden="true">
        {SEMANA.map((s) => (
          <div key={s} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {s}
          </div>
        ))}
      </div>
      <ol className="grid flex-1 grid-cols-7 auto-rows-fr" aria-label={`Agenda de ${format(ref, 'MMMM yyyy', { locale: ptBR })}`}>
        {dias.map((d) => {
          const chave = format(d, 'yyyy-MM-dd');
          const lista = (porDia.get(chave) ?? []).sort((x, y) => new Date(x.startTime).getTime() - new Date(y.startTime).getTime());
          const doMes = isSameMonth(d, ref);
          const eHoje = chave === hoje;
          const nomeDia = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
          return (
            <li key={chave} className={`flex min-h-[104px] flex-col gap-1 border-b border-r border-border p-1.5 ${doMes ? 'bg-surface' : 'bg-surface-alt/40'}`}>
              <button
                type="button"
                onClick={() => onDayClick(chave)}
                aria-label={`${nomeDia}, ${lista.length} ${lista.length === 1 ? 'agendamento' : 'agendamentos'}`}
                className={`flex h-7 w-7 items-center justify-center self-end rounded-full text-sm tabular-nums hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring ${eHoje ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary-hover' : doMes ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {format(d, 'd')}
              </button>
              <ul className="space-y-0.5">
                {lista.slice(0, MAX_POR_DIA).map((a) => {
                  const stage = stageOf(a);
                  const cancelado = stage === 'CANCELLED' || stage === 'MISSED';
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onAppointmentClick(a.id)}
                        aria-label={`${wallClockTime(a.startTime)} ${a.patient.name}, ${a.professional.name}, ${STAGE_LABELS[stage]}`}
                        className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring ${cancelado ? 'text-muted-foreground line-through' : ''}`}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: professionalColors[a.professional.id] ?? '#94a3b8' }} aria-hidden="true" />
                        <span className="shrink-0 tabular-nums text-muted-foreground">{wallClockTime(a.startTime)}</span>
                        <span className="truncate font-medium">{a.patient.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {lista.length > MAX_POR_DIA && (
                <button
                  type="button"
                  onClick={() => onDayClick(chave)}
                  className="mt-auto self-start rounded px-1 text-[11px] font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  +{lista.length - MAX_POR_DIA} mais<span className="sr-only"> em {nomeDia}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
