'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { saveWhatsAppSettings, type WhatsAppPanelData } from '../actions';
import { OfficialCard } from './official-card';

interface Props {
  data: WhatsAppPanelData;
}

/**
 * Only DELIVERED/READ prove the patient's phone got it. "Saindo" and "No
 * servidor" are honest intermediate states — a message stuck there did not
 * reach anyone, which is exactly what a plain "Enviada" used to hide.
 */
const MSG_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Saindo…', cls: 'bg-surface-alt text-muted-foreground' },
  SENT: { label: 'No servidor', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  DELIVERED: { label: 'Entregue ✓✓', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  READ: { label: 'Lida ✓✓', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  FAILED: { label: 'Falhou', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
};

/** A message that never left "saindo/no servidor" after this long didn't land. */
const STUCK_AFTER_MS = 5 * 60 * 1000;

const TEMPLATE_PT: Record<string, string> = {
  appointment_created: 'Agendamento criado',
  appointment_confirmation: 'Lembrete / confirmação',
  quote_sent: 'Orçamento',
  birthday_greeting: 'Aniversário',
};

export function WhatsAppView({ data }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte o número da clínica para que as confirmações saiam do WhatsApp que os pacientes já
          conhecem.
        </p>
      </header>

      <OfficialCard official={data.official} />

      {/* Automations */}
      <AutomationSettings initial={data.settings} />

      {/* Stats */}
      <section aria-label="Envios" className="grid grid-cols-3 gap-4">
        <Stat label="Enviadas" value={data.stats.sent} tone="success" />
        <Stat label="Últimos 7 dias" value={data.stats.last7d} />
        <Stat label="Falharam" value={data.stats.failed} tone={data.stats.failed > 0 ? 'danger' : 'muted'} />
      </section>

      {/* Recent messages */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Mensagens recentes</h2>
          <span className="text-xs text-muted-foreground">últimas 20</span>
        </div>
        {data.recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquare className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium">Nenhuma mensagem enviada ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ao criar um agendamento, a confirmação aparece aqui.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.recent.map((m) => {
              const meta = MSG_STATUS[m.status] ?? MSG_STATUS.PENDING;
              const stuck =
                (m.status === 'PENDING' || m.status === 'SENT') &&
                Date.now() - new Date(m.createdAt).getTime() > STUCK_AFTER_MS;
              return (
                <li key={m.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/pacientes/${m.patientId}`}
                        className="text-sm font-medium hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {m.patient}
                      </Link>
                      {m.templateName && (
                        <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] text-muted-foreground">
                          {TEMPLATE_PT[m.templateName] ?? m.templateName}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {m.content.replace(/\*/g, '')}
                    </p>
                    {m.errorMessage && (
                      <p className="mt-1 text-xs text-destructive">{m.errorMessage}</p>
                    )}
                    {stuck && !m.errorMessage && (
                      <p className="mt-1 text-xs text-warning">
                        Sem confirmação de entrega: o WhatsApp não confirmou que chegou.
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {new Date(m.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}

// ─── Automations ─────────────────────────────────────────────────────────────

function AutomationSettings({ initial }: { initial: WhatsAppPanelData['settings'] }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save(next: WhatsAppPanelData['settings']) {
    setSettings(next);
    setSaved(false);
    startTransition(async () => {
      const res = await saveWhatsAppSettings(next);
      if (res.success) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">O que enviar automaticamente</h2>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {isPending ? 'Salvando…' : saved ? 'Salvo' : ''}
        </span>
      </div>

      <div className="divide-y divide-border">
        <Toggle
          label="Confirmação ao agendar"
          hint="Assim que o horário é marcado, o paciente recebe os detalhes."
          checked={settings.notifyOnCreate}
          onChange={(v) => save({ ...settings, notifyOnCreate: v })}
        />
        <Toggle
          label="Lembrete na véspera"
          hint="Enviado todo dia pela rotina automática, pedindo a confirmação."
          checked={settings.notifyReminder}
          onChange={(v) => save({ ...settings, notifyReminder: v })}
        />
        {/* Pela API oficial, aniversário é marketing e precisa de modelo aprovado: ainda não sai. */}
        <Toggle
          label="Mensagem de aniversário"
          hint="Em breve pelo WhatsApp oficial."
          checked={false}
          disabled
          onChange={() => undefined}
        />
      </div>

    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className={`text-sm font-medium ${disabled ? 'text-muted-foreground' : ''}`}>{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'danger' | 'muted';
}) {
  const cls = {
    default: 'text-foreground',
    success: 'text-success',
    danger: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tracking-tight tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
