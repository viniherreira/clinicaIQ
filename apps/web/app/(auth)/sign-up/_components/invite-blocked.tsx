'use client';

import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { UserRoundX } from 'lucide-react';

/**
 * O convite chegou, mas já tem alguém conectado neste navegador.
 *
 * O Clerk trabalha com uma conta por navegador (single session). Quem clica no
 * link do convite já logado é mandado direto para a conta que já estava aberta —
 * o convite não é consumido e fica "aguardando resposta" para sempre, sem
 * ninguém entender por quê. Acontece muito com quem manda o convite e clica no
 * link para "conferir se chegou".
 *
 * Em vez de deixar isso silencioso, dizemos o que houve e saímos da conta atual
 * de volta para o mesmo link, com o convite ainda na mão.
 */
export function InviteBlocked({ ticket, quem }: { ticket: string; quem: string }) {
  const { signOut } = useClerk();
  const [saindo, setSaindo] = useState(false);

  const linkDoConvite = `/sign-up?__clerk_ticket=${encodeURIComponent(ticket)}`;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-warning/15">
        <UserRoundX className="h-5 w-5 text-foreground" aria-hidden="true" />
      </div>

      <h1 className="mt-4 text-lg font-semibold">Este convite é de outra pessoa</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Neste navegador já tem uma conta conectada: <strong className="text-foreground">{quem}</strong>.
        Só dá para uma conta por navegador, então o convite não pode ser aceito enquanto ela estiver
        aberta.
      </p>

      <button
        type="button"
        disabled={saindo}
        onClick={() => {
          setSaindo(true);
          signOut({ redirectUrl: linkDoConvite });
        }}
        className="btn-primary btn-md mt-5 w-full"
      >
        {saindo ? 'Saindo…' : 'Sair e aceitar o convite'}
      </button>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Se a conta atual é sua e o convite é de outra pessoa, não saia — peça para ela abrir o
        e-mail no computador dela, ou abra o link numa janela anônima.
      </p>
    </div>
  );
}
