'use client';

import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { DoorClosed } from 'lucide-react';
import { CreateClinicForm } from './create-clinic-form';

/**
 * Fim de linha para quem foi removido de uma clínica.
 *
 * O caminho anterior era um loop de redirecionamento que o navegador cortava
 * com ERR_TOO_MANY_REDIRECTS. Uma tela que diz o que aconteceu, de qual clínica
 * e quando, é o mínimo — a pessoa quase sempre vai perguntar isso para alguém, e
 * é melhor que ela já saiba a resposta.
 */
export function AcessoEncerrado({ clinica, em }: { clinica: string; em: Date | string | null }) {
  const { signOut } = useClerk();
  const [abrindoPropria, setAbrindoPropria] = useState(false);

  if (abrindoPropria) return <CreateClinicForm />;

  const data = em ? new Date(em).toLocaleDateString('pt-BR') : null;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-alt">
        <DoorClosed className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </div>

      <h1 className="mt-4 text-lg font-semibold">Seu acesso foi encerrado</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        A clínica <strong className="text-foreground">{clinica}</strong> encerrou o seu acesso
        {data && <> em {data}</>}. Quem administra a clínica pode convidar você de novo pelo mesmo
        e-mail quando quiser — o que você registrou lá continua guardado.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: '/sign-in' })}
          className="btn-primary btn-md"
        >
          Sair
        </button>
        <button
          type="button"
          onClick={() => setAbrindoPropria(true)}
          className="btn-outline btn-md"
        >
          Abrir a minha própria clínica
        </button>
      </div>
    </div>
  );
}
