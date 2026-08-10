'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  inviteTeamMember,
  revokeInvite,
  setTeamMemberActive,
  updateTeamRole,
  type PendingInvite,
  type TeamMember,
} from '../actions';
import type { Role } from '@/lib/permissions';
import { SelectField } from '@/components/select-field';

/**
 * Quem tem acesso ao sistema, e até onde.
 *
 * Os profissionais (quem atende) são outra coisa e vivem na seção ao lado: dá
 * para ser profissional da clínica sem ter login, e para ter login sem atender
 * ninguém. Misturar os dois era o que fazia "adicionar profissional" parecer que
 * criava um usuário.
 */

const PAPEIS: { value: Role; label: string; descricao: string }[] = [
  { value: 'OWNER', label: 'Proprietário', descricao: 'Acesso total, incluindo plano e cobrança.' },
  { value: 'ADMIN', label: 'Administrador', descricao: 'Acesso total, incluindo configurações.' },
  {
    value: 'RECEPTIONIST',
    label: 'Recepção',
    descricao: 'Agenda, cadastro e financeiro. Não abre prontuário.',
  },
  {
    value: 'PROFESSIONAL',
    label: 'Profissional',
    descricao: 'Agenda e prontuário. Não vê financeiro nem configurações.',
  },
];

const LABEL: Record<string, string> = Object.fromEntries(PAPEIS.map((p) => [p.value, p.label]));

/** As opções no formato do SelectField, com a descrição virando linha de apoio
 *  dentro da própria lista — assim a explicação de cada perfil aparece na hora
 *  de escolher, não só num quadro separado embaixo. */
const OPCOES_PAPEL = PAPEIS.map((p) => ({ value: p.value, label: p.label, hint: p.descricao }));

/** Iniciais no lugar de foto — a clínica não sobe avatar, e um círculo vazio
 *  fica pior do que duas letras. */
function Avatar({ name }: { name: string }) {
  const iniciais = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
    >
      {iniciais || '?'}
    </span>
  );
}

export function TeamPanel({ team, invites }: { team: TeamMember[]; invites: PendingInvite[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [convidado, setConvidado] = useState<string | null>(null);
  // O perfil do convite virou estado porque o SelectField nao e um <select>
  // nativo e portanto nao entra sozinho no FormData.
  const [papelConvite, setPapelConvite] = useState<string>('RECEPTIONIST');

  function trocarPapel(id: string, role: string) {
    setErro(null);
    startTransition(async () => {
      const r = await updateTeamRole(id, role);
      if (!r.ok) setErro(r.message ?? 'Não foi possível alterar o perfil.');
      else router.refresh();
    });
  }

  function alternarAcesso(m: TeamMember) {
    setErro(null);
    startTransition(async () => {
      const r = await setTeamMemberActive(m.id, !m.active);
      if (!r.ok) setErro(r.message ?? 'Não foi possível alterar o acesso.');
      else router.refresh();
    });
  }

  function convidar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const dados = new FormData(form);
    const email = String(dados.get('email') ?? '');
    setErro(null);
    setConvidado(null);
    startTransition(async () => {
      const r = await inviteTeamMember({ email, role: papelConvite });
      if (!r.ok) setErro(r.message ?? 'Não foi possível convidar.');
      else {
        setConvidado(email);
        form.reset();
        router.refresh();
      }
    });
  }

  function cancelarConvite(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await revokeInvite(id);
      if (!r.ok) setErro(r.message ?? 'Não foi possível cancelar.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="equipe-heading"
        className="rounded-xl border border-border bg-surface shadow-card"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 id="equipe-heading" className="text-base font-semibold">
            Quem tem acesso
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            O perfil decide o que cada pessoa enxerga. Prontuário só aparece para quem precisa
            dele.
          </p>
        </div>

        {erro && (
          <p role="alert" className="mx-5 mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <ul className="divide-y divide-border">
          {team.map((m) => (
            <li
              key={m.id}
              className={`flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-alt/40 ${
                m.active ? '' : 'opacity-60'
              }`}
            >
              <Avatar name={m.name} />

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{m.name}</span>
                  {m.isSelf && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      você
                    </span>
                  )}
                  {!m.active && (
                    <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      sem acesso
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>

              <div className="flex items-center gap-2">
                <SelectField
                  id={`papel-${m.id}`}
                  ariaLabel={`Perfil de ${m.name}`}
                  value={m.role}
                  options={OPCOES_PAPEL}
                  disabled={m.isSelf || pending}
                  onChange={(v) => trocarPapel(m.id, v)}
                  className="w-[10.5rem]"
                />

                <button
                  type="button"
                  disabled={m.isSelf || pending}
                  onClick={() => alternarAcesso(m)}
                  className="h-9 shrink-0 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {m.active ? 'Remover' : 'Devolver'}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-border bg-surface-alt/30 px-5 py-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            O que cada perfil alcança
          </h3>
          <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {PAPEIS.map((p) => (
              <div key={p.value} className="rounded-lg border border-border bg-background p-3">
                <dt className="text-sm font-medium">{LABEL[p.value]}</dt>
                <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {p.descricao}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section
        aria-labelledby="convite-heading"
        className="rounded-xl border border-border bg-surface shadow-card"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 id="convite-heading" className="text-base font-semibold">
            Convidar para a equipe
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A pessoa recebe um e-mail com um link, cria o acesso dela e{' '}
            <strong>define a própria senha</strong> — você nunca vê essa senha. Ela entra direto
            nesta clínica, com o perfil que você escolher aqui.
          </p>
        </div>

        <form onSubmit={convidar} className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="min-w-[16rem] flex-1 space-y-1.5">
            <label htmlFor="convite-email" className="block text-sm font-medium">
              E-mail
            </label>
            <input
              id="convite-email"
              name="email"
              type="email"
              required
              placeholder="recepcao@clinica.com"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm transition-colors hover:border-muted-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </div>
          <div className="space-y-1.5">
            <span id="convite-papel-rotulo" className="block text-sm font-medium">
              Perfil
            </span>
            <SelectField
              id="convite-papel"
              ariaLabel="Perfil de quem está sendo convidado"
              value={papelConvite}
              options={OPCOES_PAPEL}
              onChange={setPapelConvite}
              disabled={pending}
              className="w-[10.5rem]"
            />
          </div>
          <button type="submit" disabled={pending} className="btn-primary btn-md h-9">
            {pending ? 'Enviando…' : 'Enviar convite'}
          </button>
        </form>

        {convidado && (
          <p
            role="status"
            className="mx-5 mb-4 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
          >
            Convite enviado para <strong>{convidado}</strong>. Ele vale por alguns dias — se não
            chegar, peça para conferir a caixa de spam.
          </p>
        )}

        {invites.length > 0 && (
          <div className="border-t border-border">
            <h3 className="px-5 pb-2 pt-4 text-sm font-medium">Convites aguardando resposta</h3>
            <ul className="divide-y divide-border">
              {invites.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{c.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {LABEL[c.role] ?? c.role} · enviado em{' '}
                      {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => cancelarConvite(c.id)}
                    className="rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
