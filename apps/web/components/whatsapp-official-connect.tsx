'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Conectar a API oficial do WhatsApp: o cadastro incorporado da Meta (o botão
 * "Conectar com a Meta") e a conexão por token. Usado no CRM e na página
 * WhatsApp da gestão, cada um com as suas actions.
 */

type Result = { ok: true } | { ok: false; message: string };

export interface MetaSignupConfig {
  appId: string;
  configId: string;
  version: string;
}

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

// ─── Cadastro incorporado da Meta ────────────────────────────────────────────

declare global {
  interface Window {
    FB?: {
      init: (o: object) => void;
      login: (cb: (r: { authResponse?: { code?: string } }) => void, o: object) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => reject(new Error('sdk'));
    document.body.appendChild(s);
  });
}

export function EmbeddedSignup({
  signup,
  finish,
  onDone,
}: {
  signup: MetaSignupConfig;
  /** A action que troca o código pelo token (CRM ou gestão). */
  finish: (i: { code: string; wabaId: string; phoneNumberId: string; coexistence: boolean }) => Promise<Result>;
  onDone: (r: Result) => void;
}) {
  const [coexistence, setCoexistence] = useState(true);
  const [estado, setEstado] = useState<'parado' | 'aberto' | 'salvando'>('parado');
  const sessao = useRef<{ wabaId?: string; phoneNumberId?: string; code?: string }>({});
  const id = useId();

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(e.origin).hostname)) return;
      let data: { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string } };
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event === 'CANCEL') {
        setEstado('parado');
        return;
      }
      if (data.data?.waba_id) sessao.current.wabaId = data.data.waba_id;
      if (data.data?.phone_number_id) sessao.current.phoneNumberId = data.data.phone_number_id;
      void terminar();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coexistence]);

  async function terminar() {
    const { code, wabaId, phoneNumberId } = sessao.current;
    if (!code || !wabaId || !phoneNumberId) return;
    sessao.current = {};
    setEstado('salvando');
    const r = await finish({ code, wabaId, phoneNumberId, coexistence });
    setEstado('parado');
    onDone(r);
  }

  async function abrir() {
    try {
      await loadSdk(signup.appId, signup.version);
    } catch {
      onDone({ ok: false, message: 'Não foi possível abrir a janela da Meta. Confira se algum bloqueador está ativo.' });
      return;
    }
    setEstado('aberto');
    window.FB!.login(
      (r) => {
        if (r.authResponse?.code) {
          sessao.current.code = r.authResponse.code;
          void terminar();
        } else {
          setEstado('parado');
        }
      },
      {
        config_id: signup.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: '3',
          ...(coexistence ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
        },
      },
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <label htmlFor={`${id}-coex`} className="flex items-start gap-2 text-sm">
        <input id={`${id}-coex`} type="checkbox" checked={coexistence} onChange={(e) => setCoexistence(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
        <span>
          Usar o número que já está no WhatsApp Business do celular da clínica (recomendado). O celular continua funcionando e o
          histórico recente vem junto.
        </span>
      </label>
      <button type="button" onClick={() => void abrir()} disabled={estado !== 'parado'} className="btn-primary btn-md">
        {estado === 'salvando' ? 'Conectando…' : estado === 'aberto' ? 'Continue na janela da Meta…' : 'Conectar com a Meta'}
      </button>
    </div>
  );
}

export function ManualConnect({ pending, onSubmit }: { pending: boolean; onSubmit: (i: { token: string; phoneNumberId: string; wabaId: string }) => void }) {
  const [token, setToken] = useState('');
  const [phoneNumberId, setPhone] = useState('');
  const [wabaId, setWaba] = useState('');
  const id = useId();
  return (
    <details className="mt-4 rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Conectar com token (número de teste ou da mesma empresa do app)</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Use um token permanente de um usuário do sistema da Meta, o ID do número de telefone e o ID da conta do WhatsApp Business
        (no Gestor do WhatsApp). O token fica cifrado e nunca aparece de novo.
      </p>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ token, phoneNumberId, wabaId });
          setToken('');
        }}
      >
        <div>
          <label htmlFor={`${id}-token`} className="block text-xs font-medium text-muted-foreground">Token de acesso</label>
          <input id={`${id}-token`} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className={`${inputCls} mt-1`} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-pn`} className="block text-xs font-medium text-muted-foreground">ID do número de telefone</label>
            <input id={`${id}-pn`} inputMode="numeric" value={phoneNumberId} onChange={(e) => setPhone(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <label htmlFor={`${id}-waba`} className="block text-xs font-medium text-muted-foreground">ID da conta do WhatsApp Business</label>
            <input id={`${id}-waba`} inputMode="numeric" value={wabaId} onChange={(e) => setWaba(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
        </div>
        <button type="submit" disabled={pending || !token || !phoneNumberId || !wabaId} className="btn-outline btn-sm">
          Conectar
        </button>
      </form>
    </details>
  );
}
