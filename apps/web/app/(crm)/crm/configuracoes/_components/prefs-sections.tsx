'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquareText, Settings2, UserRound } from 'lucide-react';
import type { CrmPrefs } from '@/crm/crm-prefs';
import { LEVEL_LABEL, RIGHT_CELLS, type CrmRights, type Level } from '@/lib/crm-rights';
import { AvailabilityToggle } from '@/components/crm-availability';
import { savePrefsAction } from '../team-actions';

const card = 'rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5';
const switchCls =
  'h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-border transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50';

/** Salvar as preferências, com o aviso de pronto ou de erro. */
function useSalvar(initial: CrmPrefs) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mudou = JSON.stringify(p) !== JSON.stringify(initial);
  const salvar = () =>
    start(async () => {
      const r = await savePrefsAction(p);
      setMsg(r.ok ? { ok: true, text: 'Configurações salvas.' } : { ok: false, text: r.message });
      if (r.ok) router.refresh();
    });
  return { p, setP, pending, msg, mudou, salvar };
}

function Rodape({ s }: { s: ReturnType<typeof useSalvar> }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <button type="button" onClick={s.salvar} disabled={s.pending || !s.mudou} className="btn-primary btn-sm">
        Salvar
      </button>
      {s.msg && (
        <p role={s.msg.ok ? 'status' : 'alert'} className={`text-xs ${s.msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
          {s.msg.text}
        </p>
      )}
    </div>
  );
}

const REUSO = [
  {
    v: false,
    t: 'Abrir um negócio novo',
    d: 'Recomendado. Ganho ou perdido fica no histórico; a nova conversa começa um negócio novo em Novo.',
  },
  {
    v: true,
    t: 'Voltar para o último negócio, mesmo fechado',
    d: 'A conversa entra no último negócio do contato, ganho ou perdido. Para abrir outro, use Abrir negócio.',
  },
];

/** Configurações › Geral: como as conversas novas viram negócio (o "Iniciando conversas" do Kommo). */
export function GeneralSection({ initial }: { initial: CrmPrefs }) {
  const id = useId();
  const s = useSalvar(initial);
  return (
    <section aria-labelledby={`${id}-t`} className={card}>
      <h2 id={`${id}-t`} className="flex items-center gap-2 text-base font-semibold">
        <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Iniciando conversas
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">O que acontece quando alguém manda mensagem para o WhatsApp da clínica.</p>

      <label aria-label="Número novo vira negócio sozinho" className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
        <input
          type="checkbox"
          role="switch"
          checked={s.p.autoLead}
          onChange={(e) => s.setP({ ...s.p, autoLead: e.target.checked })}
          className={`${switchCls} mt-0.5`}
        />
        <span>
          <span className="block text-sm font-semibold">Número novo vira negócio sozinho</span>
          <span className="block text-xs text-muted-foreground">
            O contato entra no funil em Novo, sem ninguém precisar aceitar. Desligado, a conversa fica &quot;sem negócio&quot; até alguém
            clicar em Abrir negócio.
          </span>
        </span>
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">Quem já teve negócio fechado e escreve de novo</legend>
        <div className="mt-2 space-y-2">
          {REUSO.map((o) => (
            <label
              key={String(o.v)}
              aria-label={o.t}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${s.p.reuseClosedLead === o.v ? 'border-primary/60 bg-primary/5' : 'border-border'}`}
            >
              <input
                type="radio"
                name={`${id}-reuso`}
                checked={s.p.reuseClosedLead === o.v}
                onChange={() => s.setP({ ...s.p, reuseClosedLead: o.v })}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">{o.t}</span>
                <span className="block text-xs text-muted-foreground">{o.d}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-xs text-muted-foreground">
        Negócio aberto sempre recebe a conversa do contato. Quem atende cada conversa nova é decidido na{' '}
        <Link href="/crm/configuracoes#distribuicao" className="text-link hover:underline">
          Distribuição de leads
        </Link>
        .
      </p>
      <Rodape s={s} />
    </section>
  );
}

/** Configurações › Conversas: o nome de quem responde (o "Mostrar nome do remetente" do Kommo). */
export function ChatSection({ initial }: { initial: CrmPrefs }) {
  const id = useId();
  const s = useSalvar(initial);
  return (
    <section aria-labelledby={`${id}-t`} className={card}>
      <h2 id={`${id}-t`} className="flex items-center gap-2 text-base font-semibold">
        <MessageSquareText className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Ferramentas de conversa
      </h2>
      <label aria-label="Mostrar o nome de quem responde" className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
        <input
          type="checkbox"
          role="switch"
          checked={s.p.senderName}
          onChange={(e) => s.setP({ ...s.p, senderName: e.target.checked })}
          className={`${switchCls} mt-0.5`}
        />
        <span>
          <span className="block text-sm font-semibold">Mostrar o nome de quem responde</span>
          <span className="block text-xs text-muted-foreground">
            A primeira mensagem de cada pessoa da equipe sai com o nome dela em negrito (*Ana:*). O nome volta depois que o contato
            responde ou quando outra pessoa assume a conversa.
          </span>
        </span>
      </label>
      <Rodape s={s} />
    </section>
  );
}

/** Configurações › Meu perfil: o que a pessoa é no CRM e a chave de disponível. */
export function ProfileSection({
  name,
  email,
  roleLabel,
  cargo,
  rights,
  available,
  receivesLeads,
}: {
  name: string;
  email: string;
  roleLabel: string;
  cargo: string;
  rights: CrmRights;
  available: boolean;
  receivesLeads: boolean;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className={card}>
      <h2 id={`${id}-t`} className="flex items-center gap-2 text-base font-semibold">
        <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Meu perfil
      </h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Nome</dt>
        <dd>{name}</dd>
        <dt className="text-muted-foreground">E-mail</dt>
        <dd className="truncate">{email}</dd>
        <dt className="text-muted-foreground">Perfil na clínica</dt>
        <dd>{roleLabel}</dd>
        <dt className="text-muted-foreground">Cargo no CRM</dt>
        <dd>{cargo}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <AvailabilityToggle initial={available} />
        </dd>
        <dt className="text-muted-foreground">Distribuição</dt>
        <dd>{receivesLeads ? 'Recebe leads novos' : 'Não recebe leads novos'}</dd>
      </dl>
      <h3 className="mt-6 text-sm font-semibold">Suas permissões</h3>
      <ul className="mt-2 text-sm">
        {RIGHT_CELLS.flatMap((row) =>
          row.actions.map((a) => {
            const lv = (rights[row.entity] as Record<string, Level>)[a.key];
            return (
              <li key={`${row.entity}-${a.key}`} className="flex justify-between gap-4 border-b border-border/60 py-1.5">
                <span>
                  {row.label}: {a.label.toLowerCase()}
                </span>
                <span className={lv === 'all' ? 'text-emerald-700 dark:text-emerald-400' : lv === 'none' ? 'text-destructive' : ''}>
                  {LEVEL_LABEL[lv]}
                </span>
              </li>
            );
          }),
        )}
        <li className="flex justify-between gap-4 py-1.5">
          <span>Configurar o CRM</span>
          <span className={rights.config ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}>{rights.config ? 'Permitido' : 'Negado'}</span>
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Nome e e-mail vêm do seu login. Cargo e permissões são definidos por um gestor em Equipe e permissões.
      </p>
    </section>
  );
}
