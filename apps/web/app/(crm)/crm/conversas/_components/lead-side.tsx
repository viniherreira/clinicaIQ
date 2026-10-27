'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Archive, Ban, ExternalLink, Plus, Stethoscope } from 'lucide-react';
import type { ChatThread } from '@/crm/conversations';
import type { LeadDetail } from '@/crm/lead-detail';
import { initials } from '@/crm/format';
import type { BoardPerson, BoardPipeline, BoardTag, LostReasonOption } from '@/crm/types';
import { LeadPanel } from '../../leads/[id]/_components/lead-panel';
import { ConvertActions } from '../../leads/[id]/_components/convert-actions';
import type { FieldDef } from '@/crm/custom-fields';
import { acceptConversationAction, declineConversationAction, leadDetailAction, notALeadAction } from '../actions';

export interface LeadSideBasics {
  pipelines: BoardPipeline[];
  tags: BoardTag[];
  team: BoardPerson[];
  procedures: { id: string; name: string }[];
  lostReasons: LostReasonOption[];
  fields?: FieldDef[];
}

/**
 * O que fica ao lado da conversa, como no Kommo: o lead (etapa, tags,
 * responsável, campos) ou, sem lead, o contato com "Abrir negócio". Em tela
 * média para cima é uma coluna; nas menores, abre por cima pelo botão "Lead".
 */
export function ThreadSide({ thread, basics, onChanged }: { thread: ChatThread; basics: LeadSideBasics; onChanged: () => void }) {
  const lead = thread.conversation.lead;
  return lead ? (
    <LeadSide key={lead.id} leadId={lead.id} conversationId={thread.conversation.id} basics={basics} onChanged={onChanged} />
  ) : (
    <ContactSide key={thread.conversation.id} thread={thread} onChanged={onChanged} />
  );
}

/** O mesmo painel da ficha do lead. */
function LeadSide({
  leadId,
  conversationId,
  basics,
  onChanged,
}: {
  leadId: string;
  conversationId: string;
  basics: LeadSideBasics;
  onChanged: () => void;
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const r = await leadDetailAction(leadId);
    if (!r.ok) return setErro(r.message);
    setErro('');
    setLead(r.lead);
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return lead ? (
    <LeadPanel
      lead={lead}
      pipelines={basics.pipelines}
      allTags={basics.tags}
      team={basics.team}
      procedures={basics.procedures}
      lostReasons={basics.lostReasons}
      fields={basics.fields}
      onSaved={() => {
        void carregar();
        onChanged();
      }}
      actions={
        // Agendar daqui leva o telefone do WhatsApp para a ficha: sem digitar, sem número trocado.
        <div className="space-y-2">
          <ConvertActions leadId={lead.id} patient={lead.patient} />
          <Link href={`/crm/leads/${lead.id}`} className="btn-outline btn-sm inline-flex w-full items-center justify-center gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Abrir a ficha completa
          </Link>
          {!lead.wonAt && !lead.lostAt && <NotALead conversationId={conversationId} onDone={onChanged} />}
        </div>
      }
    />
  ) : (
    <p className="p-5 text-sm text-muted-foreground">{erro || 'Carregando o lead…'}</p>
  );
}

/**
 * Spam, fornecedor, número errado: o card criado sozinho sai do funil e a
 * conversa é arquivada. Pede confirmação: some com as anotações do card.
 */
function NotALead({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="btn-ghost btn-sm inline-flex w-full items-center justify-center gap-1.5 text-muted-foreground">
        <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Não é lead
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label="Não é lead" className="space-y-2 rounded-lg border border-border bg-surface-alt p-3 text-sm">
      <p>O card sai do funil e a conversa é arquivada. Se a pessoa escrever de novo, a conversa volta, sem card.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await notALeadAction(conversationId);
              if (!r.ok) return setErro(r.message);
              onDone();
            })
          }
          className="btn-primary btn-sm"
        >
          {pending ? 'Arquivando…' : 'Arquivar'}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirmando(false)} className="btn-ghost btn-sm">
          Voltar
        </button>
      </div>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

/**
 * Conversa sem negócio aberto: quem é, e um clique para abrir o negócio — sem
 * formulário. Paciente da clínica não vira lead sozinho (a conversa fica na
 * ficha dele); "Abrir negócio" é para quando ele quer um tratamento novo.
 */
function ContactSide({ thread, onChanged }: { thread: ChatThread; onChanged: () => void }) {
  const c = thread.conversation;
  const arquivada = c.status === 'DECLINED';
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const rodar = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) =>
    start(async () => {
      setErro('');
      const r = await fn();
      if (!r.ok) return setErro(r.message ?? 'Não foi possível.');
      setAviso(ok);
      onChanged();
    });

  return (
    <aside aria-label="Contato da conversa" className="space-y-5 p-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary-hover dark:text-sky-300"
        >
          {initials(c.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">{c.phoneMasked}</p>
        </div>
      </div>

      {arquivada ? (
        <p className="rounded-lg bg-surface-alt p-3 text-sm text-muted-foreground">
          Conversa arquivada. Se a pessoa escrever de novo, ela volta para a lista.
        </p>
      ) : (
        <div className="space-y-2 rounded-xl border border-border p-4">
          <p className="text-sm">
            {c.patient ? (
              <>
                <strong className="font-semibold">Paciente da clínica.</strong> A conversa fica ligada à ficha dele, fora do funil.
              </>
            ) : (
              'Sem negócio aberto com este contato.'
            )}
          </p>
          {c.patient && (
            <Link href={`/pacientes/${c.patient.id}`} className="btn-outline btn-sm inline-flex w-full items-center justify-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" /> Ficha do paciente
            </Link>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => rodar(() => acceptConversationAction(c.id), 'Negócio aberto em Novo.')}
            className={`${c.patient ? 'btn-ghost' : 'btn-primary'} btn-sm inline-flex w-full items-center justify-center gap-1.5`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {c.patient ? 'Abrir negócio (tratamento novo)' : 'Abrir negócio'}
          </button>
          {!c.patient && (
            <button
              type="button"
              disabled={pending}
              onClick={() => rodar(() => declineConversationAction(c.id), 'Conversa arquivada.')}
              className="btn-ghost btn-sm inline-flex w-full items-center justify-center gap-1.5"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Arquivar conversa
            </button>
          )}
          {erro && (
            <p role="alert" className="text-xs text-destructive">
              {erro}
            </p>
          )}
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </aside>
  );
}
