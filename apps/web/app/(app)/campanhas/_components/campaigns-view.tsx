'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Megaphone, Plus, Send, UserX } from 'lucide-react';
import type { listCampaigns } from '../actions';
import { NewCampaign } from './new-campaign';

type Data = Awaited<ReturnType<typeof listCampaigns>>;

const STATUS_PT: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Rascunho', cls: 'bg-surface-alt text-muted-foreground' },
  SENDING: { label: 'Enviando…', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  DONE: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
};

export function CampaignsView({ data }: { data: Data }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  const remaining = Math.max(0, data.dailyLimit - data.sentToday);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Envie uma mensagem para vários pacientes de uma vez, pelo WhatsApp da clínica.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!data.connected}
          className="btn-primary btn-md"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Nova campanha
        </button>
      </header>

      {!data.connected && (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">WhatsApp não conectado</p>
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              Conecte o número da clínica em{' '}
              <Link href="/whatsapp" className="font-medium underline">
                WhatsApp
              </Link>{' '}
              para poder enviar campanhas.
            </p>
          </div>
        </div>
      )}

      {/* Usage + safety */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Enviadas hoje" value={`${data.sentToday}`} hint={`de ${data.dailyLimit} por dia`} />
        <Stat label="Ainda pode enviar" value={`${remaining}`} hint="reinicia a cada 24h" />
        <Stat
          label="Descadastrados"
          value={`${data.optedOut}`}
          hint="pediram para não receber"
          icon={<UserX className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      <div className="rounded-xl border border-border bg-surface-alt/60 p-4 text-xs leading-relaxed text-muted-foreground">
        <strong className="font-medium text-foreground">Como o envio é feito:</strong> as mensagens
        saem espaçadas (uma a cada 12–28 segundos, com pausas maiores a cada 20), porque disparo em
        massa é o que faz o WhatsApp bloquear um número. Uma campanha de 100 pessoas leva cerca de
        40 minutos — pode fechar a tela, o envio continua. Toda mensagem já vai com a opção de
        responder <strong className="font-medium text-foreground">SAIR</strong>, e quem responde
        isso para de receber automaticamente.
      </div>

      {/* History */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Campanhas enviadas</h2>
        </div>

        {data.campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Megaphone className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium">Nenhuma campanha ainda</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Crie uma para avisar de uma promoção, chamar pacientes que sumiram ou desejar feliz
              aniversário.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.campaigns.map((c) => {
              const meta = STATUS_PT[c.status] ?? STATUS_PT.DRAFT;
              const pct = c.total > 0 ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;
              return (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {c.message.replace(/\*/g, '')}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-alt">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {c.sent}/{c.total} enviadas
                      {c.failed > 0 && ` · ${c.failed} falharam`}
                    </span>
                  </div>

                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString('pt-BR')}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data.campaigns.some((c) => c.status === 'SENDING') && (
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          className="btn-outline btn-sm"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" /> Atualizar progresso
        </button>
      )}

      {creating && (
        <NewCampaign
          onClose={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <p className="text-xs">{label}</p>
      </div>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
