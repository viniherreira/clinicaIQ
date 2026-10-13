'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { Check, Copy, ExternalLink, Globe } from 'lucide-react';
import type { OnlineBookingSettings } from '@/lib/availability';
import { getOnlineBookingSettings, saveOnlineBookingSettings } from '../actions';

type Loaded = Awaited<ReturnType<typeof getOnlineBookingSettings>>;

/**
 * Agendamento online, como a "agenda externa" do Clínica nas Nuvens: um link
 * público onde o paciente marca sozinho, só nos horários livres de quem a
 * clínica liberar.
 */
export function OnlineBookingPanel() {
  const id = useId();
  const [dados, setDados] = useState<Loaded | null>(null);
  const [form, setForm] = useState<OnlineBookingSettings | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    void getOnlineBookingSettings().then((d) => {
      setDados(d);
      setForm(d.settings);
    });
  }, []);

  if (!dados || !form) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <p className="text-sm text-muted-foreground">Carregando agendamento online…</p>
      </section>
    );
  }

  const link = typeof window === 'undefined' ? `/agendar/${dados.slug}` : `${window.location.origin}/agendar/${dados.slug}`;
  const set = <K extends keyof OnlineBookingSettings>(k: K, v: OnlineBookingSettings[K]) => setForm({ ...form, [k]: v });
  const alternar = (k: 'professionalIds' | 'procedureIds', v: string) =>
    set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v]);

  function salvar() {
    if (!form) return;
    start(async () => {
      setErro('');
      const r = await saveOnlineBookingSettings(form);
      if (!r.ok) return setErro(r.message);
      setAviso('Agendamento online salvo.');
    });
  }

  const campo = 'mt-1 h-9 rounded-lg border border-border bg-surface px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring';

  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-titulo`} className="flex items-center gap-2 text-base font-semibold">
            <Globe className="h-4 w-4 text-primary" aria-hidden="true" /> Agendamento online
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Um link para o paciente marcar sozinho, só nos horários livres. Coloque no Instagram, no Google e no WhatsApp.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} className="h-4 w-4 rounded border-border" />
          Ligado
        </label>
      </div>

      {form.enabled && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-alt/70 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{link}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
            className="btn-outline btn-sm inline-flex items-center gap-1.5"
          >
            {copiado ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copiado ? 'Copiado' : 'Copiar link'}
          </button>
          <a href={`/agendar/${dados.slug}`} target="_blank" rel="noopener" className="btn-ghost btn-sm inline-flex items-center gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Abrir<span className="sr-only"> em outra aba</span>
          </a>
        </div>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-medium">Quem aparece</legend>
          <p className="text-xs text-muted-foreground">Nenhum marcado = todos os profissionais ativos.</p>
          <div className="mt-2 space-y-1.5">
            {dados.professionals.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.professionalIds.includes(p.id)} onChange={() => alternar('professionalIds', p.id)} className="h-4 w-4 rounded border-border" />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">O que dá para marcar</legend>
          <p className="text-xs text-muted-foreground">Nenhum marcado = só “Consulta / avaliação”.</p>
          <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {dados.procedures.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.procedureIds.includes(p.id)} onChange={() => alternar('procedureIds', p.id)} className="h-4 w-4 rounded border-border" />
                {p.name} <span className="text-xs text-muted-foreground">({p.durationMinutes} min)</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor={`${id}-ant`} className="block text-sm font-medium">Antecedência mínima</label>
          <select id={`${id}-ant`} value={form.minAdvanceHours} onChange={(e) => set('minAdvanceHours', Number(e.target.value))} className={`${campo} w-full`}>
            {[0, 1, 2, 4, 12, 24, 48].map((h) => (
              <option key={h} value={h}>{h === 0 ? 'Nenhuma' : `${h} h`}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-max`} className="block text-sm font-medium">Até quantos dias à frente</label>
          <select id={`${id}-max`} value={form.maxDaysAhead} onChange={(e) => set('maxDaysAhead', Number(e.target.value))} className={`${campo} w-full`}>
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>{d} dias</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-step`} className="block text-sm font-medium">Horários a cada</label>
          <select id={`${id}-step`} value={form.stepMinutes} onChange={(e) => set('stepMinutes', Number(e.target.value))} className={`${campo} w-full`}>
            {[15, 20, 30, 60].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-dur`} className="block text-sm font-medium">Duração da consulta</label>
          <select id={`${id}-dur`} value={form.defaultDurationMinutes} onChange={(e) => set('defaultDurationMinutes', Number(e.target.value))} className={`${campo} w-full`}>
            {[15, 20, 30, 40, 45, 60, 90].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
      </div>

      {erro && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {erro}
        </p>
      )}
      <button type="button" onClick={salvar} disabled={pending} className="btn-primary btn-sm mt-4">
        {pending ? 'Salvando…' : 'Salvar agendamento online'}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </section>
  );
}
