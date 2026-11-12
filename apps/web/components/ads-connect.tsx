'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, BadgeCheck, Megaphone, Unplug } from 'lucide-react';
import {
  chooseAdAccountAction,
  disconnectAdsAction,
  finishAdsLoginAction,
  listAdAccountsAction,
} from '@/app/(crm)/crm/whatsapp/ads-actions';
import { loadMetaSdk } from './whatsapp-official-connect';

/**
 * Conectar o Gerenciador de Anúncios da Meta: um botão que abre a janela da
 * Meta. O token nunca passa pela tela; aqui só chegam o nome e o número das
 * contas, para a pessoa escolher qual é a da clínica.
 */

export interface AdsLoginConfig {
  appId: string;
  configId: string;
  version: string;
  /** 'token': a janela devolve o token de pessoa; 'code': devolve o código (token de sistema). */
  flow: 'token' | 'code';
}

export interface AdsConnectionView {
  state: 'none' | 'choosing' | 'connected';
  accountId: string | null;
  accountName: string | null;
  connectedAt: string | null;
}

interface Account {
  id: string;
  name: string;
  currency: string | null;
  spentCents: number;
}

const dinheiro = (cents: number, currency: string | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency ?? 'BRL', maximumFractionDigits: 0 }).format(cents / 100);

export function AdsConnect({
  connection,
  login,
  metaEvents,
  canManage = true,
}: {
  connection: AdsConnectionView;
  /** Nulo: o servidor ainda não tem a configuração da Meta para anúncios. */
  login: AdsLoginConfig | null;
  /** A chave "Avisar a Meta quando agendar ou fechar" está ligada? */
  metaEvents: boolean;
  canManage?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [estado, setEstado] = useState<'parado' | 'aberto' | 'salvando'>('parado');
  const [contas, setContas] = useState<Account[] | null>(null);
  const [escolhida, setEscolhida] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const ocupado = pending || estado !== 'parado';

  async function abrir() {
    if (!login) return;
    setErro('');
    setAviso('');
    try {
      await loadMetaSdk(login.appId, login.version);
    } catch {
      setErro('Não foi possível abrir a janela da Meta. Confira se algum bloqueador de anúncios está ativo nesta página.');
      return;
    }
    setEstado('aberto');
    window.FB!.login(
      (r) => {
        const code = r.authResponse?.code;
        const accessToken = r.authResponse?.accessToken;
        if (!code && !accessToken) return setEstado('parado');
        setEstado('salvando');
        // O token só passa daqui para o servidor, que confere com a Meta e guarda cifrado; nunca aparece na tela.
        void finishAdsLoginAction(code ? { code } : { accessToken }, `${window.location.origin}${window.location.pathname}`).then((res) => {
          setEstado('parado');
          if (!res.ok) return setErro(res.message);
          if (res.chosen) {
            setContas(null);
            setAviso(`Conectado à conta ${res.chosen.name}.`);
          } else {
            setContas(res.accounts);
            setEscolhida('');
          }
          router.refresh();
        });
      },
      login.flow === 'code'
        ? { config_id: login.configId, response_type: 'code', override_default_response_type: true }
        : { config_id: login.configId },
    );
  }

  const escolher = () =>
    start(async () => {
      setErro('');
      const r = await chooseAdAccountAction(escolhida);
      if (!r.ok) return setErro(r.message);
      const nome = contas?.find((c) => c.id === escolhida)?.name;
      setContas(null);
      setAviso(nome ? `Conectado à conta ${nome}.` : 'Conta de anúncios escolhida.');
      router.refresh();
    });

  const trocar = () =>
    start(async () => {
      setErro('');
      setAviso('');
      const r = await listAdAccountsAction();
      if (!r.ok) return setErro(r.message);
      setContas(r.accounts);
      setEscolhida(connection.accountId ?? '');
    });

  const desconectar = () => {
    if (!window.confirm('Desconectar o Gerenciador de Anúncios? A tela Anúncios para de mostrar os números da Meta. Nada do CRM é apagado.')) return;
    start(async () => {
      setErro('');
      const r = await disconnectAdsAction();
      if (!r.ok) return setErro(r.message);
      setContas(null);
      setAviso('Gerenciador de Anúncios desconectado.');
      router.refresh();
    });
  };

  // A lista aparece logo depois de conectar com várias contas, ou ao pedir para trocar.
  const lista = contas ?? null;
  const precisaEscolher = connection.state === 'choosing' && !lista;

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            connection.state === 'connected' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' : 'bg-primary/10 text-primary'
          }`}
          aria-hidden="true"
        >
          {connection.state === 'connected' ? <BadgeCheck className="h-5 w-5" /> : <Megaphone className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-t`} className="text-sm font-semibold">
            Gerenciador de Anúncios
          </h2>
          <p className="text-sm text-muted-foreground">
            {connection.state === 'connected'
              ? `${connection.accountName ?? 'Conta de anúncios'} · conta ${connection.accountId}`
              : 'Facebook e Instagram'}
          </p>
        </div>
        {connection.state === 'connected' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-900/50 dark:text-green-200">
            Conectado
          </span>
        )}
      </div>

      {connection.state !== 'connected' && (
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          Veja quanto cada anúncio custou e quantos pacientes trouxe. Só leitura: o DreamClin não cria nem altera anúncios.
        </p>
      )}

      {connection.state === 'connected' && !lista && (
        <dl className="mt-4 divide-y divide-border/70 border-t border-border/70 text-sm">
          <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-muted-foreground">Avisar a Meta quando agendar ou fechar</dt>
            <dd className="text-right">
              {metaEvents ? 'Ligado' : 'Desligado'}{' '}
              <Link href="/crm/configuracoes" className="font-medium text-link underline-offset-2 hover:underline">
                Mudar
              </Link>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-muted-foreground">Números e gráficos</dt>
            <dd>
              <Link href="/crm/anuncios" className="inline-flex items-center gap-1 font-medium text-link underline-offset-2 hover:underline">
                Abrir a tela Anúncios <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </dd>
          </div>
        </dl>
      )}

      {precisaEscolher && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Falta escolher qual conta de anúncios é a da clínica.</span>
        </p>
      )}

      {lista && (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Qual é a conta de anúncios da clínica?</legend>
          {lista.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma conta de anúncios liberada. Conecte de novo e marque a conta na janela da Meta.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {lista.map((c) => (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    escolhida === c.id ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${id}-conta`}
                    value={c.id}
                    checked={escolhida === c.id}
                    onChange={() => setEscolhida(c.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      Conta {c.id}
                      {c.currency ? ` · ${c.currency}` : ''}
                    </span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    <span className="block text-sm font-medium tabular-nums text-foreground">{dinheiro(c.spentCents, c.currency)}</span>
                    já investidos
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={ocupado || !escolhida} onClick={escolher} className="btn-primary btn-md">
              {pending ? 'Salvando…' : 'Usar esta conta'}
            </button>
            {connection.state === 'connected' && (
              <button type="button" disabled={ocupado} onClick={() => setContas(null)} className="btn-ghost btn-md">
                Cancelar
              </button>
            )}
          </div>
        </fieldset>
      )}

      {canManage && !lista && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {connection.state === 'none' &&
            (login ? (
              <button type="button" onClick={() => void abrir()} disabled={ocupado} className="btn-primary btn-md">
                {estado === 'salvando' ? 'Conectando…' : estado === 'aberto' ? 'Continue na janela da Meta…' : 'Conectar Gerenciador de Anúncios'}
              </button>
            ) : (
              <p className="rounded-lg bg-surface-alt px-3 py-2 text-sm">A conexão com o Gerenciador de Anúncios ainda está sendo liberada. Volte em breve.</p>
            ))}
          {connection.state === 'choosing' && (
            <button type="button" onClick={trocar} disabled={ocupado} className="btn-primary btn-md">
              Escolher a conta
            </button>
          )}
          {connection.state === 'connected' && (
            <button type="button" onClick={trocar} disabled={ocupado} className="btn-outline btn-sm">
              Trocar conta
            </button>
          )}
          {connection.state !== 'none' && (
            <button type="button" onClick={desconectar} disabled={ocupado} className="btn-ghost btn-sm">
              <Unplug className="h-3.5 w-3.5" aria-hidden="true" /> Desconectar
            </button>
          )}
          {connection.state !== 'none' && login && (
            <button type="button" onClick={() => void abrir()} disabled={ocupado} className="btn-ghost btn-sm">
              Conectar de novo
            </button>
          )}
        </div>
      )}

      {!canManage && connection.state !== 'connected' && (
        <p className="mt-3 text-sm text-muted-foreground">Só um gestor do CRM pode conectar o Gerenciador de Anúncios.</p>
      )}

      {erro && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {erro}
        </p>
      )}
      <p role="status" aria-live="polite" className={aviso ? 'mt-3 text-sm text-muted-foreground' : 'sr-only'}>
        {aviso}
      </p>
    </section>
  );
}
