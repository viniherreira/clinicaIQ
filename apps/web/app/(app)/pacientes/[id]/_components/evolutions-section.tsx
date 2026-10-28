'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, Search, Trash2, X } from 'lucide-react';
import { addEvolution, deleteEvolution } from '../actions';
import { VALID_TEETH } from '@/lib/odontogram';
import { CLINIC_TZ } from '@/lib/tz';

interface EvolutionItem {
  id: string;
  description: string;
  teeth: number[];
  createdAt: Date | string;
  professional: { name: string; color: string | null } | null;
}

interface Props {
  patientId: string;
  evolutions: EvolutionItem[];
  professionals: { id: string; name: string }[];
}

/** Começos de texto comuns: um clique e é só completar. */
const MODELOS = [
  { label: 'Avaliação', texto: 'Consulta de avaliação. Queixa principal: \nExame clínico: \nConduta: ' },
  { label: 'Profilaxia', texto: 'Profilaxia e raspagem supragengival. Orientação de higiene oral. Paciente sem intercorrências.' },
  { label: 'Restauração', texto: 'Restauração em resina composta, cor , faces . Anestesia infiltrativa, isolamento relativo. Sem intercorrências.' },
  { label: 'Retorno', texto: 'Retorno para controle. ' },
  { label: 'Orientações', texto: 'Paciente orientado(a) sobre ' },
];

const fieldCls =
  'w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function monthLabel(d: Date | string) {
  const s = new Date(d).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: CLINIC_TZ });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A história clínica: o que foi feito em cada sessão, na linha do tempo, com
 * busca e filtro por profissional. Marcar algo como realizado no odontograma
 * também escreve aqui.
 */
export function EvolutionsSection({ patientId, evolutions, professionals }: Props) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [professionalId, setProfessionalId] = useState(professionals.length === 1 ? professionals[0].id : '');
  const [teeth, setTeeth] = useState<number[]>([]);
  const [toothInput, setToothInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [quem, setQuem] = useState('');
  const [isPending, startTransition] = useTransition();

  function addTeeth(text: string) {
    const novos = text
      .split(/[\s,;]+/)
      .map((t) => parseInt(t, 10))
      .filter((n) => VALID_TEETH.has(n));
    if (novos.length) setTeeth((cur) => [...new Set([...cur, ...novos])].sort((a, b) => a - b));
    setToothInput('');
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addEvolution(patientId, {
        description,
        professionalId: professionalId || undefined,
        teeth: [...teeth, ...toothInput.split(/[\s,;]+/).map((t) => parseInt(t, 10)).filter((n) => VALID_TEETH.has(n))],
      });
      if (!res.ok) {
        setError(res.message ?? 'Não foi possível salvar.');
        return;
      }
      setDescription('');
      setTeeth([]);
      setToothInput('');
      router.refresh();
    });
  }

  function remove(id: string) {
    setConfirmDelete(null);
    startTransition(async () => {
      await deleteEvolution(id, patientId);
      router.refresh();
    });
  }

  const nomes = [...new Set(evolutions.map((e) => e.professional?.name).filter(Boolean))] as string[];
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return evolutions.filter(
      (e) =>
        (!quem || e.professional?.name === quem) &&
        (!q || e.description.toLowerCase().includes(q) || e.teeth.some((t) => String(t) === q)),
    );
  }, [evolutions, busca, quem]);
  const meses = useMemo(() => {
    const m: { label: string; items: EvolutionItem[] }[] = [];
    for (const e of filtradas) {
      const label = monthLabel(e.createdAt);
      if (m.at(-1)?.label === label) m.at(-1)!.items.push(e);
      else m.push({ label, items: [e] });
    }
    return m;
  }, [filtradas]);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* Nova evolução */}
      <form onSubmit={submit} className="space-y-3 self-start rounded-2xl border border-border bg-surface p-4 shadow-card lg:sticky lg:top-16">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-sm font-semibold">Nova evolução</h2>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5" aria-label="Modelos de texto">
          {MODELOS.map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => setDescription((d) => (d.trim() ? `${d.trimEnd()}\n${m.texto}` : m.texto))}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
            >
              + {m.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="evo-desc" className="sr-only">
            O que foi feito nesta sessão
          </label>
          <textarea
            id="evo-desc"
            rows={6}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && description.trim().length >= 3) submit();
            }}
            maxLength={4000}
            placeholder="O que foi feito nesta sessão? Ex: Restauração em resina no 36, anestesia infiltrativa, sem intercorrências..."
            className={`${fieldCls} resize-y py-2`}
          />
        </div>
        <div>
          <label htmlFor="evo-prof" className="text-xs font-medium text-muted-foreground">
            Profissional
          </label>
          <select id="evo-prof" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className={`${fieldCls} mt-1 h-9`}>
            <option value="">Não informar</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="evo-teeth" className="text-xs font-medium text-muted-foreground">
            Dentes (opcional)
          </label>
          <div className="mt-1 flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
            {teeth.map((t) => (
              <span key={t} className="inline-flex items-center gap-0.5 rounded-md bg-primary/10 py-0.5 pl-1.5 pr-0.5 font-mono text-xs font-semibold text-primary">
                {t}
                <button type="button" onClick={() => setTeeth((cur) => cur.filter((x) => x !== t))} aria-label={`Tirar o dente ${t}`} className="rounded p-0.5 hover:bg-primary/20">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              id="evo-teeth"
              value={toothInput}
              onChange={(e) => {
                const v = e.target.value;
                if (/[\s,;]$/.test(v)) addTeeth(v);
                else setToothInput(v);
              }}
              onBlur={() => toothInput && addTeeth(toothInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTeeth(toothInput);
                } else if (e.key === 'Backspace' && !toothInput && teeth.length) setTeeth((cur) => cur.slice(0, -1));
              }}
              inputMode="numeric"
              placeholder={teeth.length ? '' : 'Ex: 36 37'}
              className="h-7 min-w-16 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <button type="submit" disabled={isPending || description.trim().length < 3} className="btn-primary btn-md w-full justify-center">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {isPending ? 'Salvando…' : 'Registrar evolução'}
        </button>
        <p className="text-center text-[11px] text-muted-foreground">Ctrl + Enter também registra.</p>
      </form>

      {/* Linha do tempo */}
      <section aria-label="Histórico de evoluções" className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar no texto ou pelo número do dente"
              aria-label="Buscar nas evoluções"
              className={`${fieldCls} h-9 pl-9`}
            />
          </div>
          {nomes.length > 1 && (
            <select value={quem} onChange={(e) => setQuem(e.target.value)} aria-label="Filtrar por profissional" className={`${fieldCls} h-9 w-auto`}>
              <option value="">Todos os profissionais</option>
              {nomes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </div>

        {evolutions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma evolução ainda. Elas contam a história clínica do paciente.</p>
          </div>
        ) : filtradas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nada encontrado com esse filtro.</p>
        ) : (
          meses.map((m) => (
            <div key={m.label}>
              <h3 className="sticky top-12 z-10 mb-2 inline-block rounded-full bg-surface-alt px-3 py-1 text-xs font-semibold text-muted-foreground">{m.label}</h3>
              <ol className="relative space-y-3 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-0.5 before:rounded-full before:bg-border">
                {m.items.map((e) => (
                  <li key={e.id} className="relative">
                    <span
                      className="absolute -left-6 top-4 h-3.5 w-3.5 rounded-full border-2 border-surface ring-1 ring-border"
                      style={{ backgroundColor: e.professional?.color ?? '#94a3b8' }}
                      aria-hidden="true"
                    />
                    <article className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <time dateTime={new Date(e.createdAt).toISOString()} className="font-medium text-foreground">
                          {new Date(e.createdAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: CLINIC_TZ })}
                          {' · '}
                          {new Date(e.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: CLINIC_TZ })}
                        </time>
                        {e.professional && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{e.professional.name}</span>
                          </>
                        )}
                        {e.teeth.length > 0 && (
                          <span className="flex flex-wrap gap-1">
                            <span className="sr-only">Dentes:</span>
                            {e.teeth.map((t) => (
                              <span key={t} className="rounded-md bg-surface-alt px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                                {t}
                              </span>
                            ))}
                          </span>
                        )}
                        <span className="ml-auto">
                          {confirmDelete === e.id ? (
                            <span className="flex items-center gap-2 text-xs">
                              Excluir?
                              <button type="button" onClick={() => setConfirmDelete(null)} className="rounded border border-border px-2 py-0.5 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring">
                                Não
                              </button>
                              <button type="button" onClick={() => remove(e.id)} className="rounded bg-destructive px-2 py-0.5 font-medium text-white hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-ring">
                                Sim
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(e.id)}
                              aria-label="Excluir evolução"
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{e.description}</p>
                    </article>
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
