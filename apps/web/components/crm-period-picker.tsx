'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  addDays,
  clinicDay,
  FIELD_LABEL,
  hasPeriod,
  isDay,
  monthStart,
  NO_PERIOD,
  PERIOD_PRESETS,
  periodText,
  presetRange,
  rangeText,
  resolvePeriod,
  type Period,
  type PeriodField,
  type PeriodPreset,
} from '@/crm/period';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA: [string, string][] = [
  ['Seg', 'segunda-feira'],
  ['Ter', 'terça-feira'],
  ['Qua', 'quarta-feira'],
  ['Qui', 'quinta-feira'],
  ['Sex', 'sexta-feira'],
  ['Sáb', 'sábado'],
  ['Dom', 'domingo'],
];

/** Dia da semana com segunda = 0, como no calendário brasileiro de agenda. */
const weekday = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Seis semanas fixas (a altura não pula ao trocar de mês), começando na segunda. */
function monthGrid(month: string): string[][] {
  const first = addDays(month, -weekday(month));
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
}

function addMonths(month: string, n: number): string {
  const d = new Date(`${month}T12:00:00Z`);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** O mesmo dia em outro mês; 31/03 − 1 mês = 28/02. */
function sameDayIn(day: string, n: number): string {
  const alvo = addMonths(monthStart(day), n);
  const fim = addDays(addMonths(alvo, 1), -1);
  const d = `${alvo.slice(0, 8)}${day.slice(8, 10)}`;
  return isDay(d) && d <= fim ? d : fim;
}

const dayName = (day: string) => `${Number(day.slice(8, 10))} de ${MESES[Number(day.slice(5, 7)) - 1]} de ${day.slice(0, 4)}`;
const monthName = (month: string) => `${MESES[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
/** "Outubro de 2026" (só a primeira letra maiúscula). */
const monthTitle = (month: string) => monthName(month).replace(/^./, (c) => c.toUpperCase());

/** "15102026" ou "15/10/2026" → "2026-10-15". */
function typedDay(text: string): string {
  const d = text.replace(/\D/g, '');
  if (d.length !== 8) return '';
  const iso = `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
  return isDay(iso) ? iso : '';
}
/** Máscara dd/mm/aaaa enquanto digita. */
function maskDay(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
}
const toBR = (day: string) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '');

/**
 * Escolher um período, como o filtro de data do Kommo — e um pouco mais:
 * Criados | Fechados, atalhos com os dias ao lado e um calendário em que se
 * clica no primeiro e no último dia (a faixa aparece enquanto o mouse anda).
 *
 * Atalho aplica na hora. Calendário e dias digitados só no "Aplicar"; Esc e
 * clique fora desistem. Teclado no calendário: setas andam um dia ou uma
 * semana, PageUp/PageDown trocam o mês, Home/End vão ao começo e ao fim da
 * semana, Enter escolhe.
 *
 * O painel abre num portal (em `body`): dentro do painel de filtros, que corta
 * o que passa da borda, ele cabe inteiro. Quem tem um "clique fora" próprio
 * ignora cliques em `[data-crm-popover]`.
 */
export function PeriodPicker({
  value,
  onChange,
  today: todayProp,
  label = 'Período',
  closedHint,
  showDays = false,
  className = '',
}: {
  value: Period;
  onChange: (p: Period) => void;
  /** Dia da clínica, "AAAA-MM-DD". Sem ele, o de agora. */
  today?: string;
  /** O nome do campo (visível acima do botão). */
  label?: string;
  /** Uma nota que aparece com "Fechados" escolhido. */
  closedHint?: string;
  /** Atalho mostra também os dias ("últimos 7 dias · 09/10 – 15/10/2026"). */
  showDays?: boolean;
  className?: string;
}) {
  const id = useId();
  const today = todayProp ?? clinicDay();
  const trigger = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<Period>(value);
  const [mes, setMes] = useState(monthStart(today));
  const [foco, setFoco] = useState(today);
  const [passando, setPassando] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const dias = resolvePeriod(rascunho, today);

  const abrir = () => {
    const r = resolvePeriod(value, today);
    const inicio = r?.from || r?.to || today;
    setRascunho(value);
    setMes(monthStart(inicio));
    setFoco(inicio);
    setPassando('');
    setAberto(true);
  };

  const fechar = useCallback((devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco) trigger.current?.focus();
  }, []);

  const confirmar = (p: Period) => {
    onChange(p);
    fechar();
  };

  // Posição: embaixo do botão; se não couber, em cima; no celular, folha no rodapé.
  const posicionar = useCallback(() => {
    const t = trigger.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(vw - 16, 600);
    if (vw < 640) {
      setPos({ top: -1, left: 8, width: vw - 16, maxHeight: vh - 24 });
      return;
    }
    const altura = painel.current?.offsetHeight ?? 440;
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    const abaixo = vh - r.bottom - 8;
    const top = abaixo >= altura + 6 || abaixo >= r.top ? r.bottom + 6 : Math.max(8, r.top - altura - 6);
    setPos({ top, left, width, maxHeight: Math.max(240, top > r.top ? vh - top - 8 : r.top - 14) });
  }, []);

  useLayoutEffect(() => {
    if (!aberto) return;
    posicionar();
    const raf = requestAnimationFrame(posicionar); // de novo, já sabendo a altura do painel
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [aberto, posicionar]);

  // Clique fora desiste; Esc também. Tab circula dentro do painel. O foco vai
  // para o painel ao abrir.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (painel.current?.contains(alvo) || trigger.current?.contains(alvo)) return;
      fechar(false);
    };
    const tecla = (e: KeyboardEvent) => {
      const p = painel.current;
      if (!p || !p.contains(e.target as Node)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        fechar();
        return;
      }
      if (e.key !== 'Tab') return;
      const focaveis = [...p.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')].filter((x) => x.tabIndex >= 0);
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo?.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro?.focus();
      }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    const t = setTimeout(() => painel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
      clearTimeout(t);
    };
  }, [aberto, fechar]);

  const escolherDia = (day: string) => {
    setPassando('');
    setRascunho((p) => {
      const base = p.preset ? { from: '', to: '' } : { from: p.from, to: p.to };
      // Sem começo, ou período já fechado: este dia começa um novo.
      if (!base.from || base.to) return { ...p, preset: '', from: day, to: '' };
      // Segundo clique fecha a faixa, para qualquer lado.
      return day < base.from ? { ...p, preset: '', from: day, to: base.from } : { ...p, preset: '', from: base.from, to: day };
    });
    setFoco(day);
  };

  const teclaNoDia = (e: React.KeyboardEvent, day: string) => {
    const mapa: Record<string, () => string> = {
      ArrowLeft: () => addDays(day, -1),
      ArrowRight: () => addDays(day, 1),
      ArrowUp: () => addDays(day, -7),
      ArrowDown: () => addDays(day, 7),
      Home: () => addDays(day, -weekday(day)),
      End: () => addDays(day, 6 - weekday(day)),
      PageUp: () => sameDayIn(day, e.shiftKey ? -12 : -1),
      PageDown: () => sameDayIn(day, e.shiftKey ? 12 : 1),
    };
    const ir = mapa[e.key];
    if (!ir) return;
    e.preventDefault();
    const novo = ir();
    // Desenha já (o dia pode ser de outro mês) e leva o foco na mesma hora:
    // a próxima tecla, por mais rápida, já cai no dia novo.
    flushSync(() => {
      setFoco(novo);
      if (monthStart(novo) !== mes) setMes(monthStart(novo));
    });
    painel.current?.querySelector<HTMLElement>(`[data-day="${novo}"]`)?.focus();
  };

  const campo = (f: PeriodField) => setRascunho((p) => ({ ...p, field: f }));

  const diasDoAtalho = value.preset ? presetRange(value.preset, today) : null;
  const textoDoBotao = hasPeriod(value)
    ? `${FIELD_LABEL[value.field]}: ${periodText(value)}${showDays && diasDoAtalho ? ` · ${rangeText(diasDoAtalho.from, diasDoAtalho.to)}` : ''}`
    : '';

  // Faixa em destaque: a escolhida, ou a que se formaria até o dia sob o mouse.
  const ini = dias?.from ?? '';
  const fim = dias?.to || (ini && passando ? passando : '');
  const [a, b] = ini && fim && fim < ini ? [fim, ini] : [ini, fim || ini];

  const ehAtalho = (v: PeriodPreset) => rascunho.preset === v;
  const linhaDeAtalho = (v: PeriodPreset) => {
    const r = presetRange(v, today);
    return rangeText(r.from, r.to);
  };

  const conteudo = aberto && (
    <div
      ref={painel}
      data-crm-popover=""
      role="dialog"
      aria-label={`Escolher ${label.toLowerCase()}`}
      style={
        pos
          ? pos.top < 0
            ? { position: 'fixed', left: pos.left, right: pos.left, bottom: 8, maxHeight: pos.maxHeight }
            : { position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }
          : { position: 'fixed', visibility: 'hidden' }
      }
      className="z-[80] flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div role="group" aria-label="Qual data conta" className="segmented">
          {(['criado', 'fechado'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={rascunho.field === f}
              onClick={() => campo(f)}
              className="segmented-item min-w-[88px]"
              {...(rascunho.field === f ? { 'data-autofocus': '' } : {})}
            >
              {FIELD_LABEL[f]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {rascunho.field === 'criado' ? 'Dia em que o lead entrou' : 'Dia em que foi ganho ou perdido'}
        </p>
        {rascunho.field === 'fechado' && closedHint && <p className="w-full text-xs text-link">{closedHint}</p>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto sm:grid-cols-[minmax(0,190px)_1fr]">
        <ul aria-label="Atalhos" className="grid grid-cols-2 gap-0.5 border-b border-border p-1.5 sm:block sm:border-b-0 sm:border-r">
          {PERIOD_PRESETS.map((x) => (
            <li key={x.v}>
              <button
                type="button"
                aria-pressed={ehAtalho(x.v)}
                onClick={() => confirmar({ field: rascunho.field, preset: x.v, from: '', to: '' })}
                className={`flex w-full flex-col rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
                  ehAtalho(x.v) ? 'bg-primary/15' : ''
                }`}
              >
                <span className={`text-sm ${ehAtalho(x.v) ? 'font-semibold text-link' : 'text-foreground'}`}>{x.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{linhaDeAtalho(x.v)}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="p-3">
          <div className="flex items-end gap-2">
            <DayInput
              id={`${id}-de`}
              label="De"
              day={rascunho.preset ? '' : rascunho.from}
              onDay={(d) => {
                setRascunho((p) => ({ ...p, preset: '', from: d, to: p.preset ? '' : p.to }));
                if (d) {
                  setMes(monthStart(d));
                  setFoco(d);
                }
              }}
            />
            <span aria-hidden="true" className="pb-2 text-muted-foreground">a</span>
            <DayInput
              id={`${id}-ate`}
              label="Até"
              day={rascunho.preset ? '' : rascunho.to}
              onDay={(d) => {
                setRascunho((p) => ({ ...p, preset: '', from: p.preset ? '' : p.from, to: d }));
                if (d) {
                  setMes(monthStart(d));
                  setFoco(d);
                }
              }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMes((m) => addMonths(m, -1))}
              aria-label="Mês anterior"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <p aria-live="polite" className="text-sm font-semibold">{monthTitle(mes)}</p>
            <button
              type="button"
              onClick={() => setMes((m) => addMonths(m, 1))}
              aria-label="Próximo mês"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Ao sair do calendário com o mouse, a prévia da faixa some. */}
          <div onMouseLeave={() => setPassando('')}>
          <table className="mt-1 w-full border-collapse" aria-label={monthTitle(mes)}>
            <thead>
              <tr>
                {SEMANA.map(([curto, longo]) => (
                  <th key={curto} scope="col" abbr={longo} className="pb-1 text-center text-[11px] font-medium text-muted-foreground">
                    {curto}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthGrid(mes).map((semana) => (
                <tr key={semana[0]}>
                  {semana.map((day, col) => {
                    const doMes = day.slice(0, 7) === mes.slice(0, 7);
                    const ponta = Boolean(a) && (day === a || day === b);
                    const dentro = Boolean(a && b) && day > a && day < b;
                    const temFaixa = Boolean(a && b && a !== b);
                    // A faixa contínua: metade direita no começo, metade esquerda no fim.
                    const faixa =
                      dentro
                        ? `inset-x-0 ${col === 0 ? 'rounded-l-full' : ''} ${col === 6 ? 'rounded-r-full' : ''}`
                        : temFaixa && day === a && col !== 6
                          ? 'left-1/2 right-0'
                          : temFaixa && day === b && col !== 0
                            ? 'left-0 right-1/2'
                            : '';
                    const hoje = day === today;
                    const estado = day === a && day === b ? ', dia escolhido' : day === a ? ', começo do período' : day === b ? ', fim do período' : dentro ? ', dentro do período' : '';
                    return (
                      <td key={day} className="relative p-0 py-0.5 text-center">
                        {faixa && <span aria-hidden="true" className={`absolute inset-y-0.5 bg-primary/20 ${faixa}`} />}
                        <button
                          type="button"
                          data-day={day}
                          tabIndex={day === foco ? 0 : -1}
                          onClick={() => escolherDia(day)}
                          onMouseEnter={() => setPassando(day)}
                          onFocus={() => setFoco(day)}
                          onKeyDown={(e) => teclaNoDia(e, day)}
                          aria-label={`${dayName(day)}${hoje ? ', hoje' : ''}${estado}`}
                          aria-pressed={ponta}
                          className={[
                            'relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors',
                            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                            ponta
                              ? 'bg-primary font-semibold text-primary-foreground'
                              : dentro
                                ? 'text-foreground hover:bg-primary/25'
                                : doMes
                                  ? 'text-foreground hover:bg-surface-alt'
                                  : 'text-muted-foreground hover:bg-surface-alt',
                            hoje && !ponta ? 'font-semibold text-link ring-1 ring-inset ring-link/60' : '',
                          ].join(' ')}
                        >
                          {Number(day.slice(8, 10))}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <p className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
          {dias ? (
            <>
              {FIELD_LABEL[rascunho.field]}: <span className="font-medium text-foreground">{rangeText(dias.from, dias.to)}</span>
            </>
          ) : (
            'Clique no primeiro e no último dia'
          )}
        </p>
        <div className="flex items-center gap-2">
          {hasPeriod(value) && (
            <button type="button" onClick={() => confirmar({ ...NO_PERIOD })} className="btn-ghost btn-sm">
              Sem período
            </button>
          )}
          <button type="button" onClick={() => fechar()} className="btn-ghost btn-sm">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!dias}
            onClick={() => dias && confirmar({ field: rascunho.field, preset: rascunho.preset, from: rascunho.preset ? '' : dias.from, to: rascunho.preset ? '' : dias.to })}
            className="btn-primary btn-sm"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={className}>
      <span id={`${id}-rotulo`} className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative mt-1">
        <button
          ref={trigger}
          type="button"
          onClick={() => (aberto ? fechar(false) : abrir())}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-labelledby={`${id}-rotulo ${id}-valor`}
          className={`flex h-9 w-full items-center gap-2 rounded-md border bg-background pl-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
            hasPeriod(value) ? 'border-link/60 pr-8' : 'border-border pr-2.5'
          } ${aberto ? 'outline outline-2 outline-ring' : ''}`}
        >
          <CalendarDays className={`h-4 w-4 shrink-0 ${hasPeriod(value) ? 'text-link' : 'text-muted-foreground'}`} aria-hidden="true" />
          <span id={`${id}-valor`} className={`min-w-0 flex-1 truncate ${hasPeriod(value) ? 'text-foreground' : 'text-muted-foreground'}`}>
            {textoDoBotao || 'Qualquer data'}
          </span>
          {!hasPeriod(value) && <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </button>
        {hasPeriod(value) && (
          <button
            type="button"
            onClick={() => onChange({ ...NO_PERIOD })}
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Tirar o período</span>
          </button>
        )}
      </div>
      {typeof document !== 'undefined' && conteudo ? createPortal(conteudo, document.body) : null}
    </div>
  );
}

/**
 * Um dia digitado (dd/mm/aaaa). Mostra o dia escolhido; enquanto a pessoa
 * digita, o texto dela — o dia só muda quando a data fica completa e válida.
 */
function DayInput({ id, label, day, onDay }: { id: string; label: string; day: string; onDay: (d: string) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? toBR(day);
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        value={mostrado}
        onChange={(e) => {
          const t = maskDay(e.target.value);
          const d = typedDay(t);
          if (d || !t) {
            setTexto(null);
            onDay(d);
          } else setTexto(t);
        }}
        onBlur={() => setTexto(null)}
        aria-invalid={mostrado.length === 10 && !typedDay(mostrado)}
        className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-[invalid=true]:border-destructive"
      />
    </div>
  );
}
