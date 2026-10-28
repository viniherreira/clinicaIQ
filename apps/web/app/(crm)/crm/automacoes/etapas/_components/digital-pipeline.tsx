'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowRightLeft,
  Bot,
  CheckSquare,
  Copy,
  MessageSquare,
  Pencil,
  Plus,
  Tag,
  Tags,
  Trash2,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { SOURCE_LABEL } from '@/crm/format';
import {
  conditionChips,
  LEAD_SOURCES,
  TRIGGER_LABEL,
  type LeadSourceKey,
  type StageConditions,
  type StageTriggerKind,
} from '@/crm/stage-automation-rules';
import {
  deleteAutomationAction,
  duplicateAutomationAction,
  saveAutomationAction,
  toggleAutomationAction,
} from '../../../configuracoes/actions';

export type ActionKind = 'SEND_MESSAGE' | 'RUN_BOT' | 'CREATE_TASK' | 'ADD_TAG' | 'REMOVE_TAG' | 'ASSIGN_USER' | 'MOVE_STAGE';

export type PipelineAutomation = {
  id: string;
  stageId: string;
  action: ActionKind;
  config: Record<string, unknown>;
  trigger: StageTriggerKind;
  conditions: StageConditions;
  delayMinutes: number;
  active: boolean;
};
type Option = { id: string; name: string };
type StageCol = { id: string; name: string; color: string; role: string | null };
type StageOption = { id: string; name: string; pipelineName: string; role: string | null };
type Template = { id: string; name: string; variables: number };
type BotOption = { id: string; name: string; active: boolean };

const DELAYS: { value: number; label: string }[] = [
  { value: 0, label: 'Imediatamente' },
  { value: 5, label: 'Depois de 5 minutos' },
  { value: 30, label: 'Depois de 30 minutos' },
  { value: 60, label: 'Depois de 1 hora' },
  { value: 180, label: 'Depois de 3 horas' },
  { value: 1440, label: 'Depois de 1 dia' },
  { value: 4320, label: 'Depois de 3 dias' },
  { value: 10080, label: 'Depois de 7 dias' },
];
const delayLabel = (m: number) => DELAYS.find((d) => d.value === m)?.label ?? `Depois de ${m} minutos`;

const ACTIONS: { value: ActionKind; label: string; icon: typeof Zap }[] = [
  { value: 'SEND_MESSAGE', label: 'Mandar mensagem no WhatsApp', icon: MessageSquare },
  { value: 'RUN_BOT', label: 'Executar um bot', icon: Bot },
  { value: 'CREATE_TASK', label: 'Criar tarefa', icon: CheckSquare },
  { value: 'ADD_TAG', label: 'Adicionar tags', icon: Tag },
  { value: 'REMOVE_TAG', label: 'Remover tags', icon: Tags },
  { value: 'ASSIGN_USER', label: 'Trocar o responsável', icon: UserRound },
  { value: 'MOVE_STAGE', label: 'Mudar a etapa do lead', icon: ArrowRightLeft },
];

const DIAS = [
  { d: 1, label: 'Seg' },
  { d: 2, label: 'Ter' },
  { d: 3, label: 'Qua' },
  { d: 4, label: 'Qui' },
  { d: 5, label: 'Sex' },
  { d: 6, label: 'Sáb' },
  { d: 0, label: 'Dom' },
];

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const labelCls = 'block text-xs font-medium text-muted-foreground';
const iconBtn =
  'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50';

const tagIdsOf = (c: Record<string, unknown>): string[] =>
  Array.isArray(c.tagIds) ? (c.tagIds as string[]) : typeof c.tagId === 'string' ? [c.tagId] : [];

type Lists = { tags: Option[]; team: Option[]; templates: Template[]; bots: BotOption[]; stages: StageOption[] };

/** O que a automação faz, em duas partes: o verbo e o alvo (tags viram chips). */
function describe(a: PipelineAutomation, l: Lists): { verb: string; target?: string; tags?: string[] } {
  const c = a.config;
  const nome = (list: Option[], id: unknown) => list.find((x) => x.id === id)?.name ?? '(apagado)';
  switch (a.action) {
    case 'SEND_MESSAGE': {
      const t = l.templates.find((x) => x.id === c.templateId);
      const texto = typeof c.text === 'string' && c.text ? `“${c.text.length > 80 ? `${c.text.slice(0, 80)}…` : c.text}”` : '';
      return { verb: 'Mandar mensagem:', target: [texto, t ? `modelo ${t.name}` : ''].filter(Boolean).join(' · ') };
    }
    case 'RUN_BOT': {
      const b = l.bots.find((x) => x.id === c.flowId);
      return { verb: 'Executar bot:', target: b ? `${b.name}${b.active ? '' : ' (desligado)'}` : '(apagado)' };
    }
    case 'CREATE_TASK':
      return {
        verb: 'Criar tarefa:',
        target: `“${String(c.text)}” para ${c.assignTo === 'responsible' ? 'o responsável' : nome(l.team, c.assignTo)}, prazo de ${Number(c.dueHours)} h`,
      };
    case 'ADD_TAG':
    case 'REMOVE_TAG':
      return { verb: a.action === 'ADD_TAG' ? 'Adicionar tags:' : 'Remover tags:', tags: tagIdsOf(c).map((id) => nome(l.tags, id)) };
    case 'ASSIGN_USER':
      return c.userId === 'distribute'
        ? { verb: 'Distribuir pela equipe', target: 'na vez de cada um (rodízio)' }
        : { verb: 'Passar o lead para', target: nome(l.team, c.userId) };
    case 'MOVE_STAGE': {
      const s = l.stages.find((x) => x.id === c.stageId);
      return { verb: 'Mudar para a etapa:', target: s ? `${s.pipelineName} · ${s.name}` : '(apagada)' };
    }
  }
}

/**
 * O "funil digital" do Kommo: cada coluna é uma etapa do funil e, nela, os
 * gatilhos que rodam sozinhos quando o lead é criado ou movido para lá.
 */
export function DigitalPipeline({
  pipelines,
  currentId,
  columns,
  automations,
  ...lists
}: {
  pipelines: Option[];
  currentId: string;
  columns: StageCol[];
  automations: PipelineAutomation[];
} & Lists) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState<{ stage: StageCol; automation?: PipelineAutomation } | null>(null);

  const agir = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string, depois?: () => void) =>
    start(async () => {
      const r = await fn();
      setAviso(r.ok ? ok : r.message ?? 'Não foi possível.');
      if (r.ok) {
        depois?.();
        router.refresh();
      }
    });

  const tagNames = new Map(lists.tags.map((t) => [t.id, t.name]));

  return (
    <section aria-label="Funil digital" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
        {pipelines.length > 1 && (
          <nav aria-label="Funis" className="flex flex-wrap gap-1">
            {pipelines.map((p) => (
              <Link
                key={p.id}
                href={`/crm/automacoes/etapas?funil=${p.id}`}
                aria-current={p.id === currentId ? 'page' : undefined}
                className={`rounded-full px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${
                  p.id === currentId ? 'bg-primary text-primary-foreground' : 'bg-surface-alt text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.name}
              </Link>
            ))}
          </nav>
        )}
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Cada coluna é uma etapa. O gatilho roda sozinho quando o lead é criado ou movido para a etapa e as condições batem. Se o lead sair antes
          da hora, a ação com atraso não acontece. Mensagens e bots não vão para quem respondeu SAIR.
        </p>
        <Link href={`/crm?funil=${currentId}`} className="btn-outline btn-sm">
          Voltar ao funil
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto">
        <ol className="flex min-h-full w-max" aria-label="Etapas do funil">
          {columns.map((s) => {
            const lista = automations.filter((a) => a.stageId === s.id);
            const headingId = `etapa-${s.id}`;
            return (
              <li key={s.id} aria-labelledby={headingId} className="flex w-72 shrink-0 flex-col border-r border-border">
                <header className="bg-surface px-3 pb-2 pt-3 text-center">
                  <h2 id={headingId} className="truncate text-[13px] font-semibold uppercase tracking-wide text-foreground/85">
                    {s.name}
                  </h2>
                  <div className={`mt-2 h-[3px] rounded-full ${colorClasses(s.color).dot}`} aria-hidden="true" />
                </header>
                <div className="flex flex-1 flex-col gap-2 bg-surface-alt/40 p-2">
                  {lista.length > 0 && (
                    <ul className="flex flex-col gap-2" aria-label={`Gatilhos em ${s.name}`}>
                      {lista.map((a) => (
                        <AutomationCard
                          key={a.id}
                          automation={a}
                          lists={lists}
                          chips={conditionChips(a.conditions, { tags: tagNames, sources: SOURCE_LABEL })}
                          pending={pending}
                          onEdit={() => setEditando({ stage: s, automation: a })}
                          onToggle={(on) => agir(() => toggleAutomationAction(a.id, on), on ? 'Gatilho ligado.' : 'Gatilho desligado.')}
                          onDuplicate={() => agir(() => duplicateAutomationAction(a.id), 'Cópia criada, desligada. Ajuste e ligue.')}
                          onDelete={() => agir(() => deleteAutomationAction(a.id), 'Gatilho apagado.')}
                        />
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditando({ stage: s })}
                    className="flex min-h-16 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-link hover:text-link focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar gatilho<span className="sr-only"> em {s.name}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {editando && (
        <AutomationDialog
          key={editando.automation?.id ?? editando.stage.id}
          stage={editando.stage}
          automation={editando.automation}
          lists={lists}
          pending={pending}
          onClose={() => setEditando(null)}
          onSubmit={(input) =>
            agir(
              () => saveAutomationAction({ ...input, id: editando.automation?.id, stageId: editando.stage.id }),
              editando.automation ? 'Gatilho salvo.' : 'Gatilho criado.',
              () => setEditando(null),
            )
          }
        />
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
      {aviso && (
        <p aria-hidden="true" className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
          {aviso}
        </p>
      )}
    </section>
  );
}

function AutomationCard({
  automation: a,
  lists,
  chips,
  pending,
  onEdit,
  onToggle,
  onDuplicate,
  onDelete,
}: {
  automation: PipelineAutomation;
  lists: Lists;
  chips: string[];
  pending: boolean;
  onEdit: () => void;
  onToggle: (on: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const Icon = ACTIONS.find((x) => x.value === a.action)?.icon ?? Zap;
  const d = describe(a, lists);
  const resumo = `${TRIGGER_LABEL[a.trigger]}: ${d.verb} ${d.target ?? d.tags?.join(', ') ?? ''}`;
  return (
    <li className={`rounded-lg border border-border bg-surface p-2.5 shadow-sm ${a.active ? '' : 'opacity-60'}`}>
      {chips.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1" aria-label="Condições">
          {chips.map((c) => (
            <li key={c} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {c}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onEdit} className="flex w-full items-start gap-2 text-left focus-visible:outline-2 focus-visible:outline-ring">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-link/10 text-link">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted-foreground">
            {TRIGGER_LABEL[a.trigger]}
            {a.delayMinutes > 0 ? ` · ${delayLabel(a.delayMinutes).toLowerCase()}` : ''}
          </span>
          <span className="block text-sm font-semibold leading-snug">
            {d.verb} {d.target && <span className="font-normal">{d.target}</span>}
          </span>
          {d.tags && (
            <span className="mt-1 flex flex-wrap gap-1">
              {d.tags.map((t) => (
                <span key={t} className="rounded bg-link/10 px-1.5 py-0.5 text-[11px] font-medium text-link">
                  {t}
                </span>
              ))}
            </span>
          )}
          <span className="sr-only">. Editar.</span>
        </span>
      </button>
      <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
        <label className="mr-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            role="switch"
            checked={a.active}
            disabled={pending}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Ligado<span className="sr-only">: {resumo}</span>
        </label>
        <button type="button" disabled={pending} onClick={onEdit} aria-label={`Editar gatilho: ${resumo}`} className={iconBtn}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" disabled={pending} onClick={onDuplicate} aria-label={`Duplicar gatilho: ${resumo}`} className={iconBtn}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" disabled={pending} onClick={onDelete} aria-label={`Apagar gatilho: ${resumo}`} className={iconBtn}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

type SubmitInput = {
  action: ActionKind;
  config: Record<string, unknown>;
  delayMinutes: number;
  trigger: StageTriggerKind;
  conditions: StageConditions;
};

function AutomationDialog({
  stage,
  automation,
  lists,
  pending,
  onClose,
  onSubmit,
}: {
  stage: StageCol;
  automation?: PipelineAutomation;
  lists: Lists;
  pending: boolean;
  onClose: () => void;
  onSubmit: (i: SubmitInput) => void;
}) {
  const id = useId();
  const c = automation?.config ?? {};
  const cond = automation?.conditions ?? {};
  const { tags, team, templates, bots, stages } = lists;

  const [trigger, setTrigger] = useState<StageTriggerKind>(automation?.trigger ?? 'ENTER');
  const [delay, setDelay] = useState(automation?.delayMinutes ?? 0);
  const [action, setAction] = useState<ActionKind>(automation?.action ?? 'SEND_MESSAGE');
  const [text, setText] = useState(typeof c.text === 'string' ? c.text : '');
  const [templateId, setTemplateId] = useState(typeof c.templateId === 'string' ? c.templateId : '');
  const [dueHours, setDueHours] = useState(typeof c.dueHours === 'number' ? c.dueHours : 24);
  const [assignTo, setAssignTo] = useState(typeof c.assignTo === 'string' ? c.assignTo : 'responsible');
  const [tagIds, setTagIds] = useState<string[]>(tagIdsOf(c));
  const [userId, setUserId] = useState(typeof c.userId === 'string' ? c.userId : 'distribute');
  const [flowId, setFlowId] = useState(typeof c.flowId === 'string' ? c.flowId : (bots.find((b) => b.active) ?? bots[0])?.id ?? '');
  const destinos = stages.filter((s) => s.id !== stage.id && s.role !== 'LOST');
  const [toStage, setToStage] = useState(typeof c.stageId === 'string' ? c.stageId : destinos[0]?.id ?? '');

  // Condições
  const [days, setDays] = useState<number[]>(cond.days ?? []);
  const [hours, setHours] = useState(Boolean(cond.from));
  const [from, setFrom] = useState(cond.from ?? '08:00');
  const [to, setTo] = useState(cond.to ?? '18:00');
  const [sources, setSources] = useState<LeadSourceKey[]>(cond.sources ?? []);
  const [condTags, setCondTags] = useState<string[]>(cond.tagIds ?? []);
  const temCondicao = Boolean(cond.days || cond.from || cond.sources || cond.tagIds);
  const [condAberta, setCondAberta] = useState(temCondicao);

  const t = templates.find((x) => x.id === templateId);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const config: Record<string, unknown> =
    action === 'SEND_MESSAGE'
      ? { text, ...(templateId ? { templateId, params: Array.from({ length: t?.variables ?? 0 }, (_, i) => (i === 0 ? '{nome}' : '')) } : {}) }
      : action === 'CREATE_TASK'
        ? { text, dueHours, assignTo }
        : action === 'ADD_TAG' || action === 'REMOVE_TAG'
          ? { tagIds }
          : action === 'ASSIGN_USER'
            ? { userId }
            : action === 'RUN_BOT'
              ? { flowId }
              : { stageId: toStage };

  const conditions: StageConditions = condAberta
    ? {
        ...(days.length ? { days } : {}),
        ...(hours ? { from, to } : {}),
        ...(sources.length ? { sources } : {}),
        ...(condTags.length ? { tagIds: condTags } : {}),
      }
    : {};

  const funis = [...new Set(destinos.map((s) => s.pipelineName))];

  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl focus:outline-none">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                <Zap className="h-4 w-4" aria-hidden="true" />
              </span>
              <Dialog.Title className="text-base font-semibold">
                {automation ? 'Editar gatilho' : 'Novo gatilho'} · {stage.name}
              </Dialog.Title>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">O que acontece sozinho quando o lead chega na etapa {stage.name}.</Dialog.Description>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit({ action, config, delayMinutes: delay, trigger, conditions });
            }}
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <fieldset>
                <legend className={labelCls}>Gatilho</legend>
                <div className="mt-1.5 grid gap-1.5">
                  {(['ENTER', 'CREATED', 'MOVED'] as const).map((g) => (
                    <label key={g} className="flex items-center gap-2 text-sm">
                      <input type="radio" name={`${id}-gatilho`} checked={trigger === g} onChange={() => setTrigger(g)} className="h-4 w-4 accent-primary" />
                      {TRIGGER_LABEL[g]}
                      {g === 'ENTER' && <span className="text-xs text-muted-foreground">(criado ou movido)</span>}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor={`${id}-quando`} className={labelCls}>
                  Executar
                </label>
                <select id={`${id}-quando`} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className={`${inputCls} mt-1`}>
                  {DELAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-border">
                <label className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium">
                  <input type="checkbox" checked={condAberta} onChange={(e) => setCondAberta(e.target.checked)} className="h-4 w-4 accent-primary" />
                  Só em algumas condições
                </label>
                {condAberta && (
                  <div className="space-y-3 border-t border-border px-3 py-3">
                    <fieldset>
                      <legend className={labelCls}>Dias da semana (nenhum marcado: todos)</legend>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {DIAS.map(({ d, label }) => (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={days.includes(d)}
                            onClick={() => setDays(toggle(days, d))}
                            className={`h-8 min-w-11 rounded-md border px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${
                              days.includes(d) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={hours} onChange={(e) => setHours(e.target.checked)} className="h-4 w-4 accent-primary" />
                        Só neste horário
                      </label>
                      {hours && (
                        <div className="mt-1.5 flex items-center gap-2 text-sm">
                          <label htmlFor={`${id}-de`} className="sr-only">
                            De
                          </label>
                          <input id={`${id}-de`} type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-28`} />
                          <span aria-hidden="true">às</span>
                          <label htmlFor={`${id}-ate`} className="sr-only">
                            Até
                          </label>
                          <input id={`${id}-ate`} type="time" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-28`} />
                        </div>
                      )}
                      {hours && from > to && <p className="mt-1 text-xs text-muted-foreground">Passa da meia-noite: vale de {from} até {to} do dia seguinte.</p>}
                    </div>
                    <fieldset>
                      <legend className={labelCls}>Origem do lead (nenhuma marcada: todas)</legend>
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        {LEAD_SOURCES.map((s) => (
                          <label key={s} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={sources.includes(s)} onChange={() => setSources(toggle(sources, s))} className="h-4 w-4 accent-primary" />
                            {SOURCE_LABEL[s]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    {tags.length > 0 && (
                      <TagPicker legend="Com alguma destas tags (nenhuma marcada: qualquer lead)" tags={tags} value={condTags} onChange={setCondTags} />
                    )}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor={`${id}-acao`} className={labelCls}>
                  Ação
                </label>
                <select id={`${id}-acao`} value={action} onChange={(e) => setAction(e.target.value as ActionKind)} className={`${inputCls} mt-1`}>
                  {ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              {(action === 'SEND_MESSAGE' || action === 'CREATE_TASK') && (
                <div>
                  <label htmlFor={`${id}-texto`} className={labelCls}>
                    {action === 'SEND_MESSAGE' ? 'Mensagem ({nome} vira o primeiro nome)' : 'Tarefa'}
                  </label>
                  <textarea
                    id={`${id}-texto`}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={action === 'SEND_MESSAGE' ? 3 : 1}
                    maxLength={action === 'SEND_MESSAGE' ? 1000 : 300}
                    placeholder={action === 'SEND_MESSAGE' ? 'Oi {nome}! Recebemos sua mensagem e já te respondemos.' : 'Ligar para {nome}'}
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                </div>
              )}
              {action === 'SEND_MESSAGE' && templates.length > 0 && (
                <div>
                  <label htmlFor={`${id}-modelo`} className={labelCls}>
                    Modelo aprovado para depois das 24 horas (API oficial)
                  </label>
                  <select id={`${id}-modelo`} value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={`${inputCls} mt-1`}>
                    <option value="">Nenhum</option>
                    {templates.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {action === 'RUN_BOT' &&
                (bots.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Ainda não há bots. Crie um em{' '}
                    <Link href="/crm/automacoes/bots" className="text-link underline">
                      Automações › Bots
                    </Link>
                    .
                  </p>
                ) : (
                  <div>
                    <label htmlFor={`${id}-bot`} className={labelCls}>
                      Bot
                    </label>
                    <select id={`${id}-bot`} value={flowId} onChange={(e) => setFlowId(e.target.value)} className={`${inputCls} mt-1`}>
                      {bots.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {b.active ? '' : ' (desligado)'}
                        </option>
                      ))}
                    </select>
                    {bots.find((b) => b.id === flowId && !b.active) && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Este bot está desligado. Ligue em Automações › Bots para ele rodar.</p>
                    )}
                  </div>
                ))}
              {action === 'CREATE_TASK' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${id}-prazo`} className={labelCls}>
                      Prazo (horas)
                    </label>
                    <input
                      id={`${id}-prazo`}
                      type="number"
                      min={0}
                      max={1440}
                      value={dueHours}
                      onChange={(e) => setDueHours(Number(e.target.value))}
                      className={`${inputCls} mt-1`}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${id}-quem`} className={labelCls}>
                      Para quem
                    </label>
                    <select id={`${id}-quem`} value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className={`${inputCls} mt-1`}>
                      <option value="responsible">O responsável pelo lead</option>
                      {team.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {(action === 'ADD_TAG' || action === 'REMOVE_TAG') &&
                (tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Crie uma tag primeiro, em{' '}
                    <Link href="/crm/configuracoes?aba=tags" className="text-link underline">
                      Configurações › Tags
                    </Link>
                    .
                  </p>
                ) : (
                  <TagPicker legend="Tags" tags={tags} value={tagIds} onChange={setTagIds} />
                ))}
              {action === 'ASSIGN_USER' && (
                <div>
                  <label htmlFor={`${id}-pessoa`} className={labelCls}>
                    Novo responsável
                  </label>
                  <select id={`${id}-pessoa`} value={userId} onChange={(e) => setUserId(e.target.value)} className={`${inputCls} mt-1`}>
                    <option value="distribute">Distribuir pela equipe (rodízio)</option>
                    {team.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {action === 'MOVE_STAGE' && (
                <div>
                  <label htmlFor={`${id}-etapa`} className={labelCls}>
                    Para a etapa
                  </label>
                  <select id={`${id}-etapa`} value={toStage} onChange={(e) => setToStage(e.target.value)} className={`${inputCls} mt-1`}>
                    {funis.map((f) => (
                      <optgroup key={f} label={f}>
                        {destinos
                          .filter((s) => s.pipelineName === f)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">Perdeu fica de fora: perder o lead pede o motivo.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={onClose} className="btn-ghost btn-md">
                Cancelar
              </button>
              <button type="submit" disabled={pending} className="btn-primary btn-md">
                {automation ? 'Salvar gatilho' : 'Criar gatilho'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TagPicker({ legend, tags, value, onChange }: { legend: string; tags: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className={labelCls}>{legend}</legend>
      <div className="mt-1.5 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
        {tags.map((t) => {
          const on = value.includes(t.id);
          return (
            <label
              key={t.id}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${
                on ? 'border-link bg-link/10 text-link' : 'border-border text-muted-foreground'
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
                className="sr-only"
              />
              {t.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
