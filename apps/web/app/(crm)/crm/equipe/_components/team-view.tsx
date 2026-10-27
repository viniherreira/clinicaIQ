'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, Info, Lock, Shuffle, UsersRound } from 'lucide-react';
import { CRM_ROLE_INFO, CRM_ROLES, type CrmRole } from '@/lib/crm-roles';
import { DISTRIBUTION_MODE_INFO, type DistributionMode, type DistributionSettings } from '@/crm/distribution-rules';
import type { TeamMember } from '@/crm/team';
import { initials } from '@/crm/format';
import { CrmSeatToggle } from '@/components/crm-addon-controls';
import { distributeUnassignedAction, saveDistributionAction, transferPortfolioAction, updateMemberAction } from '../actions';

const PERFIL: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
  PROFESSIONAL: 'Profissional',
};

const switchCls =
  'h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-border transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50';
const selectCls =
  'h-8 rounded-md border border-border bg-surface-alt px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60';
const card = 'rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5';

type Result = { ok: true } | { ok: false; message: string };

export function TeamView({
  members,
  distribution,
  unassigned,
  meId,
  seats,
  wholeTeam,
}: {
  members: TeamMember[];
  distribution: DistributionSettings;
  unassigned: number;
  meId: string;
  /** Quem vê pode dar e tirar o acesso ao CRM (conta na mensalidade). */
  seats: { hint: string } | null;
  /** Cortesia: toda a equipe entra, sem chave. */
  wholeTeam: boolean;
}) {
  const [aviso, setAviso] = useState('');
  const comAcesso = members.filter((m) => m.member);
  const semAcesso = members.filter((m) => !m.member);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Distribution initial={distribution} unassigned={unassigned} members={comAcesso} onAnnounce={setAviso} />

      <section aria-labelledby="equipe-titulo" className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="equipe-titulo" className="flex items-center gap-2 text-sm font-semibold">
            <UsersRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Quem usa o CRM
          </h2>
          <p className="text-xs text-muted-foreground">
            {comAcesso.length} {comAcesso.length === 1 ? 'pessoa' : 'pessoas'}
            {wholeTeam ? ' · cortesia: toda a equipe entra' : ''}
          </p>
        </div>
        <ul className="mt-3 divide-y divide-border">
          {comAcesso.map((m) => (
            <MemberRow key={m.id} m={m} me={m.id === meId} team={comAcesso} seats={seats} onAnnounce={setAviso} />
          ))}
        </ul>
        {comAcesso.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Ninguém da equipe tem acesso ao CRM ainda.</p>}
      </section>

      {semAcesso.length > 0 && (
        <section aria-labelledby="sem-acesso-titulo" className={card}>
          <h2 id="sem-acesso-titulo" className="text-sm font-semibold">Sem acesso ao CRM</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {seats
              ? 'Ligue a chave para a pessoa entrar no CRM.'
              : 'Quem cuida da equipe da clínica libera o acesso em Configurações › Equipe.'}
          </p>
          <ul className="mt-3 divide-y divide-border">
            {semAcesso.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <Person m={m} me={m.id === meId} />
                {seats && <CrmSeatToggle userId={m.id} name={m.name} on={m.seat} hint={seats.hint} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="cargos-titulo" className={card}>
        <h2 id="cargos-titulo" className="flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> O que cada cargo pode
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          {CRM_ROLES.map((r) => (
            <div key={r} className="rounded-lg bg-surface-alt/60 p-3">
              <dt className="text-sm font-semibold">{CRM_ROLE_INFO[r].label}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{CRM_ROLE_INFO[r].description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          O proprietário é sempre Gestor. O cargo vale só no CRM; o que a pessoa faz na agenda continua pelo perfil da clínica.
        </p>
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </div>
  );
}

function Person({ m, me }: { m: TeamMember; me: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary-hover dark:text-sky-300"
      >
        {initials(m.name)}
        {m.member && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${m.available ? 'bg-emerald-500' : 'bg-zinc-400'}`}
          />
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {m.name}
          {me && <span className="font-normal text-muted-foreground"> (você)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {PERFIL[m.role] ?? m.role} · {m.email}
        </p>
      </div>
    </div>
  );
}

function MemberRow({
  m,
  me,
  team,
  seats,
  onAnnounce,
}: {
  m: TeamMember;
  me: boolean;
  team: TeamMember[];
  seats: { hint: string } | null;
  onAnnounce: (s: string) => void;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  const [passando, setPassando] = useState(false);
  const [destino, setDestino] = useState('distribute');

  const salvar = (fn: () => Promise<Result>, ok: string) =>
    start(async () => {
      setErro('');
      const r = await fn();
      if (!r.ok) return setErro(r.message);
      onAnnounce(ok);
      router.refresh();
    });

  const carteira = m.openLeads + m.awaiting;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 xl:grid xl:grid-cols-[minmax(10rem,1fr)_11rem_8.25rem_7rem_8.5rem_9rem] xl:gap-x-4">
        <div className="min-w-[14rem] flex-1 xl:min-w-0">
          <Person m={m} me={me} />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor={`${id}-cargo`} className="text-xs text-muted-foreground xl:sr-only">
            Cargo
          </label>
          {m.locked ? (
            <span id={`${id}-cargo`} className="inline-flex items-center gap-1 text-sm font-medium">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> Gestor
            </span>
          ) : (
            <select
              id={`${id}-cargo`}
              value={m.crmRole}
              disabled={pending}
              onChange={(e) => {
                const r = e.target.value as CrmRole;
                salvar(() => updateMemberAction(m.id, { crmRole: r }), `${m.name} agora é ${CRM_ROLE_INFO[r].label}.`);
              }}
              className={`${selectCls} min-w-0 xl:flex-1`}
            >
              {CRM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {CRM_ROLE_INFO[r].label}
                </option>
              ))}
            </select>
          )}
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
          <input
            type="checkbox"
            role="switch"
            checked={m.receivesLeads}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.checked;
              salvar(() => updateMemberAction(m.id, { receivesLeads: v }), v ? `${m.name} recebe leads.` : `${m.name} não recebe leads.`);
            }}
            className={switchCls}
          />
          Recebe leads
        </label>

        <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
          <input
            type="checkbox"
            role="switch"
            checked={m.available}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.checked;
              salvar(() => updateMemberAction(m.id, { available: v }), v ? `${m.name} disponível.` : `${m.name} ausente.`);
            }}
            className={switchCls}
          />
          {m.available ? 'Disponível' : 'Ausente'}
        </label>

        <p className="w-36 text-xs tabular-nums text-muted-foreground xl:w-auto">
          <span className="font-semibold text-foreground">{m.openLeads}</span> {m.openLeads === 1 ? 'negócio aberto' : 'negócios abertos'}
          <br />
          <span className="font-semibold text-foreground">{m.awaiting}</span> sem resposta
        </p>

        <div className="flex items-center gap-2 xl:justify-self-end">
          {seats && !m.locked && <CrmSeatToggle userId={m.id} name={m.name} on={m.seat} hint="Acesso" />}
          {carteira > 0 && team.length > 1 && (
            <button
              type="button"
              onClick={() => setPassando((v) => !v)}
              aria-expanded={passando}
              className="btn-outline btn-sm inline-flex items-center gap-1.5"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" /> Passar carteira
            </button>
          )}
        </div>
      </div>

      {passando && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-alt/70 p-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setErro('');
              const r = await transferPortfolioAction(m.id, destino);
              if (!r.ok) return setErro(r.message);
              onAnnounce(`Passados ${r.leads} negócios e ${r.conversations} conversas de ${m.name}.`);
              setPassando(false);
              router.refresh();
            });
          }}
        >
          <label htmlFor={`${id}-destino`}>
            Passar os negócios abertos e as conversas de {m.name.split(' ')[0]} para
          </label>
          <select id={`${id}-destino`} value={destino} onChange={(e) => setDestino(e.target.value)} className={selectCls}>
            <option value="distribute">a equipe (pela distribuição)</option>
            {team
              .filter((p) => p.id !== m.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <button type="submit" disabled={pending} className="btn-primary btn-sm">
            Passar
          </button>
          <button type="button" onClick={() => setPassando(false)} className="btn-ghost btn-sm">
            Cancelar
          </button>
        </form>
      )}
      {erro && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {erro}
        </p>
      )}
    </li>
  );
}

function Distribution({
  initial,
  unassigned,
  members,
  onAnnounce,
}: {
  initial: DistributionSettings;
  unassigned: number;
  members: TeamMember[];
  onAnnounce: (s: string) => void;
}) {
  const id = useId();
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    setS(initial);
  }, [initial]);
  const mudou = s.enabled !== initial.enabled || s.mode !== initial.mode || s.onlyAvailable !== initial.onlyAvailable;
  const recebem = members.filter((m) => m.receivesLeads);
  const agora = recebem.filter((m) => !s.onlyAvailable || m.available);

  const salvar = () =>
    start(async () => {
      const r = await saveDistributionAction(s);
      setMsg(r.ok ? { ok: true, text: 'Distribuição salva.' } : { ok: false, text: r.message });
      if (r.ok) {
        onAnnounce('Distribuição salva.');
        router.refresh();
      }
    });

  return (
    <section aria-labelledby={`${id}-titulo`} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 id={`${id}-titulo`} className="flex items-center gap-2 text-sm font-semibold">
            <Shuffle className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Distribuição de leads
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Quando um número novo escreve no WhatsApp, ou uma conversa fica sem responsável, o CRM escolhe quem atende. Cliente
            que volta a escrever fica com quem já o atendia.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            role="switch"
            checked={s.enabled}
            onChange={(e) => setS({ ...s, enabled: e.target.checked })}
            className={switchCls}
          />
          {s.enabled ? 'Ligada' : 'Desligada'}
        </label>
      </div>

      <fieldset className="mt-4" disabled={!s.enabled}>
        <legend className="text-xs font-medium text-muted-foreground">Como repartir</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(Object.keys(DISTRIBUTION_MODE_INFO) as DistributionMode[]).map((k) => (
            <label
              key={k}
              aria-label={DISTRIBUTION_MODE_INFO[k].label}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
                s.mode === k ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-surface-alt/60'
              }`}
            >
              <input
                type="radio"
                name={`${id}-modo`}
                checked={s.mode === k}
                onChange={() => setS({ ...s, mode: k })}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-semibold">{DISTRIBUTION_MODE_INFO[k].label}</span>
                <span className="block text-xs text-muted-foreground">{DISTRIBUTION_MODE_INFO[k].description}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.onlyAvailable}
            onChange={(e) => setS({ ...s, onlyAvailable: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Só para quem está disponível (quem marcou Ausente fica de fora)
        </label>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button type="button" onClick={salvar} disabled={pending || !mudou} className="btn-primary btn-sm">
          Salvar distribuição
        </button>
        <p className="text-xs text-muted-foreground">
          {recebem.length === 0
            ? 'Ninguém está marcado para receber leads.'
            : s.enabled
              ? `Recebendo agora: ${agora.length ? agora.map((m) => m.name.split(' ')[0]).join(', ') : 'ninguém disponível — vai para todos que recebem'}.`
              : `${recebem.length} ${recebem.length === 1 ? 'pessoa recebe' : 'pessoas recebem'} quando ligar.`}
        </p>
        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
            {msg.text}
          </p>
        )}
      </div>

      {unassigned > 0 && initial.enabled && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="mr-auto">
            {unassigned} {unassigned === 1 ? 'conversa está' : 'conversas estão'} sem responsável.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await distributeUnassignedAction();
                const t = r.ok ? `${r.count} ${r.count === 1 ? 'conversa distribuída' : 'conversas distribuídas'}.` : r.message;
                setMsg({ ok: r.ok, text: t });
                onAnnounce(t);
                router.refresh();
              })
            }
            className="btn-outline btn-sm"
          >
            Distribuir agora
          </button>
        </div>
      )}
    </section>
  );
}
