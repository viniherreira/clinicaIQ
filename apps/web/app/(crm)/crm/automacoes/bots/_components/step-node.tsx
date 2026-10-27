'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clock, Play, Zap } from 'lucide-react';
import { stepHandles, type FlowStep } from '@/crm/flow-engine';
import { STEP_META } from '@/crm/flow-templates';
import type { FlowRefs } from './flow-refs';

export type StepNodeData = {
  step: FlowStep;
  n: number;
  refs: FlowRefs;
  isStart: boolean;
  /** O passo onde o teste está agora. */
  active: boolean;
  numberOf: (id: string) => number | null;
};

const nome = (l: { id: string; name: string }[], id?: string) => l.find((x) => x.id === id)?.name ?? '-';
const tempo = (min: number) => (min % 1440 === 0 ? `${min / 1440} dia(s)` : min % 60 === 0 ? `${min / 60} h` : `${min} min`);

/** O resumo dentro da caixa: o que o passo faz, em uma ou duas linhas. */
function Resumo({ step: s, refs, numberOf }: Pick<StepNodeData, 'step' | 'refs' | 'numberOf'>) {
  switch (s.type) {
    case 'message':
      return (
        <>
          <p className="line-clamp-3 whitespace-pre-wrap text-[12px] leading-snug">{s.text || <span className="text-muted-foreground">Mensagem vazia</span>}</p>
          {(s.waitReply || s.buttons.length > 0) && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" /> Espera a resposta{s.timeoutMinutes ? ` · até ${tempo(s.timeoutMinutes)}` : ''}
            </p>
          )}
        </>
      );
    case 'condition':
      return <p className="text-[12px] text-muted-foreground">{s.cases.length} {s.cases.length === 1 ? 'caso' : 'casos'} + senão</p>;
    case 'pause':
      return (
        <p className="text-[12px]">
          {[s.waitMessage && 'até a pessoa escrever', s.minutes && `até ${tempo(s.minutes)}`].filter(Boolean).join(' ou ') || 'segue direto'}
        </p>
      );
    case 'validate':
      return <p className="text-[12px]">Confere: {{ email: 'e-mail', phone: 'telefone', number: 'número', cpf: 'CPF', contains: 'contém', equals: 'igual a', minLength: 'tamanho mínimo' }[s.check]}</p>;
    case 'action':
      return (
        <ul className="space-y-0.5 text-[12px]">
          {s.actions.length === 0 && <li className="text-muted-foreground">Nenhuma ação</li>}
          {s.actions.slice(0, 4).map((a, i) => (
            <li key={i} className="truncate">
              •{' '}
              {a.type === 'tag'
                ? `Tag ${nome(refs.tags, a.tagId)}`
                : a.type === 'untag'
                  ? `Tira a tag ${nome(refs.tags, a.tagId)}`
                  : a.type === 'stage'
                    ? `Etapa ${nome(refs.stages, a.stageId)}`
                    : a.type === 'createLead'
                      ? 'Cria o lead'
                      : a.type === 'assign'
                        ? a.userId === 'distribute' ? 'Distribui pela equipe' : `Para ${nome(refs.team, a.userId)}`
                        : a.type === 'setField'
                          ? `Campo ${a.field === 'name' ? 'nome' : a.field === 'email' ? 'e-mail' : a.field === 'note' ? 'anotação' : nome(refs.fields, a.field.slice(6))}`
                          : a.type === 'task'
                            ? `Tarefa: ${a.text}`
                            : a.type === 'note'
                              ? `Nota: ${a.text}`
                              : `Aviso: ${a.text}`}
            </li>
          ))}
          {s.actions.length > 4 && <li className="text-muted-foreground">e mais {s.actions.length - 4}</li>}
        </ul>
      );
    case 'goto': {
      const n = numberOf(s.target);
      return <p className="text-[12px]">{n ? `Vai para o passo ${n}` : 'Escolha o passo'}{s.mode === 'silent' ? ' (espera sem repetir)' : s.mode === 'retry' ? ' ("não entendi")' : ''}</p>;
    }
    case 'startBot':
      return <p className="text-[12px]">{s.botId ? nome(refs.bots, s.botId) : 'Escolha o robô'}</p>;
    case 'roundRobin':
      return <p className="text-[12px] text-muted-foreground">Alterna entre {s.options.length} caminhos</p>;
    case 'handoff':
      return <p className="line-clamp-2 text-[12px]">{s.text || 'Frase padrão: "Já vou chamar alguém da equipe…"'}</p>;
    case 'stop':
      return <p className="text-[12px] text-muted-foreground">O robô termina aqui.</p>;
  }
}

/** Uma caixa do quadro, como no Salesbot: número, tipo, resumo e uma bolinha por saída. */
export const StepNode = memo(function StepNode({ data, selected }: NodeProps & { data: StepNodeData }) {
  const { step, n, refs, isStart, active, numberOf } = data;
  const meta = STEP_META[step.type];
  const saidas = stepHandles(step);
  return (
    <div
      className={`w-[260px] overflow-visible rounded-xl border bg-surface text-foreground shadow-lg transition-shadow ${selected ? 'border-link ring-2 ring-link/40' : active ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-border-strong'}`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-surface !bg-link" />
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border px-3 py-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.tone}`} aria-hidden="true" />
        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{n}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{meta.label}</span>
        {isStart && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-link/15 px-1.5 py-0.5 text-[10px] font-semibold text-link">
            <Play className="h-2.5 w-2.5" aria-hidden="true" /> Início
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <Resumo step={step} refs={refs} numberOf={numberOf} />
      </div>
      {saidas.length > 0 && (
        <ul className="border-t border-border py-1">
          {saidas.map((h) => (
            <li key={h.key} className="relative flex items-center justify-end px-3 py-1 text-[11px]">
              <span className="truncate text-muted-foreground">{h.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={h.key}
                className={`!h-3 !w-3 !border-2 !border-surface ${step.out[h.key] ? '!bg-link' : '!bg-muted-foreground'}`}
                style={{ top: '50%', right: -7 }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

/** A pílula de começo do robô: o gatilho, ligada ao primeiro passo. */
export const StartNode = memo(function StartNode({ data }: NodeProps & { data: { label: string } }) {
  return (
    <div className="flex max-w-[220px] items-center gap-2 rounded-full border border-link/60 bg-link/10 px-4 py-2 text-[12px] font-semibold text-link shadow">
      <Zap className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="line-clamp-2">{data.label}</span>
      <Handle type="source" position={Position.Right} id="start" className="!h-3 !w-3 !border-2 !border-surface !bg-link" />
    </div>
  );
});
