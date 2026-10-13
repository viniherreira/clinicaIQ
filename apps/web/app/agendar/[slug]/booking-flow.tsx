'use client';

import { useEffect, useId, useMemo, useState, useTransition } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock, UserRound } from 'lucide-react';
import { bookOnline, getFreeSlots, type BookingResult } from './actions';

interface Professional {
  id: string;
  name: string;
  specialty: string | null;
  color: string | null;
}
interface Procedure {
  id: string;
  name: string;
  durationMinutes: number;
}

const DIAS_POR_PAGINA = 7;

/**
 * Os passos do agendamento online: profissional (e o tipo de atendimento, se a
 * clínica liberou), dia, horário e os dados de contato. Cada escolha abre a
 * próxima logo abaixo, sem trocar de página.
 */
export function BookingFlow({
  slug,
  professionals,
  procedures,
  today,
  maxDaysAhead,
}: {
  slug: string;
  professionals: Professional[];
  procedures: Procedure[];
  today: string;
  maxDaysAhead: number;
}) {
  const id = useId();
  const [professionalId, setProfessionalId] = useState(professionals.length === 1 ? professionals[0].id : '');
  const [procedureId, setProcedureId] = useState('');
  const [inicio, setInicio] = useState(0);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState('');
  const [nome, setNome] = useState('');
  const [fone, setFone] = useState('');
  const [email, setEmail] = useState('');
  const [aceite, setAceite] = useState(false);
  const [website, setWebsite] = useState('');
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<Extract<BookingResult, { ok: true }> | null>(null);
  const [buscando, startBusca] = useTransition();
  const [enviando, startEnvio] = useTransition();

  const dias = useMemo(() => {
    const base = parseISO(today);
    return Array.from({ length: maxDaysAhead + 1 }, (_, i) => format(addDays(base, i), 'yyyy-MM-dd'));
  }, [today, maxDaysAhead]);
  const pagina = dias.slice(inicio, inicio + DIAS_POR_PAGINA);

  useEffect(() => {
    setTime('');
    if (!professionalId || !date) return setSlots(null);
    startBusca(async () => {
      setSlots(await getFreeSlots(slug, professionalId, procedureId || null, date));
    });
  }, [slug, professionalId, procedureId, date]);

  if (feito) {
    return (
      <section className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center shadow-sm" aria-live="polite">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" aria-hidden="true" />
        <h2 className="mt-3 text-xl font-semibold">Horário marcado!</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {feito.when} com {feito.professional}. A confirmação chega no seu WhatsApp.
        </p>
      </section>
    );
  }

  const passo = 'rounded-2xl border border-border bg-surface p-5 shadow-sm';
  const opcao = (ativo: boolean) =>
    `flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${ativo ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40'}`;

  return (
    <div className="mt-6 space-y-4">
      <section className={passo} aria-labelledby={`${id}-p1`}>
        <h2 id={`${id}-p1`} className="flex items-center gap-2 text-base font-semibold">
          <UserRound className="h-4 w-4 text-primary" aria-hidden="true" /> 1. Com quem?
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby={`${id}-p1`}>
          {professionals.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={professionalId === p.id}
              onClick={() => setProfessionalId(p.id)}
              className={opcao(professionalId === p.id)}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: p.color ?? '#1669C7' }} aria-hidden="true">
                {p.name.replace(/^(Dra?\.?\s+)/i, '').slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{p.name}</span>
                {p.specialty && <span className="block truncate text-xs text-muted-foreground">{p.specialty}</span>}
              </span>
            </button>
          ))}
        </div>
        {procedures.length > 0 && (
          <div className="mt-4">
            <label htmlFor={`${id}-proc`} className="block text-sm font-medium">
              Tipo de atendimento
            </label>
            <select
              id={`${id}-proc`}
              value={procedureId}
              onChange={(e) => setProcedureId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring sm:max-w-sm"
            >
              <option value="">Consulta / avaliação</option>
              {procedures.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.durationMinutes} min)
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {professionalId && (
        <section className={passo} aria-labelledby={`${id}-p2`}>
          <div className="flex items-center justify-between gap-2">
            <h2 id={`${id}-p2`} className="flex items-center gap-2 text-base font-semibold">
              <CalendarCheck className="h-4 w-4 text-primary" aria-hidden="true" /> 2. Qual dia?
            </h2>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={inicio === 0}
                onClick={() => setInicio((i) => Math.max(0, i - DIAS_POR_PAGINA))}
                className="rounded-md border border-border p-1.5 hover:bg-surface-alt disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
                aria-label="Dias anteriores"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={inicio + DIAS_POR_PAGINA >= dias.length}
                onClick={() => setInicio((i) => i + DIAS_POR_PAGINA)}
                className="rounded-md border border-border p-1.5 hover:bg-surface-alt disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
                aria-label="Próximos dias"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7" role="radiogroup" aria-labelledby={`${id}-p2`}>
            {pagina.map((d) => {
              const dt = parseISO(d);
              const ativo = date === d;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  aria-label={format(dt, "EEEE, d 'de' MMMM", { locale: ptBR })}
                  onClick={() => setDate(d)}
                  className={`flex flex-col items-center rounded-xl border py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring ${ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/40'}`}
                >
                  <span className={`text-[11px] uppercase ${ativo ? '' : 'text-muted-foreground'}`}>{format(dt, 'EEE', { locale: ptBR })}</span>
                  <span className="text-lg font-semibold tabular-nums">{format(dt, 'd')}</span>
                  <span className={`text-[11px] ${ativo ? '' : 'text-muted-foreground'}`}>{format(dt, 'MMM', { locale: ptBR })}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {professionalId && date && (
        <section className={passo} aria-labelledby={`${id}-p3`} aria-busy={buscando}>
          <h2 id={`${id}-p3`} className="flex items-center gap-2 text-base font-semibold">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" /> 3. Qual horário?
          </h2>
          {buscando || slots === null ? (
            <p className="mt-3 text-sm text-muted-foreground">Procurando horários livres…</p>
          ) : slots.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Não há horários livres neste dia. Tente outro.</p>
          ) : (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-labelledby={`${id}-p3`}>
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={time === s}
                  onClick={() => setTime(s)}
                  className={`rounded-lg border py-2 text-sm font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-ring ${time === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/40'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {time && (
        <form
          className={passo}
          aria-labelledby={`${id}-p4`}
          onSubmit={(e) => {
            e.preventDefault();
            setErro('');
            startEnvio(async () => {
              const r = await bookOnline(slug, {
                professionalId,
                procedureId: procedureId || null,
                date,
                time,
                name: nome,
                phone: fone,
                email,
                consent: aceite as true,
                website,
              });
              if (!r.ok) {
                setErro(r.message);
                if (r.message.includes('ocupado')) {
                  setTime('');
                  setSlots(await getFreeSlots(slug, professionalId, procedureId || null, date));
                }
                return;
              }
              setFeito(r);
            });
          }}
        >
          <h2 id={`${id}-p4`} className="text-base font-semibold">4. Seus dados</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(parseISO(date), "EEEE, d 'de' MMMM", { locale: ptBR })} às {time}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-nome`} className="block text-sm font-medium">Nome completo</label>
              <input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
            </div>
            <div>
              <label htmlFor={`${id}-fone`} className="block text-sm font-medium">WhatsApp com DDD</label>
              <input id={`${id}-fone`} value={fone} onChange={(e) => setFone(e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="(11) 98765-4321" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
            </div>
            <div>
              <label htmlFor={`${id}-email`} className="block text-sm font-medium">E-mail <span className="font-normal text-muted-foreground">(opcional)</span></label>
              <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
            </div>
          </div>
          {/* Robôs preenchem tudo; gente não vê este campo. */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label htmlFor={`${id}-site`}>Site</label>
            <input id={`${id}-site`} tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} required className="mt-0.5 h-4 w-4 rounded border-border" />
            <span>
              Concordo que a clínica use estes dados para o meu atendimento e me mande mensagens sobre o agendamento, conforme a{' '}
              <a href="/privacidade" target="_blank" className="font-medium text-primary underline underline-offset-2">
                política de privacidade<span className="sr-only"> (abre em outra aba)</span>
              </a>
              .
            </span>
          </label>
          {erro && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {erro}
            </p>
          )}
          <button type="submit" disabled={enviando} className="btn-primary btn-md mt-4 w-full sm:w-auto">
            {enviando ? 'Agendando…' : 'Confirmar agendamento'}
          </button>
        </form>
      )}
    </div>
  );
}
