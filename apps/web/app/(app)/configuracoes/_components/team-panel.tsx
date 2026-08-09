'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTeamMemberActive, updateTeamRole, type TeamMember } from '../actions';
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

export function TeamPanel({ team }: { team: TeamMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

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

      {/* Aviso honesto: o convite ainda não existe, e a pessoa precisa saber
          disso antes de procurar o botão. */}
      <section
        aria-labelledby="convite-heading"
        className="rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40"
      >
        <h2 id="convite-heading" className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Convidar alguém ainda não está disponível
        </h2>
        <p className="mt-1.5 text-sm text-amber-900/90 dark:text-amber-200/90">
          Hoje, quem se cadastra pelo site cria uma clínica nova em vez de entrar na sua. Para uma
          segunda pessoa entrar nesta clínica, o cadastro precisa ser feito por nós. Os perfis
          acima já funcionam — falta só o caminho de entrada.
        </p>
      </section>
    </div>
  );
}
