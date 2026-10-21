'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { EmbeddedSignup, ManualConnect } from '@/components/whatsapp-official-connect';
import {
  checkOfficial,
  connectOfficialManual,
  disconnectOfficial,
  finishOfficialSignup,
  type WhatsAppPanelData,
} from '../actions';

type Result = { ok: true } | { ok: false; message: string };

/**
 * A API oficial da Meta na gestão da clínica: confirmações e lembretes saem pelo
 * número da clínica, com os botões Confirmar e Reagendar. A mesma conta serve às
 * conversas do CRM, para quem tem.
 */
export function OfficialCard({ official }: { official: WhatsAppPanelData['official'] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const conta = official.account;
  const ligada = Boolean(conta?.active);

  const agir = (fn: () => Promise<Result>, ok: string) =>
    start(async () => {
      setAviso('');
      setErro('');
      const r = await fn();
      if (r.ok) {
        setAviso(ok);
        router.refresh();
      } else setErro(r.message);
    });

  return (
    <section aria-labelledby="wa-oficial" className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <h2 id="wa-oficial" className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        API oficial do WhatsApp {!ligada && <span className="font-normal text-muted-foreground">(recomendado)</span>}
      </h2>

      {ligada && conta ? (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-sm">
            <BadgeCheck className="h-4 w-4 text-success" aria-hidden="true" />
            <span className="font-medium">{conta.verifiedName ?? 'Número conectado'}</span>
            {conta.displayPhone && <span className="tabular-nums text-muted-foreground">· {conta.displayPhone}</span>}
          </p>
          {conta.status === 'ERROR' && conta.lastError && <p className="mt-1 text-sm text-destructive">{conta.lastError}</p>}
          <p className="mt-2 text-sm text-muted-foreground">
            Confirmações e lembretes saem por este número, com os botões <strong>Confirmar</strong> e{' '}
            <strong>Reagendar</strong>, e a resposta do paciente cai na agenda. Os textos e a aprovação da Meta ficam em{' '}
            <Link href="/configuracoes#comunicacao" className="underline underline-offset-2">
              Configurações › Comunicação
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => agir(checkOfficial, 'O número respondeu: está tudo certo.')} className="btn-outline btn-sm">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Testar conexão
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm('Desligar a API oficial? Confirmações e lembretes param de sair por este número.')) {
                  agir(disconnectOfficial, 'API oficial desligada.');
                }
              }}
              className="btn-ghost btn-sm text-muted-foreground"
            >
              <Unplug className="h-3.5 w-3.5" aria-hidden="true" /> Desconectar
            </button>
          </div>
        </>
      ) : (
        <>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>O jeito aprovado pela Meta: sem risco de o número ser bloqueado.</li>
            <li>Confirmação e lembrete com os botões Confirmar e Reagendar.</li>
            <li>A Meta cobra cada aviso no cartão cadastrado na conta da clínica (centavos por mensagem).</li>
          </ul>
          {official.signup ? (
            <EmbeddedSignup
              signup={official.signup}
              finish={finishOfficialSignup}
              onDone={(r) => (r.ok ? (setAviso('API oficial conectada.'), router.refresh()) : setErro(r.message))}
            />
          ) : (
            <p className="mt-3 rounded-lg bg-surface-alt px-3 py-2 text-sm">
              O botão &quot;Conectar com a Meta&quot; aparece quando a Meta aprovar o DreamClin como parceiro oficial. Enquanto
              isso, dá para conectar com o token logo abaixo.
            </p>
          )}
          <ManualConnect pending={pending} onSubmit={(input) => agir(() => connectOfficialManual(input), 'API oficial conectada.')} />
        </>
      )}

      <p role="status" aria-live="polite" className="mt-2 text-sm text-success">
        {aviso}
      </p>
      {erro && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {erro}
        </p>
      )}
    </section>
  );
}
