'use client';

import { useCallback, useEffect, useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { ExternalLink, Plus, Stethoscope, X } from 'lucide-react';
import type { ChatThread } from '@/crm/conversations';
import type { LeadDetail } from '@/crm/lead-detail';
import { colorClasses } from '@/crm/colors';
import { initials } from '@/crm/format';
import type { BoardPerson, BoardPipeline, BoardTag, LostReasonOption } from '@/crm/types';
import { LeadPanel } from '../../leads/[id]/_components/lead-panel';
import type { FieldDef } from '@/crm/custom-fields';
import { acceptConversationAction, declineConversationAction, leadDetailAction } from '../actions';

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
 * responsável, campos) ou, sem lead, o contato com "Criar lead". Em tela
 * média para cima é uma coluna; nas menores, abre por cima pelo botão "Lead".
 */
export function ThreadSide({ thread, basics, onChanged }: { thread: ChatThread; basics: LeadSideBasics; onChanged: () => void }) {
  const lead = thread.conversation.lead;
  return lead ? (
    <LeadSide key={lead.id} leadId={lead.id} basics={basics} onChanged={onChanged} />
  ) : (
    <ContactSide key={thread.conversation.id} thread={thread} basics={basics} onChanged={onChanged} />
  );
}

/** O mesmo painel da ficha do lead. */
function LeadSide({ leadId, basics, onChanged }: { leadId: string; basics: LeadSideBasics; onChanged: () => void }) {
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
        <Link href={`/crm/leads/${lead.id}`} className="btn-outline btn-sm inline-flex w-full items-center justify-center gap-1.5">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Abrir a ficha completa
        </Link>
      }
    />
  ) : (
    <p className="p-5 text-sm text-muted-foreground">{erro || 'Carregando o lead…'}</p>
  );
}

const ctl =
  'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Conversa sem lead (Entrada ou paciente sem negócio): quem é e "Criar lead" com funil, etapa e tags. */
function ContactSide({ thread, basics, onChanged }: { thread: ChatThread; basics: LeadSideBasics; onChanged: () => void }) {
  const id = useId();
  const c = thread.conversation;
  const entrada = c.status === 'INBOX';
  const recusada = c.status === 'DECLINED';
  const [nome, setNome] = useState(c.patient?.name ?? c.contactName ?? '');
  const [funilId, setFunilId] = useState(basics.pipelines[0]?.id ?? '');
  const funil = basics.pipelines.find((p) => p.id === funilId);
  const [etapaId, setEtapaId] = useState(funil?.columns[0]?.id ?? '');
  const [tags, setTags] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const criar = () =>
    start(async () => {
      setErro('');
      const r = await acceptConversationAction(c.id, { name: nome, pipelineId: funilId || null, stageId: etapaId || null, tagIds: tags });
      if (!r.ok) return setErro(r.message);
      setAviso(`Lead criado em ${funil?.columns.find((s) => s.id === etapaId)?.name ?? 'Novo'}.`);
      onChanged();
    });
  const recusar = () =>
    start(async () => {
      setErro('');
      const r = await declineConversationAction(c.id);
      if (!r.ok) return setErro(r.message);
      setAviso('Conversa recusada.');
      onChanged();
    });

  return (
    <aside aria-label="Contato da conversa" className="space-y-5 p-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
        >
          {initials(c.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">{c.phoneMasked}</p>
        </div>
      </div>
      {c.patient && (
        <Link href={`/pacientes/${c.patient.id}`} className="btn-outline btn-sm inline-flex w-full items-center justify-center gap-1.5">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" /> Ficha do paciente
        </Link>
      )}

      {recusada ? (
        <p className="rounded-lg bg-surface-alt p-3 text-sm text-muted-foreground">Conversa recusada. Ela não aparece mais na lista.</p>
      ) : (
        <form
          aria-labelledby={`${id}-titulo`}
          className="space-y-3 rounded-xl border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            criar();
          }}
        >
          <h2 id={`${id}-titulo`} className="text-sm font-semibold">
            {entrada ? 'Criar lead' : 'Criar negócio'}
          </h2>
          <div>
            <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">
              Nome
            </label>
            <input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className={ctl} placeholder="Contato do WhatsApp" />
          </div>
          {basics.pipelines.length > 1 && (
            <div>
              <label htmlFor={`${id}-funil`} className="block text-xs font-medium text-muted-foreground">
                Funil
              </label>
              <select
                id={`${id}-funil`}
                value={funilId}
                onChange={(e) => {
                  setFunilId(e.target.value);
                  setEtapaId(basics.pipelines.find((p) => p.id === e.target.value)?.columns[0]?.id ?? '');
                }}
                className={ctl}
              >
                {basics.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor={`${id}-etapa`} className="block text-xs font-medium text-muted-foreground">
              Etapa
            </label>
            <select id={`${id}-etapa`} value={etapaId} onChange={(e) => setEtapaId(e.target.value)} className={ctl}>
              {funil?.columns.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {basics.tags.length > 0 && (
            <fieldset>
              <legend className="text-xs font-medium text-muted-foreground">Tags</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {basics.tags.map((t) => {
                  const on = tags.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setTags(on ? tags.filter((x) => x !== t.id) : [...tags, t.id])}
                      className={`rounded-[4px] px-2 py-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? colorClasses(t.color).chip : 'border border-border text-muted-foreground hover:text-foreground'}`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <button type="submit" disabled={pending || !etapaId} className="btn-primary btn-sm inline-flex w-full items-center justify-center gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {entrada ? 'Criar lead' : 'Criar negócio'}
          </button>
          {entrada && (
            <button type="button" disabled={pending} onClick={recusar} className="btn-ghost btn-sm inline-flex w-full items-center justify-center gap-1.5">
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Recusar
            </button>
          )}
          {erro && (
            <p role="alert" className="text-xs text-destructive">
              {erro}
            </p>
          )}
        </form>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </aside>
  );
}
