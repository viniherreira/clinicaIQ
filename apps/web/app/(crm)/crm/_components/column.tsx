'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { formatCents } from '@/crm/format';
import type { BoardLead, BoardStage } from '@/crm/types';
import { createLeadAction } from '../actions';
import { LeadCard, type MoveTarget } from './lead-card';

/**
 * Uma coluna do funil: faixa com a cor da etapa, quantos leads e quanto valem,
 * o "Adicionar rápido" (nome e telefone, Enter salva) e os cards.
 */
export function Column({
  stage,
  leads,
  stages,
  canDelete,
  activeId,
  onMove,
  onAnnounce,
}: {
  stage: BoardStage;
  leads: BoardLead[];
  stages: BoardStage[];
  canDelete: boolean;
  activeId: string | null;
  onMove: (lead: BoardLead, target: MoveTarget) => void;
  onAnnounce: (msg: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage.id}`, data: { stageId: stage.id } });
  const total = leads.reduce((s, l) => s + (l.valueCents ?? 0), 0);
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={[
        'flex w-72 shrink-0 flex-col rounded-xl bg-surface-alt/70 transition-colors',
        isOver ? 'bg-primary/5 ring-2 ring-primary/30' : '',
      ].join(' ')}
    >
      <header className={`rounded-t-xl border-t-[3px] px-3 pb-2 pt-2.5 ${colorClasses(stage.color).stripe}`}>
        <h2 id={headingId} className="flex items-baseline justify-between gap-2 text-sm font-semibold">
          <span className="truncate">{stage.name}</span>
          <span className="text-xs font-normal text-muted-foreground">
            <span className="sr-only">, </span>
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
          </span>
        </h2>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{formatCents(total)}</p>
      </header>

      <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        <QuickAdd stage={stage} onAnnounce={onAnnounce} />
        <ul className="flex flex-col gap-2" aria-label={`Leads em ${stage.name}`}>
          {leads.map((lead) => (
            <li key={lead.id}>
              <LeadCard lead={lead} stages={stages} canDelete={canDelete} onMove={onMove} dragging={activeId === lead.id} />
            </li>
          ))}
        </ul>
        {leads.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Nenhum lead nesta etapa
          </p>
        )}
      </div>
    </section>
  );
}

function QuickAdd({ stage, onAnnounce }: { stage: BoardStage; onAnnounce: (msg: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [fone, setFone] = useState('');
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();
  const nomeRef = useRef<HTMLInputElement>(null);
  const id = useId();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => {
          setAberto(true);
          setTimeout(() => nomeRef.current?.focus(), 0);
        }}
        className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Adicionar rápido<span className="sr-only"> em {stage.name}</span>
      </button>
    );
  }

  const fechar = () => {
    setAberto(false);
    setNome('');
    setFone('');
    setErro('');
  };

  const escFecha = (e: React.KeyboardEvent) => e.key === 'Escape' && fechar();

  return (
    <form
      className="space-y-1.5 rounded-lg border border-border bg-surface p-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createLeadAction({ name: nome, phone: fone, stageId: stage.id });
          if (r.ok) {
            onAnnounce(`${nome.trim()} adicionado em ${stage.name}.`);
            fechar();
          } else if ('duplicate' in r) {
            setErro(`Já existe um lead aberto com esse telefone: ${r.duplicate.name}.`);
          } else {
            setErro(Object.values(r.fieldErrors ?? {}).find(Boolean) || r.message);
          }
        });
      }}
    >
      <label htmlFor={`${id}-nome`} className="sr-only">Nome</label>
      <input ref={nomeRef} id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={escFecha} placeholder="Nome" className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
      <label htmlFor={`${id}-fone`} className="sr-only">Telefone</label>
      <input id={`${id}-fone`} value={fone} onChange={(e) => setFone(e.target.value)} onKeyDown={escFecha} placeholder="Telefone com DDD" inputMode="tel" className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={fechar} className="btn-ghost btn-sm">Cancelar</button>
        <button type="submit" disabled={pending} className="btn-primary btn-sm">{pending ? 'Salvando…' : 'Adicionar'}</button>
      </div>
    </form>
  );
}
