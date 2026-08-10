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

export function TeamPanel({ team, invites }: { team: TeamMember[]; invites: PendingInvite[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [convidado, setConvidado] = useState<string | null>(null);

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
      const r = await inviteTeamMember({ email, role: String(dados.get('role') ?? '') });
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
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name}
                  {m.isSelf && (
                    <span className="ml-2 rounded bg-surface-alt px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                      você
                    </span>
                  )}
                  {!m.active && (
                    <span className="ml-2 rounded bg-surface-alt px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                      sem acesso
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor={`papel-${m.id}`} className="sr-only">
                  Perfil de {m.name}
                </label>
                <select
                  id={`papel-${m.id}`}
                  value={m.role}
                  disabled={m.isSelf || pending}
                  onChange={(e) => trocarPapel(m.id, e.target.value)}
                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  {PAPEIS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={m.isSelf || pending}
                  onClick={() => alternarAcesso(m)}
                  className="rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  {m.active ? 'Remover acesso' : 'Devolver acesso'}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-border px-5 py-4">
          <h3 className="text-sm font-medium">O que cada perfil alcança</h3>
          <dl className="mt-2 space-y-1.5">
            {PAPEIS.map((p) => (
              <div key={p.value} className="flex flex-wrap gap-x-2 text-xs">
                <dt className="font-medium">{LABEL[p.value]}:</dt>
                <dd className="text-muted-foreground">{p.descricao}</dd>
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
            A pessoa recebe um e-mail com o convite e <strong>escolhe a própria senha</strong> no
            cadastro. Você nunca vê a senha dela.
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
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="convite-papel" className="block text-sm font-medium">
              Perfil
            </label>
            <select
              id="convite-papel"
              name="role"
              defaultValue="RECEPTIONIST"
              className="h-10 rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {PAPEIS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pending} className="btn-primary btn-md">
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
