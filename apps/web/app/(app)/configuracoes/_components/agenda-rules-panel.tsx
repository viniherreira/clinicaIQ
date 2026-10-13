'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SLOT_OPTIONS, type AgendaRules } from '@/lib/agenda-rules';
import { updateAgendaRules } from '../rules-actions';

const selectCls =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const hora = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Como a agenda se comporta: o que a grade mostra, a duração padrão e o encaixe. */
export function AgendaRulesPanel({ rules }: { rules: AgendaRules }) {
  const id = useId();
  const router = useRouter();
  const [r, setR] = useState(rules);
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const muda = (patch: Partial<AgendaRules>) => {
    setR({ ...r, ...patch });
    setAviso(null);
  };

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 id={`${id}-t`} className="text-base font-semibold">Regras da agenda</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">O que a agenda mostra e como ela marca os horários. Vale para todas as unidades.</p>
      </div>
      <form
        className="space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await updateAgendaRules(r);
            setAviso(res.ok ? { ok: true, texto: 'Regras salvas.' } : { ok: false, texto: res.message });
            if (res.ok) router.refresh();
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-ini`} className="text-sm font-medium">A agenda começa às</label>
            <select id={`${id}-ini`} value={r.startHour} onChange={(e) => muda({ startHour: Number(e.target.value) })} className={selectCls}>
              {Array.from({ length: 13 }, (_, h) => (
                <option key={h} value={h}>{hora(h)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-fim`} className="text-sm font-medium">E termina às</label>
            <select id={`${id}-fim`} value={r.endHour} onChange={(e) => muda({ endHour: Number(e.target.value) })} className={selectCls}>
              {Array.from({ length: 12 }, (_, i) => i + 13).map((h) => (
                <option key={h} value={h}>{hora(h % 24)}{h === 24 ? ' (meia-noite)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-int`} className="text-sm font-medium">Intervalo da grade</label>
            <select id={`${id}-int`} value={r.slotMinutes} onChange={(e) => muda({ slotMinutes: Number(e.target.value) })} className={selectCls}>
              {SLOT_OPTIONS.map((m) => (
                <option key={m} value={m}>De {m} em {m} minutos</option>
              ))}
            </select>
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Clicar na agenda escolhe o horário no intervalo da grade. O horário de cada profissional continua valendo.</p>

        <div className="space-y-1.5 sm:max-w-xs">
          <label htmlFor={`${id}-dur`} className="text-sm font-medium">Duração padrão do agendamento</label>
          <div className="flex items-center gap-2">
            <input
              id={`${id}-dur`}
              type="number"
              min={5}
              max={240}
              step={5}
              value={r.defaultDurationMinutes}
              onChange={(e) => muda({ defaultDurationMinutes: Number(e.target.value) })}
              aria-describedby={`${id}-dur-d`}
              className={selectCls}
            />
            <span className="text-sm text-muted-foreground">minutos</span>
          </div>
          <p id={`${id}-dur-d`} className="text-xs text-muted-foreground">Quando o agendamento não tem procedimento (com procedimento, vale a duração dele).</p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input
            id={`${id}-encaixe`}
            type="checkbox"
            checked={r.allowOverlap}
            onChange={(e) => muda({ allowOverlap: e.target.checked })}
            aria-describedby={`${id}-encaixe-d`}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <div>
            <label htmlFor={`${id}-encaixe`} className="block text-sm font-medium">Permitir encaixe</label>
            <p id={`${id}-encaixe-d`} className="text-xs text-muted-foreground">
              Aceita marcar dois pacientes no mesmo horário do mesmo profissional. Desligado, a agenda avisa o conflito. Horário bloqueado
              continua bloqueado.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary btn-md">
            {pending ? 'Salvando…' : 'Salvar regras'}
          </button>
          <span role="status" aria-live="polite" className={`text-sm ${aviso?.ok === false ? 'text-destructive' : 'text-success'}`}>
            {aviso?.texto}
          </span>
        </div>
      </form>
    </section>
  );
}
