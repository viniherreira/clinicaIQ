'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BadgeCheck, CheckCircle2, Plus, QrCode, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import {
  checkCloudAction,
  connectManualAction,
  createTemplateAction,
  disconnectCloudAction,
  finishSignupAction,
  syncTemplatesAction,
} from '../actions';

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

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: 'Aprovado', cls: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' },
  PENDING: { label: 'Em análise', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' },
  REJECTED: { label: 'Recusado', cls: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
  PAUSED: { label: 'Pausado', cls: 'bg-surface-alt text-muted-foreground' },
  DISABLED: { label: 'Desativado', cls: 'bg-surface-alt text-muted-foreground' },
};
const CATEGORY_LABEL: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidade', AUTHENTICATION: 'Autenticação' };

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function WhatsAppChannel({
  account,
  qr,
  templates,
  signup,
  canClinicWhatsapp,
}: {
  account: Account | null;
  qr: { connected: boolean; phone: string | null };
  templates: Template[];
  signup: { appId: string; configId: string; version: string } | null;
  canClinicWhatsapp: boolean;
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
                <p className="font-medium">API oficial do WhatsApp{account.manual ? ' (conexão de teste)' : ''}</p>
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
                  A conexão parou de funcionar: {account.lastError ?? 'erro na Meta'}. Enquanto isso, as conversas voltam a passar pelo QR code.
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
                  if (window.confirm('Desconectar a API oficial? As conversas do CRM voltam a passar pelo QR code.')) {
                    agir(disconnectCloudAction, 'API oficial desconectada. As conversas voltaram para o QR code.');
                  }
                }}
                className="btn-ghost btn-sm"
              >
                <Unplug className="h-3.5 w-3.5" aria-hidden="true" /> Desconectar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary-hover dark:text-sky-300" aria-hidden="true">
              <QrCode className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">QR code (o WhatsApp do celular da clínica)</p>
              <p className="text-sm text-muted-foreground">
                {qr.connected ? `Conectado${qr.phone ? ` · +${qr.phone}` : ''}` : 'Não conectado'}
              </p>
            </div>
            {canClinicWhatsapp && (
              <Link href="/whatsapp" className="btn-outline btn-sm">
                {qr.connected ? 'Ver conexão' : 'Conectar pelo QR code'}
              </Link>
            )}
          </div>
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
            <EmbeddedSignup signup={signup} onDone={(r) => (r.ok ? (setAviso('API oficial conectada.'), router.refresh()) : setErro(r.message))} />
          ) : (
            <p className="mt-3 rounded-lg bg-surface-alt px-3 py-2 text-sm">
              A conexão pela Meta fica disponível quando a Meta aprovar o ClinicaIQ como parceiro oficial. Enquanto isso, dá para testar
              com o número de teste da Meta abaixo.
            </p>
          )}
          <ManualConnect pending={pending} onSubmit={(input) => agir(() => connectManualAction(input), 'API oficial conectada (teste).')} />
        </section>
      )}

      {oficial && <Templates templates={templates} pending={pending} agir={agir} />}

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

function EmbeddedSignup({
  signup,
  onDone,
}: {
  signup: { appId: string; configId: string; version: string };
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
    const r = await finishSignupAction({ code, wabaId, phoneNumberId, coexistence });
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

function ManualConnect({ pending, onSubmit }: { pending: boolean; onSubmit: (i: { token: string; phoneNumberId: string; wabaId: string }) => void }) {
  const [token, setToken] = useState('');
  const [phoneNumberId, setPhone] = useState('');
  const [wabaId, setWaba] = useState('');
  const id = useId();
  return (
    <details className="mt-4 rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Conexão de teste (número de teste da Meta)</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        No painel do app na Meta, em WhatsApp → Configuração da API, copie o token, o ID do número de telefone e o ID da conta do
        WhatsApp Business. O token fica cifrado e nunca aparece de novo.
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
          Conectar teste
        </button>
      </form>
    </details>
  );
}

// ─── Modelos ─────────────────────────────────────────────────────────────────

function Templates({
  templates,
  pending,
  agir,
}: {
  templates: Template[];
  pending: boolean;
  agir: (fn: () => Promise<Result>, ok: string) => void;
}) {
  const [novo, setNovo] = useState(false);
  return (
    <section aria-labelledby="wa-modelos" className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="wa-modelos" className="mr-auto text-sm font-semibold">Modelos aprovados</h2>
        <button type="button" disabled={pending} onClick={() => agir(syncTemplatesAction, 'Modelos atualizados com a Meta.')} className="btn-outline btn-sm">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Sincronizar com a Meta
        </button>
        <button type="button" onClick={() => setNovo((v) => !v)} aria-expanded={novo} className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Novo modelo
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Fora das 24 horas, a API oficial só manda modelos aprovados. A Meta costuma analisar em minutos, às vezes em até 24 horas.
      </p>
      {novo && <NewTemplate pending={pending} onSubmit={(input) => agir(() => createTemplateAction(input), `Modelo ${input.name} enviado para a Meta.`)} />}
      {templates.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum modelo ainda. Crie um ou sincronize com a Meta.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {templates.map((t) => {
            const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.PENDING;
            return (
              <li key={t.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{CATEGORY_LABEL[t.category] ?? t.category}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">{t.body}</p>
                {t.rejectedReason && <p className="mt-1 text-xs text-destructive">Motivo: {t.rejectedReason}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function NewTemplate({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (i: { name: string; category: 'MARKETING' | 'UTILITY'; body: string; examples: string[] }) => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>('UTILITY');
  const [body, setBody] = useState('');
  const vars = Math.max(0, ...[...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])));
  const [examples, setExamples] = useState<string[]>([]);

  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, category, body, examples: Array.from({ length: vars }, (_, i) => examples[i] ?? '') });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">Nome (minúsculas e _)</label>
          <input
            id={`${id}-nome`}
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            placeholder="retomar_contato"
            maxLength={60}
            className={`${inputCls} mt-1 font-mono`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-cat`} className="block text-xs font-medium text-muted-foreground">Categoria</label>
          <select id={`${id}-cat`} value={category} onChange={(e) => setCategory(e.target.value as 'MARKETING' | 'UTILITY')} className={`${inputCls} mt-1`}>
            <option value="UTILITY">Utilidade (lembrete, retorno de atendimento)</option>
            <option value="MARKETING">Marketing (promoção, campanha)</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-corpo`} className="block text-xs font-medium text-muted-foreground">Texto — use {'{{1}}'}, {'{{2}}'}… para as variáveis</label>
        <textarea
          id={`${id}-corpo`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={1024}
          placeholder="Oi {{1}}, tudo bem? Ficou alguma dúvida sobre a sua avaliação? Responda esta mensagem que a gente te ajuda."
          className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>
      {vars > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">Exemplo de cada variável (a Meta pede para analisar)</legend>
          {Array.from({ length: vars }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <label htmlFor={`${id}-ex-${i}`} className="w-12 shrink-0 font-mono text-xs">{`{{${i + 1}}}`}</label>
              <input
                id={`${id}-ex-${i}`}
                value={examples[i] ?? ''}
                onChange={(e) => setExamples((xs) => Object.assign([...xs], { [i]: e.target.value }))}
                placeholder={i === 0 ? 'Ana' : ''}
                className={inputCls}
              />
            </div>
          ))}
        </fieldset>
      )}
      <button type="submit" disabled={pending || !name || !body.trim()} className="btn-primary btn-sm">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Enviar para aprovação
      </button>
    </form>
  );
}
