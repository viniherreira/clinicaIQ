'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, Bot, Clock, Copy, GitBranch, Pencil, Plus, Sparkles, Tag, Trash2, Users, X, Zap } from 'lucide-react';
import type { ChatbotTrigger } from '@clinicaiq/db';
import type { BotAudience, BotHours } from '@/crm/bot-engine';
import { colorClasses } from '@/crm/colors';
import { FLOW_TEMPLATES } from '@/crm/flow-templates';
import { deleteBotAction, toggleBotAction } from '../../../configuracoes/actions';
import { duplicateFlowAction } from '../actions';
import type { FlowRefs } from './flow-refs';

export interface BotListRow {
  id: string;
  name: string;
  trigger: ChatbotTrigger;
  /** "Escreve “menu”", "Lead entra em Avaliação" (montado no servidor). */
  triggerText: string;
  active: boolean;
  steps: number;
  hours: BotHours;
  audience: BotAudience;
  /** Tags que as ações do robô põem. */
  tagsPut: string[];
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function hoursText(h: BotHours) {
  if (h.mode === 'always') return 'a qualquer hora';
  const dias = h.days.length === 7 ? 'todos os dias' : h.days.map((d) => DIAS[d]).join(', ');
  return `${h.mode === 'outside' ? 'só fora do horário' : 'só no horário'} (${dias}, ${h.start} às ${h.end})`;
}

const GRUPOS: { key: ChatbotTrigger; titulo: string; dica: string }[] = [
  { key: 'NEW_CONTACT', titulo: 'Quando chega um número novo', dica: 'Responde a primeira mensagem. O que pede tag responde antes do que vale para todos.' },
  { key: 'KEYWORD', titulo: 'Quando escrevem uma palavra-chave', dica: 'Responde em qualquer momento da conversa, como “menu”.' },
  { key: 'STAGE', titulo: 'Quando o lead entra numa etapa', dica: 'Começa sozinho quando o lead é criado ou movido para a etapa.' },
  { key: 'TAG', titulo: 'Quando uma tag é posta', dica: 'Começa sozinho quando o lead ganha a tag.' },
  { key: 'NO_REPLY', titulo: 'Quando a pessoa some', dica: 'Começa depois de algumas horas sem resposta.' },
];

function TagChips({ ids, tags, label }: { ids: string[]; tags: FlowRefs['tags']; label: string }) {
  const lista = ids.map((x) => tags.find((t) => t.id === x)).filter((t): t is FlowRefs['tags'][number] => Boolean(t));
  if (!lista.length) return null;
  return (
    <ul className="inline-flex flex-wrap gap-1" aria-label={label}>
      {lista.map((t) => (
        <li key={t.id} className={`rounded-[4px] px-1.5 py-0.5 text-xs font-medium ${colorClasses(t.color).chip}`}>
          {t.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * Os robôs da clínica, como a lista de Salesbots do Kommo: separados pelo
 * gatilho, com filtro por situação e por tag. Cada um abre no quadro.
 */
export function BotsList({ bots, tags, children }: { bots: BotListRow[]; tags: FlowRefs['tags']; children?: React.ReactNode }) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [escolhendo, setEscolhendo] = useState(false);
  const [situacao, setSituacao] = useState<'todos' | 'ligados' | 'desligados'>('todos');
  const [tag, setTag] = useState('');

  const agir = (fn: () => Promise<{ ok: boolean; message?: string; id?: string }>, ok: string, depois?: (r: { id?: string }) => void) =>
    start(async () => {
      const r = await fn();
      setAviso(r.ok ? ok : r.message ?? 'Não foi possível.');
      if (r.ok) {
        if (depois) depois(r);
        else router.refresh();
      }
    });

  const usaTag = (b: BotListRow, t: string) => b.audience.anyTags.includes(t) || b.audience.noneTags.includes(t) || b.tagsPut.includes(t);
  const tagsUsadas = tags.filter((t) => bots.some((b) => usaTag(b, t.id)));
  const visiveis = bots.filter((b) => (situacao === 'todos' || (situacao === 'ligados') === b.active) && (!tag || usaTag(b, tag)));
  const ligados = bots.filter((b) => b.active).length;

  if (escolhendo) {
    return (
      <section aria-labelledby={`${id}-modelos`}>
        <div className="flex items-center justify-between gap-2">
          <h2 id={`${id}-modelos`} className="text-base font-semibold">
            Como o robô começa?
          </h2>
          <button type="button" onClick={() => setEscolhendo(false)} className="btn-ghost btn-sm">
            <X className="h-4 w-4" aria-hidden="true" /> Cancelar
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Escolha um modelo pronto e ajuste no quadro. Dá para mudar tudo depois.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {FLOW_TEMPLATES.map((t) => (
            <li key={t.key}>
              <Link
                href={`/crm/automacoes/bots/novo?modelo=${t.key}`}
                className="flex h-full flex-col items-start gap-1 rounded-xl border border-border bg-surface p-4 hover:border-link focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Sparkles className="h-5 w-5 text-link" aria-hidden="true" />
                <span className="font-semibold">{t.title}</span>
                <span className="text-sm text-muted-foreground">{t.description}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/crm/automacoes/bots/novo"
              className="flex h-full flex-col items-start gap-1 rounded-xl border border-dashed border-border-strong bg-surface p-4 hover:border-link focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span className="font-semibold">Em branco</span>
              <span className="text-sm text-muted-foreground">Começar do zero no quadro.</span>
            </Link>
          </li>
        </ul>
      </section>
    );
  }

  return (
    <section aria-label="Robôs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-sm text-muted-foreground">
            Robôs em passos ligados, como o Salesbot do Kommo: mensagens com botões, condições, esperas, validações e ações no CRM. O robô para quando
            alguém da equipe responde.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {bots.length} {bots.length === 1 ? 'robô' : 'robôs'} · {ligados} {ligados === 1 ? 'ligado' : 'ligados'}
          </p>
        </div>
        <button type="button" onClick={() => setEscolhendo(true)} className="btn-primary btn-md">
          <Plus className="h-4 w-4" aria-hidden="true" /> Novo robô
        </button>
      </div>

      {bots.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Situação dos robôs" className="segmented">
            {(
              [
                ['todos', 'Todos'],
                ['ligados', 'Ligados'],
                ['desligados', 'Desligados'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={situacao === v} onClick={() => setSituacao(v)} className="segmented-item px-3">
                {l}
              </button>
            ))}
          </div>
          {tagsUsadas.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-tag`} className="text-xs text-muted-foreground">
                Tag
              </label>
              <select
                id={`${id}-tag`}
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <option value="">Todas</option>
                {tagsUsadas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {GRUPOS.map((g) => {
        const doGrupo = visiveis.filter((b) => b.trigger === g.key);
        if (doGrupo.length === 0) return null;
        return (
          <section key={g.key} aria-labelledby={`${id}-${g.key}`} className="mt-5">
            <h3 id={`${id}-${g.key}`} className="flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4 text-link" aria-hidden="true" /> {g.titulo}
              <span className="font-normal text-muted-foreground">({doGrupo.length})</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{g.dica}</p>
            <ul className="mt-2 space-y-2">
              {doGrupo.map((b) => (
                <li key={b.id} className={`rounded-xl border bg-surface p-4 ${b.active ? 'border-border-strong' : 'border-border'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full ${b.active ? 'bg-green-600/20 text-green-400' : 'bg-surface-alt text-muted-foreground'}`} aria-hidden="true">
                      <Bot className="h-5 w-5" />
                    </span>
                    <h4 className="min-w-0 flex-1 truncate font-semibold">{b.name}</h4>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={b.active}
                        disabled={pending}
                        onChange={(e) => agir(() => toggleBotAction(b.id, e.target.checked), e.target.checked ? `${b.name} ligado.` : `${b.name} desligado.`)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className="relative h-5 w-9 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-green-600 peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring"
                      />
                      {b.active ? 'Ligado' : 'Desligado'}
                      <span className="sr-only">: {b.name}</span>
                    </label>
                    <Link href={`/crm/automacoes/bots/${b.id}`} className="btn-outline btn-sm">
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar<span className="sr-only"> {b.name}</span>
                    </Link>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => agir(() => duplicateFlowAction(b.id), 'Cópia criada.', (r) => r.id && router.push(`/crm/automacoes/bots/${r.id}`))}
                      aria-label={`Duplicar ${b.name}`}
                      title="Duplicar"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => window.confirm(`Apagar o robô ${b.name}?`) && agir(() => deleteBotAction(b.id), 'Robô apagado.')}
                      aria-label={`Apagar ${b.name}`}
                      title="Apagar"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <ul className="mt-3 space-y-1.5 pl-12 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        {b.triggerText}, {hoursText(b.hours)}.
                      </span>
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {b.audience.anyTags.length === 0 && b.audience.noneTags.length === 0 ? (
                        <span>Para todos.</span>
                      ) : (
                        <>
                          {b.audience.anyTags.length > 0 && (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              Só para leads com <TagChips ids={b.audience.anyTags} tags={tags} label="Tags pedidas" />
                            </span>
                          )}
                          {b.audience.noneTags.length > 0 && (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <Ban className="h-3.5 w-3.5" aria-hidden="true" /> nunca com <TagChips ids={b.audience.noneTags} tags={tags} label="Tags que bloqueiam" />
                            </span>
                          )}
                        </>
                      )}
                    </li>
                    <li className="flex items-start gap-2">
                      <GitBranch className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        {b.steps} {b.steps === 1 ? 'passo' : 'passos'}
                      </span>
                    </li>
                    {b.tagsPut.length > 0 && (
                      <li className="flex flex-wrap items-center gap-2">
                        <Tag className="h-4 w-4 shrink-0" aria-hidden="true" /> Põe as tags <TagChips ids={b.tagsPut} tags={tags} label="Tags que o robô põe" />
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {bots.length > 0 && visiveis.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum robô com esse filtro.</p>
      )}
      {bots.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum robô ainda. Clique em <strong className="font-medium text-foreground">Novo robô</strong> e escolha um modelo pronto.
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">
        {aviso}
      </p>
      {children}
    </section>
  );
}
