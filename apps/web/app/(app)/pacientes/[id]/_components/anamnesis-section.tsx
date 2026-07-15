'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check } from 'lucide-react';
import { saveAnamnesis } from '../actions';
import {
  ANAMNESIS_QUESTIONS,
  type AnamnesisAnswers,
  type AnamnesisAnswer,
} from './anamnesis-questions';

interface Props {
  patientId: string;
  initial: { answers: AnamnesisAnswers; updatedAt: Date | string } | null;
}

export function AnamnesisSection({ patientId, initial }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Record<string, AnamnesisAnswer>>(initial?.answers.items ?? {});
  const [obs, setObs] = useState(initial?.answers.obs ?? '');
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const answered = Object.keys(items).length;
  const criticalYes = ANAMNESIS_QUESTIONS.filter(
    (q) => q.critical && items[q.key]?.value === 'yes',
  );

  function setAnswer(key: string, value: 'yes' | 'no') {
    setItems((prev) => ({ ...prev, [key]: { ...prev[key], value } }));
    setSaved(false);
  }

  function setDetail(key: string, detail: string) {
    setItems((prev) => ({ ...prev, [key]: { value: prev[key]?.value ?? 'yes', detail } }));
    setSaved(false);
  }

  function save() {
    startTransition(async () => {
      const res = await saveAnamnesis(patientId, { items, obs });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Critical alerts */}
      {criticalYes.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Atenção antes de atender
          </p>
          <ul className="mt-2 space-y-1">
            {criticalYes.map((q) => (
              <li key={q.key} className="text-sm text-red-700 dark:text-red-300">
                • {q.label.replace(/\?$/, '')}
                {items[q.key]?.detail && <strong> — {items[q.key].detail}</strong>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold">Ficha de saúde</h2>
            <p className="text-xs text-muted-foreground">
              {initial
                ? `Última atualização: ${new Date(initial.updatedAt).toLocaleString('pt-BR')}`
                : 'Ainda não preenchida'}
              {' · '}
              {answered}/{ANAMNESIS_QUESTIONS.length} respondidas
            </p>
          </div>
        </div>

        <div className="divide-y divide-border">
          {ANAMNESIS_QUESTIONS.map((q) => {
            const ans = items[q.key];
            const isYes = ans?.value === 'yes';
            return (
              <fieldset key={q.key} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <legend className="text-sm">
                    {q.label}
                    {q.critical && (
                      <span className="ml-1.5 text-xs font-medium text-red-500" title="Resposta crítica">•</span>
                    )}
                  </legend>
                  <div className="segmented shrink-0" role="radiogroup" aria-label={q.label}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isYes}
                      onClick={() => setAnswer(q.key, 'yes')}
                      className={`segmented-item ${isYes ? '!bg-red-100 !text-red-800 dark:!bg-red-950/60 dark:!text-red-200' : ''}`}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={ans?.value === 'no'}
                      onClick={() => setAnswer(q.key, 'no')}
                      className={`segmented-item ${ans?.value === 'no' ? '!bg-surface !text-foreground !shadow-sm' : ''}`}
                    >
                      Não
                    </button>
                  </div>
                </div>
                {isYes && q.detail && (
                  <input
                    type="text"
                    value={ans?.detail ?? ''}
                    onChange={(e) => setDetail(q.key, e.target.value)}
                    maxLength={300}
                    placeholder={q.detail}
                    aria-label={`${q.label} — detalhe`}
                    className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                )}
              </fieldset>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-border px-4 py-4 sm:px-5">
          <div>
            <label htmlFor="anamnesis-obs" className="text-sm font-medium">
              Observações gerais
            </label>
            <textarea
              id="anamnesis-obs"
              rows={3}
              value={obs}
              onChange={(e) => { setObs(e.target.value); setSaved(false); }}
              maxLength={2000}
              placeholder="Outras informações relevantes de saúde..."
              className="mt-1.5 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={isPending} className="btn-primary btn-md">
              {isPending ? 'Salvando…' : 'Salvar anamnese'}
            </button>
            <span aria-live="polite" className="inline-flex items-center gap-1 text-sm text-success">
              {saved && (<><Check className="h-4 w-4" aria-hidden="true" /> Salvo</>)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
