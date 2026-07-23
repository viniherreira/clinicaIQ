'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  MessageSquare,
  Power,
  Send,
  Smartphone,
} from 'lucide-react';
import {
  disconnectWhatsApp,
  saveWhatsAppSettings,
  sendTestMessage,
  type WhatsAppPanelData,
} from '../actions';
import { PairingModal } from './pairing-modal';

interface Props {
  data: WhatsAppPanelData;
}

const MSG_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Na fila', cls: 'bg-surface-alt text-muted-foreground' },
  SENT: { label: 'Enviada', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  DELIVERED: { label: 'Entregue', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  READ: { label: 'Lida', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  FAILED: { label: 'Falhou', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
};

const TEMPLATE_PT: Record<string, string> = {
  appointment_created: 'Agendamento criado',
  appointment_confirmation: 'Lembrete / confirmação',
  quote_sent: 'Orçamento',
  birthday_greeting: 'Aniversário',
};

function formatPhone(digits: string | null): string {
  if (!digits) return '';
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${digits}`;
}

export function WhatsAppView({ data }: Props) {
  const router = useRouter();
  const [pairing, setPairing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const connected = data.status === 'CONNECTED';

  function onDisconnect() {
    if (!confirm('Desconectar o WhatsApp da clínica? As confirmações deixam de ser enviadas.')) return;
    startTransition(async () => {
      await disconnectWhatsApp();
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte o número da clínica para que as confirmações saiam do WhatsApp que os pacientes já
          conhecem.
        </p>
      </header>

      {!data.gatewayReady && (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Serviço de WhatsApp ainda não configurado
            </p>
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              Falta apontar as variáveis <code className="font-mono text-xs">WHATSAPP_GATEWAY_URL</code> e{' '}
              <code className="font-mono text-xs">WHATSAPP_GATEWAY_TOKEN</code> para o serviço de conexão.
              Enquanto isso, o botão de conectar fica indisponível.
            </p>
          </div>
        </div>
      )}

      {/* Connection card */}
      <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                connected ? 'bg-success/10 text-success' : 'bg-surface-alt text-muted-foreground'
              }`}
            >
              {connected ? (
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Smartphone className="h-6 w-6" aria-hidden="true" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {connected ? 'WhatsApp conectado' : 'WhatsApp não conectado'}
              </p>
              {connected ? (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {data.displayName ? `${data.displayName} · ` : ''}
                  <span className="tabular-nums">{formatPhone(data.phoneNumber)}</span>
                  {data.connectedAt && (
                    <> · desde {new Date(data.connectedAt).toLocaleDateString('pt-BR')}</>
                  )}
                </p>
              ) : (
                <p className="mt-0.5 max-w-md text-sm text-muted-foreground">
                  Leia um QR code com o celular da clínica, do mesmo jeito que você faz no WhatsApp Web.
                </p>
              )}
              {data.lastError && !connected && (
                <p className="mt-1.5 text-sm text-destructive">{data.lastError}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {connected ? (
              <button type="button" onClick={onDisconnect} disabled={isPending} className="btn-outline btn-md">
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Power className="h-4 w-4" aria-hidden="true" />
                )}
                Desconectar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPairing(true)}
                disabled={!data.gatewayReady}
                className="btn-primary btn-md"
              >
                <Link2 className="h-4 w-4" aria-hidden="true" /> Conectar WhatsApp
              </button>
            )}
          </div>
        </div>

        {connected && <TestMessage />}
      </section>

      {/* Automations */}
      <AutomationSettings initial={data.settings} connected={connected} />

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

      <p className="text-xs leading-relaxed text-muted-foreground">
        A conexão usa o WhatsApp Web do próprio celular da clínica. Mantenha o aparelho ligado e com
        internet; se ele ficar muito tempo offline, o WhatsApp encerra a sessão e será preciso ler o
        QR code de novo.
      </p>

      <PairingModal open={pairing} onClose={() => setPairing(false)} />
    </div>
  );
}

// ─── Test message ────────────────────────────────────────────────────────────

function TestMessage() {
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSend() {
    setResult(null);
    startTransition(async () => setResult(await sendTestMessage(phone)));
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <label htmlFor="wa-test" className="text-xs font-medium">
        Enviar mensagem de teste
      </label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <input
          id="wa-test"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="(11) 99999-9999"
          className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm tabular-nums placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <button type="button" onClick={onSend} disabled={isPending || !phone.trim()} className="btn-outline btn-md">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          Enviar teste
        </button>
      </div>
      {result && (
        <p
          aria-live="polite"
          className={`mt-2 text-xs ${result.success ? 'text-success' : 'text-destructive'}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}

// ─── Automations ─────────────────────────────────────────────────────────────

function AutomationSettings({
  initial,
  connected,
}: {
  initial: WhatsAppPanelData['settings'];
  connected: boolean;
}) {
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
        <Toggle
          label="Mensagem de aniversário"
          hint={
            connected
              ? 'Enviada de manhã para quem faz aniversário no dia.'
              : 'Só funciona com o WhatsApp da clínica conectado.'
          }
          checked={settings.notifyBirthday}
          disabled={!connected}
          onChange={(v) => save({ ...settings, notifyBirthday: v })}
        />
      </div>

      {settings.notifyBirthday && (
        <div className="border-t border-border p-5">
          <label htmlFor="wa-birthday" className="text-xs font-medium">
            Texto do aniversário
          </label>
          <textarea
            id="wa-birthday"
            rows={4}
            maxLength={600}
            value={settings.birthdayMessage}
            onChange={(e) => setSettings({ ...settings, birthdayMessage: e.target.value })}
            onBlur={() => save(settings)}
            placeholder="Deixe em branco para usar o texto padrão."
            className="mt-1.5 w-full rounded-md border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Use <code className="font-mono">{'{nome}'}</code> para o primeiro nome do paciente e{' '}
            <code className="font-mono">{'{clinica}'}</code> para o nome da clínica.
          </p>
        </div>
      )}
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
