'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Lock, Plus, Trash2 } from 'lucide-react';
import { COLOR_LABEL, colorClasses } from '@/crm/colors';
import { CRM_COLORS } from '@/crm/defaults';
import type { BoardPipeline, BoardStage } from '@/crm/types';
import {
  createStageAction, deletePipelineAction, deleteStageAction, moveStageAction, renamePipelineAction, updateStageAction,
} from '../configuracoes/actions';
import { rememberPipeline } from './pipeline-menu';

type Result = { ok: true } | { ok: false; message: string };

const ROLE_HINT: Record<string, string> = {
  NEW: 'Entrada: todo lead novo começa aqui',
  SCHEDULED: 'A agenda move para cá ao marcar a avaliação',
  CANCELLED: 'A agenda move para cá quando desmarca ou falta',
  ATTENDED: 'A agenda move para cá quando o paciente comparece',
  NEGOTIATION: 'Os orçamentos movem para cá',
  WON: 'Negócio fechado',
  LOST: 'Negócio perdido',
};

/**
 * "Editar funil", como no Kommo: o próprio quadro vira o editor. Renomear e
 * recolorir cada etapa ali mesmo, trocar a ordem com as setas, apagar (dizendo
 * para onde vão os leads) e adicionar no fim. Fechou e Perdeu ficam fixos.
 */
export function PipelineEditor({
  pipeline,
  allStages,
  leadCounts,
  otherPipelines,
  isMain,
}: {
  pipeline: BoardPipeline;
  /** As etapas deste funil, inclusive Fechou e Perdeu. */
  allStages: BoardStage[];
  leadCounts: Record<string, number>;
  otherPipelines: { id: string; name: string }[];
  isMain: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [nomeFunil, setNomeFunil] = useState(pipeline.name);
  const [nova, setNova] = useState({ name: '', color: 'blue' });
  const [apagarFunil, setApagarFunil] = useState(false);
  const [destinoFunil, setDestinoFunil] = useState(otherPipelines[0]?.id ?? '');
  const id = useId();

  const fechadas = allStages.filter((s) => s.role === 'WON' || s.role === 'LOST');

  const agir = (fn: () => Promise<Result>, sucesso: string, depois?: () => void) =>
    start(async () => {
      const r = await fn();
      setAviso(r.ok ? sucesso : r.message);
      if (r.ok) {
        depois?.();
        router.refresh();
      }
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nomeFunil.trim() !== pipeline.name) agir(() => renamePipelineAction(pipeline.id, nomeFunil), 'Nome do funil salvo.');
          }}
        >
          <label htmlFor={`${id}-funil`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Editar funil
          </label>
          <input
            id={`${id}-funil`}
            value={nomeFunil}
            onChange={(e) => setNomeFunil(e.target.value)}
            onBlur={() => {
              if (nomeFunil.trim() && nomeFunil.trim() !== pipeline.name) agir(() => renamePipelineAction(pipeline.id, nomeFunil), 'Nome do funil salvo.');
            }}
            maxLength={40}
            className="h-9 w-56 rounded-md border border-border bg-background px-2.5 text-sm font-semibold uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-ring"
          />
        </form>
        <div className="flex-1" />
        {!isMain && otherPipelines.length > 0 && (
          <button type="button" onClick={() => setApagarFunil((v) => !v)} className="btn-ghost btn-sm inline-flex items-center gap-1.5 text-destructive">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir funil
          </button>
        )}
        <Link
          href={`/crm?funil=${pipeline.id}`}
          onClick={() => rememberPipeline(pipeline.id)}
          className="btn-primary btn-sm inline-flex items-center gap-1.5"
        >
          <Check className="h-4 w-4" aria-hidden="true" /> Concluir
        </Link>
      </div>

      {apagarFunil && (
        <div role="alertdialog" aria-labelledby={`${id}-apagar`} className="flex flex-wrap items-center gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <p id={`${id}-apagar`} className="font-medium">
            Excluir o funil “{pipeline.name}”? Os leads vão para o funil
          </p>
          <label htmlFor={`${id}-destino-funil`} className="sr-only">Funil de destino</label>
          <select
            id={`${id}-destino-funil`}
            value={destinoFunil}
            onChange={(e) => setDestinoFunil(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {otherPipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deletePipelineAction(pipeline.id, destinoFunil);
                if (!r.ok) return setAviso(r.message);
                rememberPipeline(destinoFunil);
                router.push(`/crm?funil=${destinoFunil}`);
              })
            }
            className="btn-sm rounded-md bg-destructive px-3 font-medium text-destructive-foreground"
          >
            Excluir e mover os leads
          </button>
          <button type="button" onClick={() => setApagarFunil(false)} className="btn-ghost btn-sm">Cancelar</button>
        </div>
      )}

      <ol aria-label={`Etapas do funil ${pipeline.name}`} className="flex min-h-0 flex-1 items-start gap-2.5 overflow-x-auto bg-board p-4">
        {pipeline.columns.map((s, i) => (
          <li key={s.id}>
            <StageEditor
              stage={s}
              leads={leadCounts[s.id] ?? 0}
              first={i === 0}
              last={i === pipeline.columns.length - 1}
              targets={pipeline.columns.filter((x) => x.id !== s.id)}
              pending={pending}
              agir={agir}
            />
          </li>
        ))}

        <li>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              agir(() => createStageAction(nova.name, nova.color, pipeline.id), `Etapa ${nova.name.trim()} criada.`, () =>
                setNova({ name: '', color: 'blue' }),
              );
            }}
            className="w-[240px] space-y-2 rounded-md border border-dashed border-border-strong p-3"
          >
            <label htmlFor={`${id}-nova`} className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Adicionar etapa
            </label>
            <input
              id={`${id}-nova`}
              value={nova.name}
              onChange={(e) => setNova({ ...nova, name: e.target.value })}
              maxLength={40}
              placeholder="Nome da etapa"
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            />
            <ColorPicker name={`${id}-nova-cor`} value={nova.color} onChange={(c) => setNova({ ...nova, color: c })} />
            <button type="submit" disabled={pending || !nova.name.trim()} className="btn-primary btn-sm inline-flex w-full items-center justify-center gap-1.5">
              <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar
            </button>
          </form>
        </li>

        {fechadas.map((s) => (
          <li key={s.id}>
            <StageEditor stage={s} leads={leadCounts[s.id] ?? 0} fixed pending={pending} agir={agir} />
          </li>
        ))}
      </ol>

      <p role="status" aria-live="polite" className="sr-only">{aviso}</p>
      {aviso && (
        <p className="border-t border-border bg-surface px-4 py-2 text-sm text-muted-foreground" aria-hidden="true">
          {aviso}
        </p>
      )}
    </div>
  );
}

function StageEditor({
  stage,
  leads,
  first = false,
  last = false,
  fixed = false,
  targets = [],
  pending,
  agir,
}: {
  stage: BoardStage;
  leads: number;
  first?: boolean;
  last?: boolean;
  /** Fechou e Perdeu: só renomear e recolorir. */
  fixed?: boolean;
  targets?: BoardStage[];
  pending: boolean;
  agir: (fn: () => Promise<Result>, sucesso: string, depois?: () => void) => void;
}) {
  const id = useId();
  const [nome, setNome] = useState(stage.name);
  const [apagar, setApagar] = useState(false);
  const [destino, setDestino] = useState(targets[0]?.id ?? '');
  const salvarNome = () => {
    if (nome.trim() && nome.trim() !== stage.name) agir(() => updateStageAction(stage.id, { name: nome }), 'Nome da etapa salvo.');
  };

  return (
    <section aria-labelledby={`${id}-t`} className="w-[240px] rounded-md border border-border bg-surface p-3 shadow-sm">
      <div className={`-mx-3 -mt-3 mb-3 h-1 rounded-t-md ${colorClasses(stage.color).dot}`} aria-hidden="true" />
      <h2 id={`${id}-t`} className="sr-only">Etapa {stage.name}</h2>
      <label htmlFor={`${id}-nome`} className="sr-only">Nome da etapa</label>
      <input
        id={`${id}-nome`}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={salvarNome}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), salvarNome())}
        maxLength={40}
        className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm font-semibold uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-ring"
      />
      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        {stage.role && <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />}
        {stage.role ? ROLE_HINT[stage.role] : `${leads} ${leads === 1 ? 'lead' : 'leads'}`}
      </p>
      <div className="mt-2">
        <ColorPicker
          name={`${id}-cor`}
          value={stage.color}
          onChange={(c) => agir(() => updateStageAction(stage.id, { color: c }), `Cor de ${stage.name} trocada.`)}
        />
      </div>

      {!fixed && (
        <div className="mt-3 flex items-center gap-1 border-t border-border pt-2">
          <button
            type="button"
            disabled={pending || first}
            onClick={() => agir(() => moveStageAction(stage.id, -1), `${stage.name} foi para a esquerda.`)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Mover {stage.name} para a esquerda</span>
          </button>
          <button
            type="button"
            disabled={pending || last}
            onClick={() => agir(() => moveStageAction(stage.id, 1), `${stage.name} foi para a direita.`)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Mover {stage.name} para a direita</span>
          </button>
          <div className="flex-1" />
          {!stage.role && (
            <button
              type="button"
              onClick={() => (leads > 0 ? setApagar((v) => !v) : agir(() => deleteStageAction(stage.id, null), `Etapa ${stage.name} apagada.`))}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Apagar a etapa {stage.name}</span>
            </button>
          )}
        </div>
      )}

      {apagar && (
        <div className="mt-2 space-y-2 rounded-md bg-destructive/10 p-2 text-xs">
          <label htmlFor={`${id}-destino`} className="block font-medium">
            Os {leads} leads vão para:
          </label>
          <select id={`${id}-destino`} value={destino} onChange={(e) => setDestino(e.target.value)} className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm">
            {targets.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !destino}
            onClick={() => agir(() => deleteStageAction(stage.id, destino), `Etapa ${stage.name} apagada.`)}
            className="btn-sm w-full rounded-md bg-destructive font-medium text-destructive-foreground"
          >
            Apagar e mover
          </button>
        </div>
      )}
    </section>
  );
}

function ColorPicker({ name, value, onChange }: { name: string; value: string; onChange: (c: string) => void }) {
  return (
    <fieldset>
      <legend className="sr-only">Cor</legend>
      <div className="flex flex-wrap gap-1.5">
        {CRM_COLORS.map((c) => (
          <label key={c} className="relative cursor-pointer" title={COLOR_LABEL[c]}>
            <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} className="peer sr-only" />
            <span
              className={`block h-5 w-5 rounded-full ${colorClasses(c).dot} ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring`}
              aria-hidden="true"
            />
            <span className="sr-only">{COLOR_LABEL[c]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
