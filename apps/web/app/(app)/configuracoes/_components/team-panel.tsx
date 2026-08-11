'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  inviteTeamMember,
  removeTeamMember,
  revokeInvite,
  updateTeamRole,
  type PendingInvite,
  type TeamMember,
} from '../actions';
import { consequenciasDaRemocao } from '@/lib/team';
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
    descricao: 'Atende, agenda e cobra. Não mexe em equipe, plano nem privacidade.',
  },
  {
    value: 'PROFESSIONAL',
    label: 'Profissional',
    descricao: 'Atende, agenda e cobra. Não mexe em equipe, plano nem privacidade.',
  },
];

const LABEL: Record<string, string> = Object.fromEntries(PAPEIS.map((p) => [p.value, p.label]));

const OPCOES_PAPEL = PAPEIS.map((p) => ({ value: p.value, label: p.label, hint: p.descricao }));

type Filtro = 'ativos' | 'pendentes' | 'removidos';

const data = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR');

/** Iniciais no lugar de foto — a clínica não sobe avatar, e um círculo vazio
 *  fica pior do que duas letras. */
function Avatar({ name, apagado }: { name: string; apagado?: boolean }) {
  const iniciais = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        apagado ? 'bg-surface-alt text-muted-foreground' : 'bg-primary/10 text-primary'
      }`}
    >
      {iniciais || '?'}
    </span>
  );
}

function Etiqueta({ tom, children }: { tom: 'ativo' | 'pendente' | 'removido'; children: React.ReactNode }) {
  const cls = {
    ativo: 'bg-success/10 text-success',
    pendente: 'bg-warning/15 text-foreground',
    removido: 'bg-surface-alt text-muted-foreground',
  }[tom];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function TeamPanel({ team, invites }: { team: TeamMember[]; invites: PendingInvite[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const [removendo, setRemovendo] = useState<TeamMember | null>(null);
  // O perfil do convite virou estado porque o SelectField nao e um <select>
  // nativo e portanto nao entra sozinho no FormData.
  const [papelConvite, setPapelConvite] = useState<string>('RECEPTIONIST');
  const [emailConvite, setEmailConvite] = useState('');

  const ativos = useMemo(() => team.filter((m) => m.active), [team]);
  const removidos = useMemo(() => team.filter((m) => !m.active), [team]);

  /** Já trabalhou aqui e saiu — o formulário avisa antes de mandar o convite. */
  const removidoComEsteEmail = useMemo(() => {
    const alvo = emailConvite.trim().toLowerCase();
    if (!alvo) return null;
    return removidos.find((m) => m.email.toLowerCase() === alvo) ?? null;
  }, [emailConvite, removidos]);

  function trocarPapel(id: string, role: string) {
    setErro(null);
    startTransition(async () => {
      const r = await updateTeamRole(id, role);
      if (!r.ok) setErro(r.message ?? 'Não foi possível alterar o perfil.');
      else router.refresh();
    });
  }

  function confirmarRemocao(motivo: string) {
    if (!removendo) return;
    setErro(null);
    const nome = removendo.name;
    startTransition(async () => {
      const r = await removeTeamMember({ targetUserId: removendo.id, reason: motivo || undefined });
      if (!r.ok) {
        setErro(r.message ?? 'Não foi possível remover.');
        return;
      }
      setRemovendo(null);
      setAviso(`${nome} não tem mais acesso.`);
      router.refresh();
    });
  }

  function convidar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = emailConvite.trim();
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const r = await inviteTeamMember({ email, role: papelConvite });
      if (!r.ok) setErro(r.message ?? 'Não foi possível convidar.');
      else {
        setAviso(`Convite enviado para ${email}. Ele vale por alguns dias.`);
        setEmailConvite('');
        form.reset();
        router.refresh();
      }
    });
  }

  function reenviar(c: PendingInvite) {
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const r = await inviteTeamMember({ email: c.email, role: c.role });
      if (!r.ok) setErro(r.message ?? 'Não foi possível reenviar.');
      else {
        setAviso(`Convite reenviado para ${c.email}. O link anterior deixou de valer.`);
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

  const abas: { id: Filtro; label: string; contagem: number }[] = [
    { id: 'ativos', label: 'Ativos', contagem: ativos.length },
    { id: 'pendentes', label: 'Convites pendentes', contagem: invites.length },
    { id: 'removidos', label: 'Removidos', contagem: removidos.length },
  ];

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
            O perfil decide o que cada pessoa pode administrar. Quem atende trabalha com a clínica
            inteira; equipe, plano e privacidade ficam com quem responde por ela.
          </p>
        </div>

        {(erro || aviso) && (
          <div className="px-5 pt-4">
            {erro && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}
            {aviso && !erro && (
              <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                {aviso}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-1 border-b border-border px-5 pt-4">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setFiltro(a.id)}
              aria-pressed={filtro === a.id}
              className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                filtro === a.id
                  ? 'border-b-2 border-primary text-foreground'
                  : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {a.label}
              <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">{a.contagem}</span>
            </button>
          ))}
        </div>

        {filtro === 'ativos' && (
          <ul className="divide-y divide-border">
            {ativos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-alt/40">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{m.name}</span>
                    {m.isSelf && <Etiqueta tom="ativo">você</Etiqueta>}
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
                    onClick={() => {
                      setErro(null);
                      setRemovendo(m);
                    }}
                    className="h-9 shrink-0 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {filtro === 'pendentes' && (
          <ul className="divide-y divide-border">
            {invites.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                Nenhum convite aguardando resposta.
              </li>
            )}
            {invites.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="truncate">{c.email}</span>
                    <Etiqueta tom="pendente">convite pendente</Etiqueta>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {LABEL[c.role] ?? c.role} · enviado em {data(c.createdAt)}
                  </p>
                  {c.bloqueio && (
                    <p className="mt-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs leading-snug text-foreground">
                      <strong className="font-medium">Este convite não vai ser aceito.</strong>{' '}
                      {c.bloqueio}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => reenviar(c)}
                    className="rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    Reenviar
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => cancelarConvite(c.id)}
                    className="rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    Revogar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {filtro === 'removidos' && (
          <ul className="divide-y divide-border">
            {removidos.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                Ninguém foi removido desta clínica.
              </li>
            )}
            {removidos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 opacity-75">
                <Avatar name={m.name} apagado />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{m.name}</span>
                    <Etiqueta tom="removido">removido</Etiqueta>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email}
                    {m.deactivatedAt && <> · saiu em {data(m.deactivatedAt)}</>}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  Convide o mesmo e-mail abaixo para trazer de volta
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border bg-surface-alt/30 px-5 py-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            O que cada perfil alcança
          </h3>
          <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {PAPEIS.map((p) => (
              <div key={p.value} className="rounded-lg border border-border bg-background p-3">
                <dt className="text-sm font-medium">{LABEL[p.value]}</dt>
                <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">{p.descricao}</dd>
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
              value={emailConvite}
              onChange={(e) => setEmailConvite(e.target.value)}
              aria-describedby={removidoComEsteEmail ? 'convite-retorno' : undefined}
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

        {removidoComEsteEmail && (
          <p
            id="convite-retorno"
            className="mx-5 mb-4 rounded-md border border-border bg-surface-alt px-3 py-2.5 text-sm leading-relaxed"
          >
            Este e-mail já fez parte da equipe
            {removidoComEsteEmail.deactivatedAt && <> (removido em {data(removidoComEsteEmail.deactivatedAt)})</>}.
            O histórico anterior será mantido, e um novo acesso será criado quando a pessoa aceitar.
          </p>
        )}
      </section>

      {removendo && (
        <DialogoRemocao
          membro={removendo}
          convitesPendentes={
            invites.filter((c) => c.email.toLowerCase() === removendo.email.toLowerCase()).length
          }
          erro={erro}
          pendente={pending}
          onCancelar={() => {
            setRemovendo(null);
            setErro(null);
          }}
          onConfirmar={confirmarRemocao}
        />
      )}
    </div>
  );
}

/**
 * Confirmação de remoção.
 *
 * Escrito à mão, como os outros modais do projeto — não vale trazer uma
 * dependência para uma caixa com dois botões. O que ela precisa fazer direito é
 * o teclado: foco entra no diálogo, Esc fecha, Tab circula dentro, e ao fechar o
 * foco volta para quem abriu.
 *
 * O texto não pergunta "tem certeza?" — lista o que vai acontecer de verdade.
 */
function DialogoRemocao({
  membro,
  convitesPendentes,
  erro,
  pendente,
  onCancelar,
  onConfirmar,
}: {
  membro: TeamMember;
  convitesPendentes: number;
  erro: string | null;
  pendente: boolean;
  onCancelar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const caixaRef = useRef<HTMLDivElement>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const abriuCom = useRef<HTMLElement | null>(null);

  const frases = consequenciasDaRemocao({
    nome: membro.name,
    convitesPendentes,
    ehAdministrador: membro.role === 'OWNER' || membro.role === 'ADMIN',
  });

  useEffect(() => {
    abriuCom.current = document.activeElement as HTMLElement | null;
    // O foco começa em "Manter" e não em "Remover": a ação destrutiva não pode
    // estar a um Enter distante de quem abriu a caixa sem querer.
    cancelarRef.current?.focus();

    function fora(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) onCancelar();
    }

    // Teclado ouvido no documento, não no elemento: além de satisfazer a regra
    // de acessibilidade (um `alertdialog` não é elemento interativo), o Esc
    // continua funcionando se o foco escapar da caixa por qualquer motivo.
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelar();
        return;
      }
      if (e.key !== 'Tab') return;
      const focaveis = caixaRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea, [href]',
      );
      if (!focaveis || focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
      abriuCom.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monta uma vez; onCancelar é estável no uso
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Só escurece o fundo. O clique fora é ouvido no documento, como no
          SelectField e no menu de usuário — pendurar onClick num div não
          interativo é o que a regra de acessibilidade reclama, com razão. */}
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        ref={caixaRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remover-titulo"
        aria-describedby="remover-descricao"
        className="relative w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl animate-fade-in"
      >
        <h2 id="remover-titulo" className="text-lg font-semibold">
          Remover {membro.name} da equipe?
        </h2>

        <ul id="remover-descricao" className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
          {frases.map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>

        <div className="mt-4 space-y-1.5">
          <label htmlFor="remover-motivo" className="block text-sm font-medium">
            Motivo <span className="font-normal text-muted-foreground">(opcional, fica no histórico)</span>
          </label>
          <input
            id="remover-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={200}
            placeholder="Ex.: saiu da clínica em agosto"
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>

        {erro && (
          <p role="alert" className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancelarRef} type="button" onClick={onCancelar} disabled={pendente} className="btn-outline btn-md">
            Manter na equipe
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={() => onConfirmar(motivo)}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {pendente ? 'Removendo…' : 'Remover acesso'}
          </button>
        </div>
      </div>
    </div>
  );
}
