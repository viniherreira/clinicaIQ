'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRightLeft, Crown, Info, Lock, Plus, Shuffle, UsersRound, X } from 'lucide-react';
import { CRM_ROLE_INFO, CRM_ROLES } from '@/lib/crm-roles';
import { LEVEL_LABEL, presetOf, readRights, RIGHT_CELLS, ROLE_RIGHTS, type CrmRights, type Level } from '@/lib/crm-rights';
import { DISTRIBUTION_MODE_INFO, type DistributionMode, type DistributionSettings } from '@/crm/distribution-rules';
import type { TeamMember } from '@/crm/team';
import { initials } from '@/crm/format';
import { CrmSeatToggle } from '@/components/crm-addon-controls';
import { distributeUnassignedAction, saveDistributionAction, transferPortfolioAction, updateMemberAction } from '../team-actions';

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

type Seats = { hint: string } | null;

const cargoLabel = (m: Pick<TeamMember, 'member' | 'custom' | 'crmRole'>) =>
  !m.member ? 'Sem acesso' : m.custom ? 'Personalizado' : CRM_ROLE_INFO[m.crmRole].label;

/**
 * Configurações › Equipe e permissões, como a Gestão de usuários do Kommo: a
 * tabela da equipe e, ao abrir alguém, o quadro de permissões (criar, ver,
 * editar, excluir, exportar × negado, se responsável, permitido).
 */
export function TeamSection({
  members,
  meId,
  seats,
  wholeTeam,
}: {
  members: TeamMember[];
  meId: string;
  /** Quem vê pode dar e tirar o acesso ao CRM (conta na mensalidade). */
  seats: Seats;
  /** Cortesia: toda a equipe entra, sem chave. */
  wholeTeam: boolean;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const pessoa = members.find((m) => m.id === aberto) ?? null;
  const comAcesso = members.filter((m) => m.member);

  return (
    <>
      <section aria-labelledby="equipe-titulo" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="equipe-titulo" className="flex items-center gap-2 text-base font-semibold">
              <UsersRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Gestão de usuários
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {comAcesso.length} {comAcesso.length === 1 ? 'pessoa usa' : 'pessoas usam'} o CRM
              {wholeTeam ? ' · cortesia: toda a equipe entra' : ''}. Clique em alguém para ver e mudar as permissões.
            </p>
          </div>
          <Link href="/configuracoes#equipe" className="btn-primary btn-sm inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar usuário
          </Link>
        </div>

        <div className="relative mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Equipe do CRM: perfil, cargo, carteira e status de cada pessoa</caption>
            <thead className="whitespace-nowrap bg-surface-alt/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2.5">Nome</th>
                <th scope="col" className="px-3 py-2.5">Perfil</th>
                <th scope="col" className="px-3 py-2.5">Cargo no CRM</th>
                <th scope="col" className="px-3 py-2.5 text-right">Negócios</th>
                <th scope="col" className="px-3 py-2.5 text-right">Sem resposta</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => (
                <tr key={m.id} className={`hover:bg-surface-alt/50 ${m.member ? '' : 'text-muted-foreground'}`}>
                  <th scope="row" className="px-3 py-2.5 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => setAberto(m.id)}
                      aria-haspopup="dialog"
                      className="flex items-center gap-2.5 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Avatar m={m} />
                      <span className="min-w-0">
                        <span className="block font-medium text-link hover:underline">
                          {m.name}
                          {m.id === meId && <span className="font-normal text-muted-foreground"> (você)</span>}
                        </span>
                        <span className="block max-w-[15rem] truncate text-xs text-muted-foreground">{m.email}</span>
                      </span>
                    </button>
                  </th>
                  <td className="whitespace-nowrap px-3 py-2.5">{PERFIL[m.role] ?? m.role}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      {m.locked && <Crown className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
                      {cargoLabel(m)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{m.member ? m.openLeads : '-'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{m.member ? m.awaiting : '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {m.member ? (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.available ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${m.available ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                        {m.available ? 'Disponível' : 'Ausente'}
                        {!m.receivesLeads && <span className="font-normal text-muted-foreground"> · não recebe leads</span>}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <RolesLegend />

      <Dialog.Root open={Boolean(pessoa)} onOpenChange={(o) => !o && setAberto(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(720px,100vw)] flex-col border-l border-border bg-surface shadow-2xl focus:outline-none">
            {pessoa && (
              <MemberPanel
                key={pessoa.id}
                m={pessoa}
                me={pessoa.id === meId}
                team={comAcesso}
                seats={seats}
                onClose={() => setAberto(null)}
                onAnnounce={setAviso}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </>
  );
}

function Avatar({ m }: { m: TeamMember }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary-hover dark:text-sky-300"
    >
      {initials(m.name)}
      {m.member && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${m.available ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
      )}
    </span>
  );
}

/** A gaveta de uma pessoa: dados, cargo, quadro de permissões, distribuição e carteira. */
function MemberPanel({
  m,
  me,
  team,
  seats,
  onClose,
  onAnnounce,
}: {
  m: TeamMember;
  me: boolean;
  team: TeamMember[];
  seats: Seats;
  onClose: () => void;
  onAnnounce: (s: string) => void;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  const [rights, setRights] = useState<CrmRights>(m.rights);
  const [recebe, setRecebe] = useState(m.receivesLeads);
  const [disponivel, setDisponivel] = useState(m.available);
  const [destino, setDestino] = useState('distribute');
  const cargo = presetOf(rights);
  const mudou =
    JSON.stringify(rights) !== JSON.stringify(m.rights) || recebe !== m.receivesLeads || disponivel !== m.available;

  const salvar = () =>
    start(async () => {
      setErro('');
      const r = await updateMemberAction(m.id, {
        ...(m.locked ? {} : { rights }),
        receivesLeads: recebe,
        available: disponivel,
      });
      if (!r.ok) return setErro(r.message);
      onAnnounce(`Permissões de ${m.name} salvas.`);
      router.refresh();
      onClose();
    });

  const mudarCelula = (entity: 'leads' | 'tasks', action: string, lv: Level) => {
    const novo = structuredClone(rights) as CrmRights & Record<string, Record<string, Level>>;
    (novo[entity] as Record<string, Level>)[action] = lv;
    // "Ver" manda: editar e excluir não passam dele (mesma regra do servidor).
    setRights(readRights(novo, novo));
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <Dialog.Title className="text-base font-semibold">{m.name}</Dialog.Title>
        <Dialog.Description className="sr-only">Cargo e permissões de {m.name} no CRM</Dialog.Description>
        <div className="flex items-center gap-2">
          <Dialog.Close className="btn-ghost btn-sm">Cancelar</Dialog.Close>
          <button type="button" onClick={salvar} disabled={pending || !mudou || !m.member} className="btn-primary btn-sm">
            Salvar
          </button>
          <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </Dialog.Close>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex items-start gap-4 rounded-xl bg-surface-alt/60 p-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary-hover dark:text-sky-300"
          >
            {initials(m.name)}
          </span>
          <dl className="grid flex-1 grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="truncate">{m.email}</dd>
            <dt className="text-muted-foreground">Perfil na clínica</dt>
            <dd>{PERFIL[m.role] ?? m.role}</dd>
            <dt className="text-muted-foreground">Acesso ao CRM</dt>
            <dd>
              {seats && !m.locked ? (
                <CrmSeatToggle userId={m.id} name={m.name} on={m.seat} hint={seats.hint} />
              ) : m.member ? (
                'Liberado'
              ) : (
                'Sem acesso'
              )}
            </dd>
          </dl>
        </div>

        {m.member && (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" role="switch" checked={disponivel} onChange={(e) => setDisponivel(e.target.checked)} className={switchCls} />
                {disponivel ? 'Disponível' : 'Ausente'}
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" role="switch" checked={recebe} onChange={(e) => setRecebe(e.target.checked)} className={switchCls} />
                Recebe leads da distribuição
              </label>
            </div>

            <section aria-labelledby={`${id}-perm`}>
              <h3 id={`${id}-perm`} className="text-sm font-semibold">
                Cargo e permissões
              </h3>
              {m.locked ? (
                <p className="mt-2 flex items-center gap-2 rounded-lg bg-surface-alt/60 p-3 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" aria-hidden="true" /> O proprietário é sempre Gestor, com todas as permissões.
                </p>
              ) : (
                <div role="group" aria-label="Cargo" className="mt-2 flex flex-wrap gap-1">
                  {CRM_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={cargo === r}
                      onClick={() => setRights(ROLE_RIGHTS[r])}
                      className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                        cargo === r ? 'border-primary/60 bg-primary/10 font-medium text-primary' : 'border-border hover:bg-surface-alt'
                      }`}
                    >
                      {r === 'MANAGER' && <Crown className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
                      {CRM_ROLE_INFO[r].label}
                    </button>
                  ))}
                  <span
                    className={`inline-flex items-center rounded-md border border-dashed px-3 py-1.5 text-sm ${
                      cargo === null ? 'border-primary/60 bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground'
                    }`}
                  >
                    Personalizado
                  </span>
                </div>
              )}

              <div className="relative mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[600px] text-sm">
                  <caption className="sr-only">Permissões de {m.name}</caption>
                  <thead className="bg-surface-alt/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="min-w-[9.5rem] px-3 py-2 text-left">
                        <span className="sr-only">O quê</span>
                      </th>
                      {['Criar', 'Ver', 'Editar', 'Excluir', 'Exportar'].map((h) => (
                        <th key={h} scope="col" className="px-2 py-2 text-center">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {RIGHT_CELLS.map((row) => (
                      <tr key={row.entity}>
                        <th scope="row" className="min-w-[9.5rem] px-3 py-2.5 text-left font-medium">
                          {row.label}
                        </th>
                        {['create', 'view', 'edit', 'delete', 'export'].map((col) => {
                          const cell = row.actions.find((a) => a.key === col);
                          if (!cell) return <td key={col} className="px-2 py-2.5 text-center text-muted-foreground">-</td>;
                          const valor = (rights[row.entity] as Record<string, Level>)[col];
                          return (
                            <td key={col} className="px-1 py-2.5 text-center">
                              <select
                                aria-label={`${row.label}: ${cell.label}`}
                                value={valor}
                                disabled={m.locked}
                                onChange={(e) => mudarCelula(row.entity, col, e.target.value as Level)}
                                className={`${selectCls} h-7 w-full min-w-[6.75rem] px-1.5 text-xs ${valor === 'all' ? 'text-emerald-700 dark:text-emerald-400' : valor === 'none' ? 'text-destructive' : ''}`}
                              >
                                {cell.levels.map((lv) => (
                                  <option key={lv} value={lv}>
                                    {LEVEL_LABEL[lv]}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rights.config}
                  disabled={m.locked || me}
                  onChange={(e) => setRights({ ...rights, config: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Configura o CRM (funis, robôs, modelos, WhatsApp, equipe e distribuição)
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                &quot;Se responsável&quot; vale para os negócios e conversas da pessoa e os que ainda estão sem responsável.
                {me ? ' Você não pode tirar de si mesmo a configuração do CRM.' : ''}
              </p>
            </section>

            {m.openLeads + m.awaiting > 0 && team.length > 1 && (
              <section aria-labelledby={`${id}-carteira`} className="rounded-lg border border-border p-4">
                <h3 id={`${id}-carteira`} className="flex items-center gap-2 text-sm font-semibold">
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Passar carteira
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m.openLeads} {m.openLeads === 1 ? 'negócio aberto' : 'negócios abertos'} e as conversas de {m.name.split(' ')[0]} vão para
                  outra pessoa, com as tarefas abertas. Para férias ou saída da equipe.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor={`${id}-destino`} className="sr-only">
                    Passar para
                  </label>
                  <select id={`${id}-destino`} value={destino} onChange={(e) => setDestino(e.target.value)} className={selectCls}>
                    <option value="distribute">A equipe (pela distribuição)</option>
                    {team
                      .filter((p) => p.id !== m.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        setErro('');
                        const r = await transferPortfolioAction(m.id, destino);
                        if (!r.ok) return setErro(r.message);
                        onAnnounce(`Passados ${r.leads} negócios e ${r.conversations} conversas de ${m.name}.`);
                        router.refresh();
                      })
                    }
                    className="btn-outline btn-sm"
                  >
                    Passar
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
      </div>
    </>
  );
}

function RolesLegend() {
  return (
    <section aria-labelledby="cargos-titulo" className={card}>
      <h2 id="cargos-titulo" className="flex items-center gap-2 text-sm font-semibold">
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Os cargos prontos
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
        Mudou alguma permissão do quadro, o cargo vira &quot;Personalizado&quot;. O proprietário é sempre Gestor. O cargo vale só no CRM; fora
        dele continua valendo o perfil da clínica.
      </p>
    </section>
  );
}

/** Configurações › Distribuição de leads. */
export function DistributionSection({
  initial,
  unassigned,
  members,
}: {
  initial: DistributionSettings;
  unassigned: number;
  members: TeamMember[];
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
  const recebem = members.filter((m) => m.member && m.receivesLeads);
  const agora = recebem.filter((m) => !s.onlyAvailable || m.available);

  const salvar = () =>
    start(async () => {
      const r = await saveDistributionAction(s);
      setMsg(r.ok ? { ok: true, text: 'Distribuição salva.' } : { ok: false, text: r.message });
      if (r.ok) router.refresh();
    });

  return (
    <section aria-labelledby={`${id}-titulo`} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 id={`${id}-titulo`} className="flex items-center gap-2 text-base font-semibold">
            <Shuffle className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Distribuição de leads
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Quando um número novo escreve no WhatsApp, ou uma conversa fica sem responsável, o CRM escolhe quem atende. Cliente
            que volta a escrever fica com quem já o atendia.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" role="switch" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className={switchCls} />
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
              <input type="radio" name={`${id}-modo`} checked={s.mode === k} onChange={() => setS({ ...s, mode: k })} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>
                <span className="block text-sm font-semibold">{DISTRIBUTION_MODE_INFO[k].label}</span>
                <span className="block text-xs text-muted-foreground">{DISTRIBUTION_MODE_INFO[k].description}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={s.onlyAvailable} onChange={(e) => setS({ ...s, onlyAvailable: e.target.checked })} className="h-4 w-4 accent-primary" />
          Só para quem está disponível (quem marcou Ausente fica de fora)
        </label>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button type="button" onClick={salvar} disabled={pending || !mudou} className="btn-primary btn-sm">
          Salvar distribuição
        </button>
        <p className="text-xs text-muted-foreground">
          {recebem.length === 0
            ? 'Ninguém está marcado para receber leads (Equipe e permissões).'
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
                setMsg({ ok: r.ok, text: r.ok ? `${r.count} ${r.count === 1 ? 'conversa distribuída' : 'conversas distribuídas'}.` : r.message });
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

