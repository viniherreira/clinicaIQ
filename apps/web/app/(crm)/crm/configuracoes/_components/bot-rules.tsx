'use client';

import { useId, useState } from 'react';
import { ChevronDown, MessageSquareReply, Plus, Sparkles, X } from 'lucide-react';
import { BOT_VARS, type BotRuleThen } from '@/crm/bot-engine';
import { blankRule, NEW_STAGE, type UiRule } from '@/crm/bot-form';

type Option = { id: string; name: string };
export type RuleRefs = { stages: Option[]; tags: Option[]; team: Option[] };

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const areaCls =
  'w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Botões que põem `{primeiro_nome}` e companhia no fim do texto. */
export function VarChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Personalizar o texto">
      <span className="text-muted-foreground">Personalizar:</span>
      {BOT_VARS.map((v) => (
        <button
          key={v.token}
          type="button"
          onClick={() => onInsert(v.token)}
          className="rounded-md border border-dashed border-border px-1.5 py-0.5 text-muted-foreground hover:border-link hover:text-link focus-visible:outline-2 focus-visible:outline-ring"
        >
          + {v.label}
        </button>
      ))}
    </div>
  );
}

/** Põe a variável no fim do texto, com um espaço antes se precisar. */
export const juntar = (texto: string, token: string) => (texto && !/\s$/.test(texto) ? `${texto} ${token}` : `${texto}${token}`);

const THEN_MENU: { v: BotRuleThen; label: string }[] = [
  { v: 'stay', label: 'Continuar esperando (a pessoa ainda pode tocar nos botões)' },
  { v: 'menu', label: 'Mostrar os primeiros botões de novo' },
  { v: 'handoff', label: 'Chamar alguém da equipe' },
  { v: 'end', label: 'Encerrar o robô' },
];
const THEN_PERGUNTA: { v: BotRuleThen; label: string }[] = [
  { v: 'end', label: 'Encerrar o robô' },
  { v: 'menu', label: 'Mostrar os primeiros botões' },
  { v: 'handoff', label: 'Chamar alguém da equipe' },
  { v: 'stay', label: 'Esperar outra resposta' },
];

/**
 * Respostas personalizadas, como as condições do Salesbot do Kommo: "se a
 * pessoa escrever preço, valor ou quanto custa → o robô responde isto, põe a
 * tag e mostra os botões de novo". Vale a primeira que bater, na ordem.
 */
export function RulesEditor({
  rules,
  onChange,
  refs,
  context,
}: {
  rules: UiRule[];
  onChange: (r: UiRule[]) => void;
  refs: RuleRefs;
  /** Num menu, a regra vale quando a pessoa escreve em vez de tocar num botão; numa pergunta, olha a resposta. */
  context: 'menu' | 'question';
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const set = (i: number, patch: Partial<UiRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border-strong bg-background/30 p-3">
      <div className="flex items-start gap-2">
        <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0 text-link" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Respostas personalizadas</p>
          <p className="text-xs text-muted-foreground">
            {context === 'menu'
              ? 'Quando a pessoa escreve em vez de tocar num botão. Ex.: “preço, valor, quanto custa” → responde sobre valores.'
              : 'Conforme o que a pessoa responder. Ex.: “implante” → responde sobre implante e põe a tag. Sem palavra conhecida, vale a resposta acima.'}
          </p>
        </div>
      </div>
      {rules.length > 0 && (
        <ol className="space-y-2">
          {rules.map((r, i) => (
            <RuleCard
              key={r.id}
              n={i + 1}
              rule={r}
              open={aberta === r.id}
              onToggle={() => setAberta(aberta === r.id ? null : r.id)}
              onChange={(p) => set(i, p)}
              onRemove={() => onChange(rules.filter((_, j) => j !== i))}
              refs={refs}
              thens={context === 'menu' ? THEN_MENU : THEN_PERGUNTA}
            />
          ))}
        </ol>
      )}
      {rules.length < 20 && (
        <button
          type="button"
          onClick={() => {
            const nova = { ...blankRule(), then: context === 'menu' ? ('stay' as const) : ('end' as const) };
            onChange([...rules, nova]);
            setAberta(nova.id);
          }}
          className="btn-outline btn-sm"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar resposta personalizada
        </button>
      )}
    </div>
  );
}

function RuleCard({
  n,
  rule: r,
  open,
  onToggle,
  onChange,
  onRemove,
  refs,
  thens,
}: {
  n: number;
  rule: UiRule;
  open: boolean;
  onToggle: () => void;
  onChange: (p: Partial<UiRule>) => void;
  onRemove: () => void;
  refs: RuleRefs;
  thens: { v: BotRuleThen; label: string }[];
}) {
  const id = useId();
  const palavras = r.keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const resumo = palavras.length ? `Se escrever ${palavras.map((p) => `“${p}”`).join(', ')}` : 'Sem palavras ainda';
  return (
    <li className={`rounded-lg border bg-surface ${open ? 'border-link/60' : 'border-border'}`}>
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-corpo`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-link" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{resumo}</span>
            <span className="block truncate text-xs text-muted-foreground">{r.reply.trim() ? `responde “${r.reply.trim()}”` : 'sem resposta escrita'}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          <span className="sr-only">
            {open ? 'Fechar' : 'Abrir'} a resposta personalizada {n}
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Tirar a resposta personalizada ${n}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div id={`${id}-corpo`} className="space-y-3 border-t border-border p-3">
          <div>
            <label htmlFor={`${id}-palavras`} className="block text-xs font-medium text-muted-foreground">
              Se a pessoa escrever (palavras separadas por vírgula)
            </label>
            <input
              id={`${id}-palavras`}
              value={r.keywords}
              onChange={(e) => onChange({ keywords: e.target.value })}
              placeholder="preço, valor, quanto custa"
              className={`${inputCls} mt-1`}
            />
            <p className="mt-1 text-xs text-muted-foreground">Palavra inteira, sem ligar para acento e maiúscula; o plural também vale.</p>
          </div>
          <div>
            <label htmlFor={`${id}-resposta`} className="block text-xs font-medium text-muted-foreground">
              O robô responde
            </label>
            <textarea
              id={`${id}-resposta`}
              value={r.reply}
              onChange={(e) => onChange({ reply: e.target.value })}
              rows={2}
              maxLength={1000}
              placeholder="Ex.: Os valores dependem da avaliação, {primeiro_nome}. Quer agendar?"
              className={`${areaCls} mt-1`}
            />
            <div className="mt-1">
              <VarChips onInsert={(t) => onChange({ reply: juntar(r.reply, t) })} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-depois`} className="block text-xs font-medium text-muted-foreground">
                E depois
              </label>
              <select id={`${id}-depois`} value={r.then} onChange={(e) => onChange({ then: e.target.value as BotRuleThen })} className={`${inputCls} mt-1`}>
                {thens.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-etapa`} className="block text-xs text-muted-foreground">
                Funil
              </label>
              <select id={`${id}-etapa`} value={r.stage} onChange={(e) => onChange({ stage: e.target.value })} className={`${inputCls} mt-1`}>
                <option value="">Não mexe no funil</option>
                <option value={NEW_STAGE}>Cria o lead na entrada</option>
                {refs.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    Coloca na etapa {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-resp`} className="block text-xs text-muted-foreground">
                Responsável
              </label>
              <select id={`${id}-resp`} value={r.assignTo} onChange={(e) => onChange({ assignTo: e.target.value })} className={`${inputCls} mt-1`}>
                <option value="">Não muda</option>
                {refs.team.map((p) => (
                  <option key={p.id} value={p.id}>
                    Passa para {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {refs.tags.length > 0 && (
            <div role="group" aria-label="Tags que esta resposta põe">
              <p className="text-xs text-muted-foreground">Põe as tags</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {refs.tags.map((t) => {
                  const on = r.tagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange({ tagIds: on ? r.tagIds.filter((x) => x !== t.id) : [...r.tagIds, t.id] })}
                      className={`h-7 rounded-md border px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring ${on ? 'border-link bg-primary/15 text-link' : 'border-border text-muted-foreground'}`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
