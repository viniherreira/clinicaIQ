'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, RefreshCw, Smartphone, X } from 'lucide-react';
import { getConnectionState, startConnection, type ConnectionState } from '../actions';

interface Props {
  open: boolean;
  onClose: () => void;
}

const POLL_MS = 2000;

const STEPS = [
  'Abra o WhatsApp no celular da clínica',
  'Toque em Mais opções (⋮) ou Configurações → Aparelhos conectados',
  'Toque em Conectar um aparelho',
  'Aponte a câmera para o código ao lado',
];

export function PairingModal({ open, onClose }: Props) {
  const titleId = useId();
  const router = useRouter();
  const [state, setState] = useState<ConnectionState | null>(null);
  const [starting, setStarting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Kick off pairing when the dialog opens, then poll until the socket reports
  // CONNECTED (or errors out).
  useEffect(() => {
    if (!open) {
      setState(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const next = await getConnectionState().catch(() => null);
      if (cancelled) return;
      if (next) setState(next);
      if (next?.status === 'CONNECTED') {
        router.refresh();
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    }

    setStarting(true);
    startConnection()
      .then((initial) => {
        if (cancelled) return;
        setState(initial);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setStarting(false);
        timer = setTimeout(poll, POLL_MS);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, router]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const connected = state?.status === 'CONNECTED';
  const failed = state?.status === 'ERROR';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              Conectar o WhatsApp da clínica
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              O código vale por cerca de 1 minuto e se renova sozinho.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-6 p-5 sm:grid-cols-[280px_1fr]">
          {/* QR / status panel */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-alt p-4">
            {connected ? (
              <div className="flex flex-col items-center py-10 text-center">
                <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">WhatsApp conectado</p>
                {state?.phoneNumber && (
                  <p className="mt-1 text-sm tabular-nums text-muted-foreground">+{state.phoneNumber}</p>
                )}
                <button type="button" onClick={onClose} className="btn-primary btn-md mt-5">
                  Concluir
                </button>
              </div>
            ) : state?.qrCode ? (
              <Image
                src={state.qrCode}
                alt="QR code para conectar o WhatsApp da clínica"
                width={256}
                height={256}
                unoptimized
                className="h-64 w-64 rounded-lg bg-white p-2"
              />
            ) : failed ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-destructive">Não foi possível iniciar</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {state?.lastError ?? 'Tente novamente em alguns instantes.'}
                </p>
                <button
                  type="button"
                  onClick={() => startConnection().then(setState)}
                  className="btn-outline btn-md mt-4"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar de novo
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {starting ? 'Iniciando conexão…' : 'Gerando o código…'}
                </p>
              </div>
            )}
            <p aria-live="polite" className="sr-only">
              {connected
                ? 'WhatsApp conectado com sucesso.'
                : state?.qrCode
                  ? 'Código pronto para leitura.'
                  : 'Aguardando o código.'}
            </p>
          </div>

          {/* Instructions */}
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />
              Como conectar
            </div>
            <ol className="space-y-3">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-5 rounded-lg border border-border bg-surface-alt p-3 text-xs leading-relaxed text-muted-foreground">
              <strong className="font-medium text-foreground">Use o número da clínica</strong>, não o
              pessoal. O celular precisa ficar com internet — se ele ficar dias offline, o WhatsApp
              derruba a conexão e você terá que ler o código de novo.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
