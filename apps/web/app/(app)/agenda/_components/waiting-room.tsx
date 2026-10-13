'use client';

import { useEffect, useState } from 'react';
import { Armchair, Stethoscope } from 'lucide-react';
import { stageOf, waitingMinutes } from '@/lib/appointment-flow';
import { wallClockTime } from '@/lib/tz';

interface Item {
  id: string;
  startTime: Date | string;
  status: string;
  arrivedAt?: Date | string | null;
  startedAt?: Date | string | null;
  patient: { name: string };
  professional: { name: string };
}

/** O dia de hoje no fuso da clínica, "AAAA-MM-DD" (agenda guarda hora de parede em UTC). */
function hojeNaClinica() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/**
 * A sala de espera do dia, na lateral da agenda: quem chegou (e há quanto
 * tempo espera) e quem está em atendimento. Clicar abre os detalhes, onde a
 * recepção chama o paciente para entrar.
 */
export function WaitingRoom({ appointments, onOpen }: { appointments: Item[]; onOpen: (id: string) => void }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const hoje = hojeNaClinica();
  const doDia = appointments.filter((a) => new Date(a.startTime).toISOString().slice(0, 10) === hoje);
  const esperando = doDia
    .filter((a) => stageOf(a) === 'ARRIVED')
    .sort((x, y) => new Date(x.arrivedAt!).getTime() - new Date(y.arrivedAt!).getTime());
  const atendendo = doDia.filter((a) => stageOf(a) === 'IN_PROGRESS');

  return (
    <section aria-labelledby="sala-de-espera-titulo">
      <h2 id="sala-de-espera-titulo" className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sala de espera
        <span className="rounded-full bg-violet-100 px-1.5 text-[11px] font-bold text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
          {esperando.length}
        </span>
      </h2>
      {esperando.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Ninguém esperando agora.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {esperando.map((a) => {
            const min = waitingMinutes(a, agora) ?? 0;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-left text-sm hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Armchair className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.patient.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {wallClockTime(a.startTime)} · {a.professional.name}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums ${min >= 20 ? 'text-red-700 dark:text-red-400' : min >= 10 ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}
                  >
                    {min} min<span className="sr-only"> esperando</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {atendendo.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Em atendimento</h3>
          <ul className="mt-2 space-y-1.5">
            {atendendo.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-left text-sm hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Stethoscope className="h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.patient.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{a.professional.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
