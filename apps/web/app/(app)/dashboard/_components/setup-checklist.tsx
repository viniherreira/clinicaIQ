'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, X, Rocket } from 'lucide-react';

export interface SetupStep {
  key: string;
  label: string;
  desc: string;
  href: string;
  cta: string;
  done: boolean;
}

const DISMISS_KEY = 'clinicaiq:setup-dismissed';

/**
 * Getting-started checklist shown to new clinics on the dashboard. Auto-hides
 * once every step is done; can be dismissed early (remembered per browser).
 */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash
  const done = steps.filter((s) => s.done).length;
  const complete = done === steps.length;

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (complete || dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  const next = steps.find((s) => !s.done);

  return (
    <section aria-labelledby="setup-title" className="relative overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.04] p-5 shadow-card">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar guia de primeiros passos"
        className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Rocket className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="setup-title" className="text-sm font-semibold">Primeiros passos</h2>
          <p className="text-xs text-muted-foreground">{done} de {steps.length} concluídos · deixe a clínica pronta para usar</p>
        </div>
      </div>

      {/* progress */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/15" role="presentation">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>

      <ul className="mt-4 space-y-2">
        {steps.map((s) => {
          const isNext = s.key === next?.key;
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  s.done
                    ? 'border-transparent'
                    : isNext
                      ? 'border-primary/30 bg-surface hover:bg-surface-alt'
                      : 'border-border bg-surface hover:bg-surface-alt'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    s.done ? 'bg-primary text-white' : 'border border-border bg-background text-muted-foreground'
                  }`}
                  aria-hidden="true"
                >
                  {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${s.done ? 'text-muted-foreground line-through' : ''}`}>{s.label}</span>
                  {!s.done && <span className="block text-xs text-muted-foreground">{s.desc}</span>}
                </span>
                {!s.done && (
                  <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${isNext ? 'text-primary' : 'text-muted-foreground'}`}>
                    {s.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
