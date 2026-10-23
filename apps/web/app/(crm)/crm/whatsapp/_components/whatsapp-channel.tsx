'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BadgeCheck, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import {
  checkCloudAction,
  connectManualAction,
  disconnectCloudAction,
  finishSignupAction,
} from '../actions';
import { EmbeddedSignup, ManualConnect, type MetaSignupConfig } from '@/components/whatsapp-official-connect';

type Result = { ok: true } | { ok: false; message: string };

interface Account {
  displayPhone: string | null;
  verifiedName: string | null;
  coexistence: boolean;
  manual: boolean;
  active: boolean;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  lastError: string | null;
  connectedAt: string;
}

interface Template {
  id: string;
  name: string;
  category: string;
  status: string;
  body: string;
  rejectedReason: string | null;
}


/**
 * O canal das conversas do CRM: só a API oficial da Meta, a mesma conta da
 * clínica (avisos da agenda e CRM no mesmo número).
 */
export function WhatsAppChannel({
  account,
  templates,
  signup,
}: {
  account: Account | null;
  templates: Template[];
  signup: MetaSignupConfig | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const oficial = Boolean(account?.active);

  const agir = (fn: () => Promise<Result>, ok: string) =>
    start(async () => {
      setErro('');
      const r = await fn();
      if (!r.ok) return setErro(r.message);
      setAviso(ok);
      router.refresh();
    });

  return (
    <div className="mt-6 space-y-6">
      <section aria-labelledby="wa-canal" className="rounded-xl border border-border bg-surface p-5">
        <h2 id="wa-canal" className="text-sm font-semibold">Canal das conversas</h2>

        {oficial && account ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200" aria-hidden="true">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">API oficial do WhatsApp{account.manual ? ' (conexão manual)' : ''}</p>
                <p className="text-sm text-muted-foreground">
                  {[account.verifiedName, account.displayPhone].filter(Boolean).join(' · ') || 'Número conectado'}
                  {account.coexistence && ' · o celular da clínica continua funcionando'}
                </p>
              </div>
            </div>
            {account.status === 'ERROR' && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  A conexão parou de funcionar: {account.lastError ?? 'erro na Meta'}. Enquanto isso, nenhuma mensagem sai nem chega. Teste a
                  conexão ou conecte de novo.
                </span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => agir(checkCloudAction, 'Conexão com a Meta funcionando.')} className="btn-outline btn-sm">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Testar conexão
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (window.confirm('Desconectar a API oficial? Conversas, robô e avisos da agenda param de sair até conectar de novo.')) {
                    agir(disconnectCloudAction, 'API oficial desconectada.');
                  }
                }}
                className="btn-ghost btn-sm"
              >
                <Unplug className="h-3.5 w-3.5" aria-hidden="true" /> Desconectar
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum número conectado. Conecte o WhatsApp da clínica pela API oficial aqui embaixo: as conversas do CRM, o robô e os
            avisos da agenda passam a sair por ele.
          </p>
        )}
      </section>

      {!oficial && (
        <section aria-labelledby="wa-oficial" className="rounded-xl border border-border bg-surface p-5">
          <h2 id="wa-oficial" className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> API oficial do WhatsApp
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Sem risco de o número ser banido por usar o WhatsApp Web.</li>
            <li>Botões de verdade no robô e fotos e áudios abrindo no CRM.</li>
            <li>O celular da clínica continua funcionando (coexistência).</li>
            <li>Regra da Meta: depois de 24 horas sem a pessoa escrever, só com modelo aprovado.</li>
          </ul>
          {signup ? (
            <EmbeddedSignup signup={signup} finish={finishSignupAction} onDone={(r) => (r.ok ? (setAviso('API oficial conectada.'), router.refresh()) : setErro(r.message))} />
          ) : (
            <p className="mt-3 rounded-lg bg-surface-alt px-3 py-2 text-sm">
              A conexão pela Meta fica disponível quando a Meta aprovar o DreamClin como parceiro oficial. Enquanto isso, dá para testar
              com o número de teste da Meta abaixo.
            </p>
          )}
          <ManualConnect pending={pending} onSubmit={(input) => agir(() => connectManualAction(input), 'API oficial conectada.')} />
        </section>
      )}

      {oficial && (
        <section aria-labelledby="wa-modelos" className="rounded-xl border border-border bg-surface p-5">
          <h2 id="wa-modelos" className="text-sm font-semibold">Modelos de mensagem</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {templates.filter((t) => t.status === 'APPROVED').length} aprovado(s) pela Meta. Crie e acompanhe em{' '}
            <Link href="/crm/automacoes/modelos" className="font-medium text-link underline-offset-2 hover:underline">
              Automações › Modelos
            </Link>
            .
          </p>
        </section>
      )}

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {aviso}
      </p>
    </div>
  );
}
