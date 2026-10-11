'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, MessageSquare, Plus, Tag, Trash2, UserRound, Zap } from 'lucide-react';
import { deleteAutomationAction, saveAutomationAction, toggleAutomationAction } from '../actions';

export type AutomationRow = {
  id: string;
  stageId: string;
  action: 'SEND_MESSAGE' | 'CREATE_TASK' | 'ADD_TAG' | 'ASSIGN_USER';
  config: Record<string, unknown>;
  delayMinutes: number;
  active: boolean;
};
type Option = { id: string; name: string };
type Template = { id: string; name: string; variables: number };

const DELAYS: { value: number; label: string }[] = [
  { value: 0, label: 'Na hora' },
  { value: 5, label: 'Depois de 5 minutos' },
  { value: 30, label: 'Depois de 30 minutos' },
  { value: 60, label: 'Depois de 1 hora' },
  { value: 180, label: 'Depois de 3 horas' },
  { value: 1440, label: 'Depois de 1 dia' },
  { value: 4320, label: 'Depois de 3 dias' },
  { value: 10080, label: 'Depois de 7 dias' },
];
const delayLabel = (m: number) => DELAYS.find((d) => d.value === m)?.label ?? `Depois de ${m} minutos`;

const ACTIONS = [
  { value: 'SEND_MESSAGE', label: 'Mandar mensagem no WhatsApp', icon: MessageSquare },
  { value: 'CREATE_TASK', label: 'Criar tarefa', icon: CheckSquare },
  { value: 'ADD_TAG', label: 'Pôr uma tag', icon: Tag },
  { value: 'ASSIGN_USER', label: 'Trocar o responsável', icon: UserRound },
] as const;

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function describe(a: AutomationRow, tags: Option[], team: Option[], templates: Template[]): string {
  const c = a.config;
  const nome = (list: Option[], id: unknown) => list.find((x) => x.id === id)?.name ?? '(apagado)';
  switch (a.action) {
    case 'SEND_MESSAGE': {
      const t = templates.find((x) => x.id === c.templateId);
      const texto = typeof c.text === 'string' ? `“${c.text.length > 70 ? `${c.text.slice(0, 70)}…` : c.text}”` : '';
      return `Manda ${[texto, t ? `(modelo ${t.name} na API oficial)` : ''].filter(Boolean).join(' ')}`;
    }
    case 'CREATE_TASK':
      return `Cria a tarefa “${String(c.text)}” para ${c.assignTo === 'responsible' ? 'o responsável' : nome(team, c.assignTo)}, prazo de ${Number(c.dueHours)} h`;
    case 'ADD_TAG':
      return `Põe a tag ${nome(tags, c.tagId)}`;
    case 'ASSIGN_USER':
      return `Passa o lead para ${nome(team, c.userId)}`;
  }
}

/**
 * O "funil digital" do Kommo: o que acontece quando um lead entra em cada etapa.
 */
export function AutomationsTab({
  stages,
  automations,
  tags,
  team,
  templates,
}: {
  stages: Option[];
  automations: AutomationRow[];
  tags: Option[];
  team: Option[];
  templates: Template[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);

  const agir = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setAviso(r.ok ? ok : r.message ?? 'Não foi possível.');
      if (r.ok) {
        setAberto(null);
        router.refresh();
      }
    });

  return (
    <section aria-label="Automações por etapa">
      <p className="text-xs text-muted-foreground">
        Quando um lead entra numa etapa — arrastado, criado ou movido pela agenda — o CRM faz isto sozinho. Se o lead sair da etapa antes da
        hora, a ação com atraso não acontece. Mensagens não vão para quem respondeu SAIR.
      </p>
      <ul className="mt-4 space-y-3">
        {stages.map((s) => {
          const lista = automations.filter((a) => a.stageId === s.id);
          return (
            <li key={s.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <h3 className="mr-auto text-sm font-semibold">Quando entra em {s.name}</h3>
                <button
                  type="button"
                  onClick={() => setAberto(aberto === s.id ? null : s.id)}
                  aria-expanded={aberto === s.id}
                  className="btn-ghost btn-sm"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar<span className="sr-only"> automação em {s.name}</span>
                </button>
              </div>
              {lista.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {lista.map((a) => {
                    const Icon = ACTIONS.find((x) => x.value === a.action)!.icon;
                    const texto = describe(a, tags, team, templates);
                    return (
                      <li key={a.id} className={`flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-sm ${a.active ? 'bg-surface-alt/60' : 'bg-surface-alt/30 text-muted-foreground'}`}>
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{delayLabel(a.delayMinutes)}:</span> {texto}
                        </span>
                        <label className="inline-flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={a.active}
                            disabled={pending}
                            onChange={(e) => agir(() => toggleAutomationAction(a.id, e.target.checked), e.target.checked ? 'Automação ligada.' : 'Automação desligada.')}
                            className="h-4 w-4 accent-primary"
                          />
                          Ligada<span className="sr-only">: {texto}</span>
                        </label>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => agir(() => deleteAutomationAction(a.id), 'Automação apagada.')}
                          aria-label={`Apagar automação: ${texto}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {lista.length === 0 && aberto !== s.id && <p className="mt-1 text-xs text-muted-foreground">Nada acontece sozinho nesta etapa.</p>}
              {aberto === s.id && (
                <NewAutomation
                  stageId={s.id}
                  tags={tags}
                  team={team}
                  templates={templates}
                  pending={pending}
                  onSubmit={(input) => agir(() => saveAutomationAction(input), 'Automação criada.')}
                />
              )}
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">
        {aviso}
      </p>
    </section>
  );
}

function NewAutomation({
  stageId,
  tags,
  team,
  templates,
  pending,
  onSubmit,
}: {
  stageId: string;
  tags: Option[];
  team: Option[];
  templates: Template[];
  pending: boolean;
  onSubmit: (i: { stageId: string; action: AutomationRow['action']; config: Record<string, unknown>; delayMinutes: number }) => void;
}) {
  const id = useId();
  const [action, setAction] = useState<AutomationRow['action']>('SEND_MESSAGE');
  const [delay, setDelay] = useState(0);
  const [text, setText] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [dueHours, setDueHours] = useState(24);
  const [assignTo, setAssignTo] = useState('responsible');
  const [tagId, setTagId] = useState(tags[0]?.id ?? '');
  const [userId, setUserId] = useState(team[0]?.id ?? '');
  const t = templates.find((x) => x.id === templateId);

  const config =
    action === 'SEND_MESSAGE'
      ? { text, ...(templateId ? { templateId, params: Array.from({ length: t?.variables ?? 0 }, (_, i) => (i === 0 ? '{nome}' : '')) } : {}) }
      : action === 'CREATE_TASK'
        ? { text, dueHours, assignTo }
        : action === 'ADD_TAG'
          ? { tagId }
          : { userId };

  return (
    <form
      className="mt-3 space-y-3 rounded-lg border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ stageId, action, config, delayMinutes: delay });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-acao`} className="block text-xs font-medium text-muted-foreground">O que fazer</label>
          <select id={`${id}-acao`} value={action} onChange={(e) => setAction(e.target.value as AutomationRow['action'])} className={`${inputCls} mt-1`}>
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-quando`} className="block text-xs font-medium text-muted-foreground">Quando</label>
          <select id={`${id}-quando`} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className={`${inputCls} mt-1`}>
            {DELAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(action === 'SEND_MESSAGE' || action === 'CREATE_TASK') && (
        <div>
          <label htmlFor={`${id}-texto`} className="block text-xs font-medium text-muted-foreground">
            {action === 'SEND_MESSAGE' ? 'Mensagem ({nome} vira o primeiro nome)' : 'Tarefa'}
          </label>
          <textarea
            id={`${id}-texto`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={action === 'SEND_MESSAGE' ? 3 : 1}
            maxLength={action === 'SEND_MESSAGE' ? 1000 : 300}
            placeholder={action === 'SEND_MESSAGE' ? 'Oi {nome}! Sua avaliação está marcada. Qualquer dúvida, é só responder aqui.' : 'Ligar para {nome}'}
            className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
      )}
      {action === 'SEND_MESSAGE' && templates.length > 0 && (
        <div>
          <label htmlFor={`${id}-modelo`} className="block text-xs font-medium text-muted-foreground">
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
      {action === 'CREATE_TASK' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-prazo`} className="block text-xs font-medium text-muted-foreground">Prazo (horas)</label>
            <input id={`${id}-prazo`} type="number" min={0} max={1440} value={dueHours} onChange={(e) => setDueHours(Number(e.target.value))} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <label htmlFor={`${id}-quem`} className="block text-xs font-medium text-muted-foreground">Para quem</label>
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
      {action === 'ADD_TAG' &&
        (tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">Crie uma tag primeiro, na aba Tags.</p>
        ) : (
          <div>
            <label htmlFor={`${id}-tag`} className="block text-xs font-medium text-muted-foreground">Tag</label>
            <select id={`${id}-tag`} value={tagId} onChange={(e) => setTagId(e.target.value)} className={`${inputCls} mt-1`}>
              {tags.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      {action === 'ASSIGN_USER' && (
        <div>
          <label htmlFor={`${id}-pessoa`} className="block text-xs font-medium text-muted-foreground">Novo responsável</label>
          <select id={`${id}-pessoa`} value={userId} onChange={(e) => setUserId(e.target.value)} className={`${inputCls} mt-1`}>
            {team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <button type="submit" disabled={pending} className="btn-primary btn-sm">
        <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Criar automação
      </button>
    </form>
  );
}
