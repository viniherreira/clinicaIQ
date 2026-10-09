'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Check, Trash2, X } from 'lucide-react';
import type { BoardLead, BoardStage, LostReasonOption } from '@/crm/types';
import { deleteLeadAction, moveLeadAction } from '../actions';
import { Column } from './column';
import { LeadCard, type MoveTarget } from './lead-card';
import { LostReasonModal } from './lost-reason-modal';
import { boardKeyboardCoordinates } from './keyboard-coordinates';

/**
 * O quadro do funil.
 *
 * Mover tem três caminhos que dão no mesmo lugar: arrastar com o mouse,
 * arrastar pelo teclado (alça do card) e o menu "Mover para…". Os três passam
 * por `move`, que atualiza a tela na hora e confirma no servidor; se o
 * servidor recusar, a tela volta como estava e o motivo é anunciado.
 */
export function Board({
  stages,
  leads: initial,
  closedStages,
  lostReasons,
  canDelete,
}: {
  stages: BoardStage[];
  leads: BoardLead[];
  closedStages: { won: string; lost: string };
  lostReasons: LostReasonOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [leads, setLeads] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [perder, setPerder] = useState<BoardLead | null>(null);
  const [aviso, setAviso] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => setLeads(initial), [initial]);

  // O card já mudou de lugar na tela antes de o servidor confirmar. Sair da
  // página nesse meio-tempo cancelaria o envio — o navegador avisa antes.
  useEffect(() => {
    if (!pending) return;
    const segurar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', segurar);
    return () => window.removeEventListener('beforeunload', segurar);
  }, [pending]);

  const porEtapa = useMemo(() => {
    const m = new Map<string, BoardLead[]>(stages.map((s) => [s.id, []]));
    for (const l of leads) m.get(l.stageId)?.push(l);
    return m;
  }, [leads, stages]);

  const nomeEtapa = (id: string) => stages.find((s) => s.id === id)?.name ?? '';
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );

  function anunciar(msg: string) {
    setAviso('');
    setTimeout(() => setAviso(msg), 30);
  }

  function enviar(lead: BoardLead, stageId: string, index: number | undefined, lostReasonId?: string) {
    const antes = leads;
    const sai = stageId === closedStages.won || stageId === closedStages.lost;
    setLeads((ls) => {
      const sem = ls.filter((l) => l.id !== lead.id);
      if (sai) return sem;
      const coluna = sem.filter((l) => l.stageId === stageId);
      const alvo = coluna[Math.min(index ?? 0, coluna.length)];
      const novo = { ...lead, stageId };
      if (!alvo) return [...sem, novo];
      const i = sem.indexOf(alvo);
      return [...sem.slice(0, i), novo, ...sem.slice(i)];
    });
    start(async () => {
      const r = await moveLeadAction({ leadId: lead.id, stageId, index, lostReasonId });
      if (!r.ok) {
        setLeads(antes);
        anunciar(`Não foi possível mover ${lead.name}. ${r.message}`);
        return;
      }
      anunciar(
        stageId === closedStages.won
          ? `${lead.name} marcado como ganho.`
          : stageId === closedStages.lost
            ? `${lead.name} marcado como perdido.`
            : `${lead.name} movido para ${nomeEtapa(stageId)}.`,
      );
      router.refresh();
    });
  }

  function move(lead: BoardLead, target: MoveTarget, index?: number) {
    if (target.kind === 'lost') return setPerder(lead);
    if (target.kind === 'won') return enviar(lead, closedStages.won, undefined);
    if (target.kind === 'delete') {
      if (!confirm(`Excluir o lead ${lead.name}? Ele some do funil.`)) return;
      const antes = leads;
      setLeads((ls) => ls.filter((l) => l.id !== lead.id));
      start(async () => {
        const r = await deleteLeadAction(lead.id);
        if (!r.ok) {
          setLeads(antes);
          anunciar(r.message);
        } else {
          anunciar(`${lead.name} excluído.`);
          router.refresh();
        }
      });
      return;
    }
    if (target.stageId === lead.stageId && index === undefined) return;
    enviar(lead, target.stageId, index);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const lead = e.active.data.current?.lead as BoardLead | undefined;
    const over = e.over;
    if (!lead || !over) return;
    const id = String(over.id);
    if (id === 'drop:won') return move(lead, { kind: 'won' });
    if (id === 'drop:lost') return move(lead, { kind: 'lost' });
    if (id === 'drop:delete') return move(lead, { kind: 'delete' });

    const stageId = over.data.current?.stageId as string | undefined;
    if (!stageId) return;
    const coluna = (porEtapa.get(stageId) ?? []).filter((l) => l.id !== lead.id);
    const sobre = over.data.current?.leadId as string | undefined;
    const index = sobre ? Math.max(0, coluna.findIndex((l) => l.id === sobre)) : coluna.length;
    if (stageId === lead.stageId && sobre === lead.id) return;
    move(lead, { kind: 'stage', stageId }, index);
  }

  const ativo = activeId ? leads.find((l) => l.id === activeId) ?? null : null;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Pegou ${nomeDe(active.data.current)}. Use as setas para escolher a etapa e Espaço para soltar.`,
    onDragOver: ({ active, over }) =>
      over ? `${nomeDe(active.data.current)} sobre ${destino(over.id, over.data.current)}.` : `${nomeDe(active.data.current)} fora do funil.`,
    onDragEnd: ({ active, over }) =>
      over ? `${nomeDe(active.data.current)} solto em ${destino(over.id, over.data.current)}.` : 'Movimento cancelado.',
    onDragCancel: ({ active }) => `Movimento de ${nomeDe(active.data.current)} cancelado.`,
  };
  function destino(id: string | number, data: Record<string, unknown> | undefined) {
    const s = String(id);
    if (s === 'drop:won') return 'Ganho';
    if (s === 'drop:lost') return 'Perdido';
    if (s === 'drop:delete') return 'Excluir';
    return nomeEtapa(String(data?.stageId ?? ''));
  }

  return (
    <>
      <DndContext
        // Id fixo: sem ele o dnd-kit numera os textos de acessibilidade num
        // contador que dá um número no servidor e outro no navegador.
        id="crm-funil"
        sensors={sensors}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Para mover o lead, pressione Espaço ou Enter. Setas para a esquerda e a direita trocam de etapa; para cima e para baixo mudam a posição. Espaço ou Enter solta, Esc cancela.',
          },
        }}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 sm:px-6" role="list" aria-label="Etapas do funil">
          {stages.map((s) => (
            <div role="listitem" key={s.id} className="flex">
              <Column
                stage={s}
                leads={porEtapa.get(s.id) ?? []}
                stages={stages}
                canDelete={canDelete}
                activeId={activeId}
                onMove={move}
                onAnnounce={anunciar}
              />
            </div>
          ))}
        </div>

        {ativo && <DropBar canDelete={canDelete} />}

        <DragOverlay dropAnimation={null}>
          {ativo ? (
            <div className="w-72">
              <LeadCard lead={ativo} stages={stages} canDelete={false} onMove={() => {}} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <LostReasonModal
        open={Boolean(perder)}
        leadName={perder?.name ?? ''}
        reasons={lostReasons}
        pending={pending}
        onCancel={() => setPerder(null)}
        onConfirm={(reasonId) => {
          const lead = perder!;
          setPerder(null);
          enviar(lead, closedStages.lost, undefined, reasonId);
        }}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </>
  );
}

function nomeDe(data: Record<string, unknown> | undefined) {
  return (data?.lead as BoardLead | undefined)?.name ?? 'lead';
}

/** A barra que aparece no rodapé enquanto um card está sendo arrastado. */
function DropBar({ canDelete }: { canDelete: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div className="pointer-events-auto grid w-full max-w-3xl gap-2" style={{ gridTemplateColumns: `repeat(${canDelete ? 3 : 2}, minmax(0, 1fr))` }}>
        <DropZone id="drop:won" label="Ganho" icon={<Check className="h-4 w-4" aria-hidden="true" />} tone="border-green-500 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/60" />
        <DropZone id="drop:lost" label="Perdido" icon={<X className="h-4 w-4" aria-hidden="true" />} tone="border-red-500 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60" />
        {canDelete && (
          <DropZone id="drop:delete" label="Excluir" icon={<Trash2 className="h-4 w-4" aria-hidden="true" />} tone="border-border text-muted-foreground bg-surface" />
        )}
      </div>
    </div>
  );
}

function DropZone({ id, label, icon, tone }: { id: string; label: string; icon: React.ReactNode; tone: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-medium shadow-lg transition-transform ${tone} ${isOver ? 'scale-[1.03] border-solid' : ''}`}
    >
      {icon}
      Solte aqui: {label}
    </div>
  );
}
