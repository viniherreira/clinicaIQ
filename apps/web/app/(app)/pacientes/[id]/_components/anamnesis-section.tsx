'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, CheckCheck, FileHeart, ShieldAlert } from 'lucide-react';
import { saveAnamnesis } from '../actions';
import { ANAMNESIS_GROUPS, ANAMNESIS_QUESTIONS, type AnamnesisAnswer, type AnamnesisAnswers } from './anamnesis-questions';
import { CLINIC_TZ } from '@/lib/tz';

interface Props {
  patientId: string;
  initial: { answers: AnamnesisAnswers; updatedAt: Date | string } | null;
}

/**
 * A ficha de saúde, em blocos (alergias primeiro). O "Sim" fica destacado,
 * em vermelho quando é crítico; a barra de salvar aparece quando há mudança.
 */
export function AnamnesisSection({ patientId, initial }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Record<string, AnamnesisAnswer>>(initial?.answers.items ?? {});
  const [obs, setObs] = useState(initial?.answers.obs ?? '');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState('');
  const [isPending, startTransition] = useTransition();

  const total = ANAMNESIS_QUESTIONS.length;
  const answered = ANAMNESIS_QUESTIONS.filter((q) => items[q.key]).length;
  const sims = ANAMNESIS_QUESTIONS.filter((q) => items[q.key]?.value === 'yes');
  const criticalYes = sims.filter((q) => q.critical);

  function change(fn: (prev: Record<string, AnamnesisAnswer>) => Record<string, AnamnesisAnswer>) {
    setItems(fn);
    setDirty(true);
    setSaved(false);
  }

  function setAnswer(key: string, value: 'yes' | 'no') {
    change((prev) => ({ ...prev, [key]: { ...prev[key], value } }));
  }

  function setDetail(key: string, detail: string) {
    change((prev) => ({ ...prev, [key]: { value: prev[key]?.value ?? 'yes', detail } }));
  }

  function restoNao() {
    change((prev) => {
      const next = { ...prev };
      for (const q of ANAMNESIS_QUESTIONS) if (!next[q.key]) next[q.key] = { value: 'no' };
      return next;
    });
  }

  function save() {
    setErro('');
    startTransition(async () => {
      const res = await saveAnamnesis(patientId, { items, obs });
      if (!res.ok) {
        setErro('Não foi possível salvar. Tente de novo.');
        return;
      }
      setSaved(true);
      setDirty(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-16">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileHeart className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="mr-auto">
              <h2 className="text-sm font-semibold">Ficha de saúde</h2>
              <p className="text-xs text-muted-foreground">
                {initial ? `Atualizada em ${new Date(initial.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: CLINIC_TZ })}` : 'Ainda não preenchida'}
              </p>
            </div>
            {answered < total && (
              <button type="button" onClick={restoNao} className="btn-outline btn-sm">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Marcar o resto como &quot;Não&quot;
              </button>
            )}
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {answered} de {total} respondidas
              </span>
              <span>{Math.round((answered / total) * 100)}%</span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-alt"
              role="progressbar"
              aria-label="Perguntas respondidas"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={answered}
            >
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(answered / total) * 100}%` }} />
            </div>
          </div>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-card ${criticalYes.length ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40' : 'border-border bg-surface'}`}
          role={criticalYes.length ? 'alert' : undefined}
        >
          <p className={`flex items-center gap-2 text-sm font-semibold ${criticalYes.length ? 'text-red-800 dark:text-red-200' : ''}`}>
            {criticalYes.length ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            {criticalYes.length ? 'Atenção antes de atender' : 'Sem alertas críticos'}
          </p>
          {sims.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Nenhuma resposta &quot;Sim&quot; até agora.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {sims.map((q) => (
                <li key={q.key} className={`text-xs ${q.critical ? 'font-medium text-red-700 dark:text-red-300' : 'text-foreground/80'}`}>
                  • {q.label.replace(/\?$/, '').replace(/^(Tem|Está|Faz|Já teve|Já passou por) /, '')}
                  {items[q.key]?.detail && <strong>: {items[q.key].detail}</strong>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {ANAMNESIS_GROUPS.map((g) => {
        const perguntas = ANAMNESIS_QUESTIONS.filter((q) => q.group === g.id);
        return (
          <section key={g.id} aria-labelledby={`anam-${g.id}`} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <h3 id={`anam-${g.id}`} className="text-sm font-semibold">
                {g.label}
              </h3>
              <p className="text-xs text-muted-foreground">{g.hint}</p>
            </div>
            <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-y-0">
              {perguntas.map((q, i) => {
                const ans = items[q.key];
                const isYes = ans?.value === 'yes';
                return (
                  <fieldset
                    key={q.key}
                    className={[
                      'px-4 py-3 sm:px-5 lg:border-b lg:border-border',
                      i % 2 === 1 ? 'lg:border-l' : '',
                      isYes ? (q.critical ? 'bg-red-50/70 dark:bg-red-950/25' : 'bg-amber-50/60 dark:bg-amber-950/20') : '',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <legend className="text-sm">
                        {q.label}
                        {q.critical && <span className="ml-1.5 rounded bg-red-100 px-1 py-px text-[10px] font-semibold uppercase text-red-700 dark:bg-red-950 dark:text-red-300">crítica</span>}
                      </legend>
                      <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={q.label}>
                        {(['yes', 'no'] as const).map((v) => {
                          const on = ans?.value === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => setAnswer(q.key, v)}
                              className={[
                                'h-8 min-w-12 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                on
                                  ? v === 'yes'
                                    ? q.critical
                                      ? 'bg-red-600 text-white'
                                      : 'bg-amber-500 text-white'
                                    : 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                                  : 'bg-surface-alt text-muted-foreground hover:text-foreground',
                              ].join(' ')}
                            >
                              {v === 'yes' ? 'Sim' : 'Não'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {isYes && q.detail && (
                      <input
                        type="text"
                        value={ans?.detail ?? ''}
                        onChange={(e) => setDetail(q.key, e.target.value)}
                        maxLength={300}
                        placeholder={q.detail}
                        aria-label={`${q.label}, detalhe`}
                        className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                    )}
                  </fieldset>
                );
              })}
            </div>
          </section>
        );
      })}

      <section aria-labelledby="anam-obs" className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <label id="anam-obs" htmlFor="anamnesis-obs" className="text-sm font-semibold">
          Observações gerais
        </label>
        <textarea
          id="anamnesis-obs"
          rows={3}
          value={obs}
          onChange={(e) => {
            setObs(e.target.value);
            setDirty(true);
            setSaved(false);
          }}
          maxLength={2000}
          placeholder="Outras informações de saúde que o dentista precisa saber..."
          className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </section>

      {/* Barra de salvar: sempre à mão, mais forte quando há o que salvar. */}
      <div className="sticky bottom-4 z-10 flex justify-end">
        <div
          className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-lg transition-colors ${dirty ? 'border-primary/40 bg-surface' : 'border-border bg-surface/90'}`}
        >
          <span aria-live="polite" className="text-sm">
            {erro ? (
              <span className="text-destructive">{erro}</span>
            ) : saved ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check className="h-4 w-4" aria-hidden="true" /> Anamnese salva
              </span>
            ) : dirty ? (
              <span className="text-muted-foreground">Alterações não salvas</span>
            ) : null}
          </span>
          <button type="button" onClick={save} disabled={isPending || !dirty} className="btn-primary btn-md">
            {isPending ? 'Salvando…' : 'Salvar anamnese'}
          </button>
        </div>
      </div>
    </div>
  );
}
