'use client';

import { useId } from 'react';
import { Copy, Play, Plus, Trash2, X } from 'lucide-react';
import type { ActionStep, ConditionStep, FlowAction, FlowRule, FlowStep, MessageStep, ValidateCheck } from '@/crm/flow-engine';
import { newId, STEP_META } from '@/crm/flow-templates';
import type { FlowRefs } from './flow-refs';

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const areaCls = 'w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const labelCls = 'block text-xs font-medium text-muted-foreground';

export const FLOW_VARS = [
  { token: '{{primeiro_nome}}', label: 'Primeiro nome' },
  { token: '{{nome}}', label: 'Nome completo' },
  { token: '{{clinica}}', label: 'Clínica' },
  { token: '{{ultima_mensagem}}', label: 'Última mensagem' },
];

const juntar = (t: string, token: string) => (t && !/\s$/.test(t) ? `${t} ${token}` : `${t}${token}`);

function VarChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Personalizar o texto">
      <span className="text-muted-foreground">Inserir:</span>
      {FLOW_VARS.map((v) => (
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

/** Minutos com unidade (min, horas, dias). */
function Duracao({ id, value, onChange, label }: { id: string; value: number; onChange: (m: number) => void; label: string }) {
  const unidade = value % 1440 === 0 ? 1440 : value % 60 === 0 ? 60 : 1;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={1}
        value={Math.max(1, Math.round(value / unidade))}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1) * unidade)}
        className={`${inputCls} w-24`}
      />
      <label htmlFor={`${id}-u`} className="sr-only">
        Unidade de {label}
      </label>
      <select id={`${id}-u`} value={unidade} onChange={(e) => onChange(Math.max(1, Math.round(value / unidade)) * Number(e.target.value))} className={`${inputCls} w-auto`}>
        <option value={1}>minutos</option>
        <option value={60}>horas</option>
        <option value={1440}>dias</option>
      </select>
    </div>
  );
}

/** O painel do passo clicado no quadro. */
export function StepPanel({
  step,
  n,
  isStart,
  steps,
  refs,
  onChange,
  onDelete,
  onDuplicate,
  onMakeStart,
  onClose,
}: {
  step: FlowStep;
  n: number;
  isStart: boolean;
  /** Todos os passos, para "ir para o passo" (com o número). */
  steps: { id: string; n: number; label: string }[];
  refs: FlowRefs;
  onChange: (s: FlowStep) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMakeStart: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const meta = STEP_META[step.type];
  return (
    <section aria-labelledby={`${id}-t`} className="flex h-full flex-col">
      <div className="flex items-start gap-2 border-b border-border px-4 py-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${meta.tone}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-t`} className="text-sm font-semibold">
            Passo {n} · {meta.label}
          </h2>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar o painel do passo" className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {step.type === 'message' && <MessageForm step={step} onChange={onChange} />}
        {step.type === 'condition' && <ConditionForm step={step} refs={refs} onChange={onChange} />}
        {step.type === 'pause' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={step.waitMessage} onChange={(e) => onChange({ ...step, waitMessage: e.target.checked })} className="h-4 w-4 accent-primary" />
              Até a pessoa escrever
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={step.minutes != null} onChange={(e) => onChange({ ...step, minutes: e.target.checked ? 60 : null })} className="h-4 w-4 accent-primary" />
              Até passar um tempo
            </label>
            {step.minutes != null && <Duracao id={`${id}-pausa`} label="Tempo da pausa" value={step.minutes} onChange={(m) => onChange({ ...step, minutes: m })} />}
            <p className="text-xs text-muted-foreground">Vale o que acontecer primeiro. Cada um tem a sua saída no quadro.</p>
          </div>
        )}
        {step.type === 'validate' && (
          <div className="space-y-3">
            <div>
              <label htmlFor={`${id}-check`} className={labelCls}>
                A última mensagem da pessoa precisa ser
              </label>
              <select id={`${id}-check`} value={step.check} onChange={(e) => onChange({ ...step, check: e.target.value as ValidateCheck })} className={`${inputCls} mt-1`}>
                <option value="email">Um e-mail</option>
                <option value="phone">Um telefone</option>
                <option value="number">Um número</option>
                <option value="cpf">Um CPF válido</option>
                <option value="contains">Ter alguma destas palavras</option>
                <option value="equals">Igual a</option>
                <option value="minLength">Ter pelo menos N letras</option>
              </select>
            </div>
            {(step.check === 'contains' || step.check === 'equals' || step.check === 'minLength') && (
              <div>
                <label htmlFor={`${id}-val`} className={labelCls}>
                  {step.check === 'minLength' ? 'Quantas letras' : 'Palavras (separadas por vírgula)'}
                </label>
                <input id={`${id}-val`} value={step.value ?? ''} onChange={(e) => onChange({ ...step, value: e.target.value })} className={`${inputCls} mt-1`} />
              </div>
            )}
          </div>
        )}
        {step.type === 'action' && <ActionForm step={step} refs={refs} onChange={onChange} />}
        {step.type === 'goto' && (
          <div className="space-y-3">
            <div>
              <label htmlFor={`${id}-alvo`} className={labelCls}>
                Ir para
              </label>
              <select id={`${id}-alvo`} value={step.target} onChange={(e) => onChange({ ...step, target: e.target.value })} className={`${inputCls} mt-1`}>
                <option value="">Escolha o passo</option>
                {steps
                  .filter((s) => s.id !== step.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      Passo {s.n} · {s.label}
                    </option>
                  ))}
              </select>
            </div>
            <fieldset>
              <legend className={labelCls}>Ao chegar lá</legend>
              {(
                [
                  ['send', 'Mandar a mensagem de novo'],
                  ['silent', 'Esperar a resposta sem repetir a mensagem'],
                  ['retry', '"Não entendi" e os botões; na segunda vez, chama a equipe'],
                ] as const
              ).map(([v, l]) => (
                <label key={v} className="mt-1.5 flex items-start gap-2 text-sm">
                  <input type="radio" name={`${id}-modo`} checked={step.mode === v} onChange={() => onChange({ ...step, mode: v })} className="mt-0.5 h-4 w-4 accent-primary" />
                  {l}
                </label>
              ))}
            </fieldset>
          </div>
        )}
        {step.type === 'startBot' && (
          <div>
            <label htmlFor={`${id}-bot`} className={labelCls}>
              Robô
            </label>
            <select id={`${id}-bot`} value={step.botId} onChange={(e) => onChange({ ...step, botId: e.target.value })} className={`${inputCls} mt-1`}>
              <option value="">Escolha o robô</option>
              {refs.bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {refs.bots.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Salve outro robô antes para poder escolher aqui.</p>}
          </div>
        )}
        {step.type === 'roundRobin' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Cada conversa vai para o próximo caminho da lista, em ordem (1, 2, 1, 2…).</p>
            {step.options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <label htmlFor={`${id}-rr-${o.id}`} className="sr-only">
                  Nome do caminho {i + 1}
                </label>
                <input
                  id={`${id}-rr-${o.id}`}
                  value={o.label}
                  onChange={(e) => onChange({ ...step, options: step.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })}
                  className={inputCls}
                />
                {step.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...step, options: step.options.filter((x) => x.id !== o.id) })}
                    aria-label={`Tirar o caminho ${i + 1}`}
                    className="rounded-md p-2 text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {step.options.length < 10 && (
              <button type="button" onClick={() => onChange({ ...step, options: [...step.options, { id: newId('r'), label: `Opção ${step.options.length + 1}` }] })} className="btn-outline btn-sm">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Caminho
              </button>
            )}
          </div>
        )}
        {step.type === 'handoff' && (
          <div>
            <label htmlFor={`${id}-txt`} className={labelCls}>
              Mensagem de despedida (opcional)
            </label>
            <textarea id={`${id}-txt`} rows={3} value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} placeholder="Já vou chamar alguém da equipe para te ajudar. 😊" className={`${areaCls} mt-1`} />
            <VarChips onInsert={(t) => onChange({ ...step, text: juntar(step.text, t) })} />
          </div>
        )}
        {step.type === 'stop' && <p className="text-sm text-muted-foreground">O robô termina aqui, sem mandar nada.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {!isStart && (
          <button type="button" onClick={onMakeStart} className="btn-ghost btn-sm">
            <Play className="h-3.5 w-3.5" aria-hidden="true" /> Começar por aqui
          </button>
        )}
        <button type="button" onClick={onDuplicate} className="btn-ghost btn-sm">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Duplicar
        </button>
        <button type="button" onClick={onDelete} className="btn-ghost btn-sm ml-auto text-destructive">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Apagar passo
        </button>
      </div>
    </section>
  );
}

function MessageForm({ step, onChange }: { step: MessageStep; onChange: (s: MessageStep) => void }) {
  const id = useId();
  const espera = step.buttons.length > 0 || step.waitReply;
  const setBtn = (bid: string, patch: Partial<MessageStep['buttons'][number]>) =>
    onChange({ ...step, buttons: step.buttons.map((b) => (b.id === bid ? { ...b, ...patch } : b)) });
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${id}-texto`} className={labelCls}>
          Mensagem
        </label>
        <textarea id={`${id}-texto`} rows={4} maxLength={1000} value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} className={`${areaCls} mt-1`} />
        <VarChips onInsert={(t) => onChange({ ...step, text: juntar(step.text, t) })} />
      </div>

      <fieldset>
        <legend className={labelCls}>Botões (até 10; no WhatsApp, até 3 aparecem como botão e mais viram lista)</legend>
        <div className="mt-1.5 space-y-2">
          {step.buttons.map((b, i) => (
            <div key={b.id} className="rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                <label htmlFor={`${id}-b-${b.id}`} className="sr-only">
                  Texto do botão {i + 1}
                </label>
                <input
                  id={`${id}-b-${b.id}`}
                  value={b.label}
                  maxLength={24}
                  placeholder={`Botão ${i + 1}`}
                  onChange={(e) => setBtn(b.id, { label: e.target.value })}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...step, buttons: step.buttons.filter((x) => x.id !== b.id), out: { ...step.out, [`b:${b.id}`]: undefined } })}
                  aria-label={`Tirar o botão ${i + 1}`}
                  className="rounded-md p-2 text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <label htmlFor={`${id}-s-${b.id}`} className="mt-1.5 block text-[11px] text-muted-foreground">
                Sinônimos (palavras que também valem, separadas por vírgula)
              </label>
              <input
                id={`${id}-s-${b.id}`}
                value={b.synonyms.join(', ')}
                placeholder="sim, quero, pode ser"
                onChange={(e) => setBtn(b.id, { synonyms: e.target.value.split(',').map((x) => x.trimStart()) })}
                onBlur={(e) => setBtn(b.id, { synonyms: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                className={`${inputCls} mt-0.5 h-8 text-xs`}
              />
            </div>
          ))}
        </div>
        {step.buttons.length < 10 && (
          <button
            type="button"
            onClick={() => onChange({ ...step, buttons: [...step.buttons, { id: newId('b'), label: '', synonyms: [] }], waitReply: true })}
            className="btn-outline btn-sm mt-2"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Botão
          </button>
        )}
      </fieldset>

      <div className="space-y-2 rounded-lg bg-surface-alt/50 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={espera}
            disabled={step.buttons.length > 0}
            onChange={(e) => onChange({ ...step, waitReply: e.target.checked, timeoutMinutes: e.target.checked ? step.timeoutMinutes : null })}
            className="h-4 w-4 accent-primary"
          />
          Esperar a resposta {step.buttons.length > 0 && <span className="text-xs text-muted-foreground">(com botões, sempre)</span>}
        </label>
        {espera && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={step.timeoutMinutes != null} onChange={(e) => onChange({ ...step, timeoutMinutes: e.target.checked ? 60 : null })} className="h-4 w-4 accent-primary" />
              Se não responder em
            </label>
            {step.timeoutMinutes != null && <Duracao id={`${id}-tempo`} label="Tempo sem resposta" value={step.timeoutMinutes} onChange={(m) => onChange({ ...step, timeoutMinutes: m })} />}
            <p className="text-xs text-muted-foreground">
              Saídas no quadro: uma por botão, &quot;Outra resposta&quot;{step.timeoutMinutes != null ? ' e "Sem resposta"' : ''}. Sem nada ligado em &quot;Outra resposta&quot;, o robô diz &quot;não entendi&quot; uma vez e depois chama a equipe.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const SUBJECTS: { v: FlowRule['subject']; label: string }[] = [
  { v: 'message', label: 'A mensagem da pessoa' },
  { v: 'tag', label: 'Tag do lead' },
  { v: 'stage', label: 'Etapa do lead' },
  { v: 'source', label: 'Origem do lead' },
  { v: 'field', label: 'Campo personalizado' },
  { v: 'hours', label: 'Horário de atendimento' },
];
const OPS: Record<FlowRule['subject'], { v: string; label: string }[]> = {
  message: [
    { v: 'contains', label: 'tem alguma destas palavras' },
    { v: 'equals', label: 'é igual a' },
    { v: 'starts', label: 'começa com' },
    { v: 'empty', label: 'está vazia' },
    { v: 'notEmpty', label: 'não está vazia' },
  ],
  tag: [
    { v: 'has', label: 'tem' },
    { v: 'hasNot', label: 'não tem' },
  ],
  stage: [
    { v: 'is', label: 'é' },
    { v: 'isNot', label: 'não é' },
  ],
  source: [
    { v: 'is', label: 'é' },
    { v: 'isNot', label: 'não é' },
  ],
  field: [
    { v: 'equals', label: 'é igual a' },
    { v: 'filled', label: 'está preenchido' },
    { v: 'empty', label: 'está vazio' },
  ],
  hours: [
    { v: 'inside', label: 'a clínica está atendendo' },
    { v: 'outside', label: 'a clínica está fechada' },
  ],
};
const ORIGENS = [
  ['WHATSAPP', 'WhatsApp'],
  ['INSTAGRAM', 'Instagram'],
  ['SITE', 'Site'],
  ['INDICACAO', 'Indicação'],
  ['MANUAL', 'Cadastro manual'],
  ['OUTRO', 'Outro'],
] as const;

function ConditionForm({ step, refs, onChange }: { step: ConditionStep; refs: FlowRefs; onChange: (s: ConditionStep) => void }) {
  const id = useId();
  const setCase = (cid: string, patch: Partial<ConditionStep['cases'][number]>) => onChange({ ...step, cases: step.cases.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Vale o primeiro caso que bater. Nenhum? Segue por &quot;Senão&quot;.</p>
      {step.cases.map((c, ci) => (
        <fieldset key={c.id} className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold">Caso {ci + 1}</legend>
          <div className="flex items-center gap-2">
            <label htmlFor={`${id}-${c.id}-nome`} className="sr-only">
              Nome do caso {ci + 1}
            </label>
            <input id={`${id}-${c.id}-nome`} value={c.label ?? ''} placeholder={`Caso ${ci + 1} (nome no quadro)`} onChange={(e) => setCase(c.id, { label: e.target.value })} className={inputCls} />
            {step.cases.length > 1 && (
              <button
                type="button"
                onClick={() => onChange({ ...step, cases: step.cases.filter((x) => x.id !== c.id), out: { ...step.out, [`c:${c.id}`]: undefined } })}
                aria-label={`Tirar o caso ${ci + 1}`}
                className="rounded-md p-2 text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          {c.rules.length > 1 && (
            <div>
              <label htmlFor={`${id}-${c.id}-match`} className="sr-only">
                Como juntar as regras do caso {ci + 1}
              </label>
              <select id={`${id}-${c.id}-match`} value={c.match} onChange={(e) => setCase(c.id, { match: e.target.value as 'all' | 'any' })} className={`${inputCls} h-8 text-xs`}>
                <option value="all">Todas as regras abaixo</option>
                <option value="any">Qualquer uma das regras abaixo</option>
              </select>
            </div>
          )}
          {c.rules.map((r, ri) => {
            const set = (patch: Partial<FlowRule>) => setCase(c.id, { rules: c.rules.map((x, j) => (j === ri ? { ...x, ...patch } : x)) });
            const base = `${id}-${c.id}-${ri}`;
            return (
              <div key={ri} className="space-y-1.5 rounded-md bg-surface-alt/50 p-2">
                <div className="flex items-center gap-1.5">
                  <label htmlFor={`${base}-s`} className="sr-only">
                    O que conferir
                  </label>
                  <select
                    id={`${base}-s`}
                    value={r.subject}
                    onChange={(e) => {
                      const subject = e.target.value as FlowRule['subject'];
                      set({ subject, op: OPS[subject][0].v, value: '', ref: undefined });
                    }}
                    className={`${inputCls} h-8 text-xs`}
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s.v} value={s.v}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  {c.rules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCase(c.id, { rules: c.rules.filter((_, j) => j !== ri) })}
                      aria-label="Tirar esta regra"
                      className="rounded-md p-1.5 text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <label htmlFor={`${base}-o`} className="sr-only">
                  Comparação
                </label>
                <select id={`${base}-o`} value={r.op} onChange={(e) => set({ op: e.target.value })} className={`${inputCls} h-8 text-xs`}>
                  {OPS[r.subject].map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {r.subject === 'message' && !['empty', 'notEmpty'].includes(r.op) && (
                  <>
                    <label htmlFor={`${base}-v`} className="sr-only">
                      Palavras
                    </label>
                    <input id={`${base}-v`} value={r.value ?? ''} placeholder="preço, valor, quanto custa" onChange={(e) => set({ value: e.target.value })} className={`${inputCls} h-8 text-xs`} />
                  </>
                )}
                {(r.subject === 'tag' || r.subject === 'stage' || r.subject === 'field') && (
                  <>
                    <label htmlFor={`${base}-r`} className="sr-only">
                      {r.subject === 'tag' ? 'Tag' : r.subject === 'stage' ? 'Etapa' : 'Campo'}
                    </label>
                    <select id={`${base}-r`} value={r.ref ?? ''} onChange={(e) => set({ ref: e.target.value })} className={`${inputCls} h-8 text-xs`}>
                      <option value="">Escolha…</option>
                      {(r.subject === 'tag' ? refs.tags : r.subject === 'stage' ? refs.stages : refs.fields).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {r.subject === 'field' && r.op === 'equals' && (
                  <>
                    <label htmlFor={`${base}-fv`} className="sr-only">
                      Valor do campo
                    </label>
                    <input id={`${base}-fv`} value={r.value ?? ''} placeholder="Valor" onChange={(e) => set({ value: e.target.value })} className={`${inputCls} h-8 text-xs`} />
                  </>
                )}
                {r.subject === 'source' && (
                  <>
                    <label htmlFor={`${base}-src`} className="sr-only">
                      Origem
                    </label>
                    <select id={`${base}-src`} value={r.value ?? ''} onChange={(e) => set({ value: e.target.value })} className={`${inputCls} h-8 text-xs`}>
                      <option value="">Escolha…</option>
                      {ORIGENS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => setCase(c.id, { rules: [...c.rules, { subject: 'message', op: 'contains', value: '' }] })} className="btn-ghost btn-sm">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Regra
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...step, cases: [...step.cases, { id: newId('c'), label: '', match: 'any', rules: [{ subject: 'message', op: 'contains', value: '' }] }] })}
        className="btn-outline btn-sm"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Caso
      </button>
    </div>
  );
}

const ACTION_TYPES: { v: FlowAction['type']; label: string }[] = [
  { v: 'createLead', label: 'Criar o lead' },
  { v: 'stage', label: 'Mudar a etapa' },
  { v: 'tag', label: 'Pôr tag' },
  { v: 'untag', label: 'Tirar tag' },
  { v: 'setField', label: 'Preencher campo' },
  { v: 'assign', label: 'Trocar o responsável' },
  { v: 'task', label: 'Criar tarefa' },
  { v: 'note', label: 'Anotar no histórico' },
  { v: 'notify', label: 'Avisar a equipe' },
];

function blankAction(t: FlowAction['type']): FlowAction {
  switch (t) {
    case 'createLead':
      return { type: 'createLead' };
    case 'stage':
      return { type: 'stage', stageId: '' };
    case 'tag':
      return { type: 'tag', tagId: '' };
    case 'untag':
      return { type: 'untag', tagId: '' };
    case 'setField':
      return { type: 'setField', field: 'name', from: 'lastMessage' };
    case 'assign':
      return { type: 'assign', userId: '' };
    case 'task':
      return { type: 'task', text: '', dueMinutes: 60 };
    case 'note':
      return { type: 'note', text: '' };
    case 'notify':
      return { type: 'notify', text: '' };
  }
}

function ActionForm({ step, refs, onChange }: { step: ActionStep; refs: FlowRefs; onChange: (s: ActionStep) => void }) {
  const id = useId();
  const set = (i: number, a: FlowAction) => onChange({ ...step, actions: step.actions.map((x, j) => (j === i ? a : x)) });
  return (
    <div className="space-y-3">
      {step.actions.map((a, i) => {
        const base = `${id}-${i}`;
        return (
          <div key={i} className="space-y-1.5 rounded-lg border border-border p-2.5">
            <div className="flex items-center gap-1.5">
              <label htmlFor={`${base}-t`} className="sr-only">
                Ação {i + 1}
              </label>
              <select id={`${base}-t`} value={a.type} onChange={(e) => set(i, blankAction(e.target.value as FlowAction['type']))} className={`${inputCls} h-8 text-xs font-medium`}>
                {ACTION_TYPES.map((t) => (
                  <option key={t.v} value={t.v}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange({ ...step, actions: step.actions.filter((_, j) => j !== i) })}
                aria-label={`Tirar a ação ${i + 1}`}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {(a.type === 'stage' || a.type === 'createLead') && (
              <>
                <label htmlFor={`${base}-st`} className="sr-only">
                  Etapa
                </label>
                <select
                  id={`${base}-st`}
                  value={a.stageId ?? ''}
                  onChange={(e) => set(i, a.type === 'stage' ? { ...a, stageId: e.target.value } : { type: 'createLead', ...(e.target.value ? { stageId: e.target.value } : {}) })}
                  className={`${inputCls} h-8 text-xs`}
                >
                  <option value="">{a.type === 'createLead' ? 'Na entrada do funil' : 'Escolha a etapa'}</option>
                  {refs.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {(a.type === 'tag' || a.type === 'untag') && (
              <>
                <label htmlFor={`${base}-tg`} className="sr-only">
                  Tag
                </label>
                <select id={`${base}-tg`} value={a.tagId} onChange={(e) => set(i, { ...a, tagId: e.target.value })} className={`${inputCls} h-8 text-xs`}>
                  <option value="">Escolha a tag</option>
                  {refs.tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {a.type === 'assign' && (
              <>
                <label htmlFor={`${base}-us`} className="sr-only">
                  Responsável
                </label>
                <select id={`${base}-us`} value={a.userId} onChange={(e) => set(i, { ...a, userId: e.target.value })} className={`${inputCls} h-8 text-xs`}>
                  <option value="">Escolha a pessoa</option>
                  {refs.team.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {a.type === 'setField' && (
              <>
                <label htmlFor={`${base}-f`} className="sr-only">
                  Campo
                </label>
                <select id={`${base}-f`} value={a.field} onChange={(e) => set(i, { ...a, field: e.target.value as typeof a.field })} className={`${inputCls} h-8 text-xs`}>
                  <option value="name">Nome do lead</option>
                  <option value="email">E-mail do lead</option>
                  <option value="note">Anotação no histórico</option>
                  {refs.fields.map((f) => (
                    <option key={f.id} value={`field:${f.id}`}>
                      Campo: {f.name}
                    </option>
                  ))}
                </select>
                <label htmlFor={`${base}-from`} className="sr-only">
                  Com o quê
                </label>
                <select id={`${base}-from`} value={a.from} onChange={(e) => set(i, { ...a, from: e.target.value as 'lastMessage' | 'value' })} className={`${inputCls} h-8 text-xs`}>
                  <option value="lastMessage">Com a última mensagem da pessoa</option>
                  <option value="value">Com um valor fixo</option>
                </select>
                {a.from === 'value' && (
                  <>
                    <label htmlFor={`${base}-fv`} className="sr-only">
                      Valor
                    </label>
                    <input id={`${base}-fv`} value={a.value ?? ''} placeholder="Valor" onChange={(e) => set(i, { ...a, value: e.target.value })} className={`${inputCls} h-8 text-xs`} />
                  </>
                )}
              </>
            )}
            {(a.type === 'task' || a.type === 'note' || a.type === 'notify') && (
              <>
                <label htmlFor={`${base}-tx`} className="sr-only">
                  {a.type === 'task' ? 'Texto da tarefa' : a.type === 'note' ? 'Texto da anotação' : 'Mensagem para a equipe'}
                </label>
                <input
                  id={`${base}-tx`}
                  value={a.text}
                  placeholder={a.type === 'task' ? 'Ligar para a pessoa' : a.type === 'note' ? 'O que anotar' : 'O que a equipe precisa saber'}
                  onChange={(e) => set(i, { ...a, text: e.target.value })}
                  className={`${inputCls} h-8 text-xs`}
                />
                {a.type === 'task' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Prazo:</span>
                    <Duracao id={`${base}-due`} label="Prazo da tarefa" value={Math.max(1, a.dueMinutes)} onChange={(m) => set(i, { ...a, dueMinutes: m })} />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      <div>
        <label htmlFor={`${id}-nova`} className="sr-only">
          Adicionar ação
        </label>
        <select
          id={`${id}-nova`}
          value=""
          onChange={(e) => e.target.value && onChange({ ...step, actions: [...step.actions, blankAction(e.target.value as FlowAction['type'])] })}
          className={`${inputCls} border-dashed`}
        >
          <option value="">+ Adicionar ação…</option>
          {ACTION_TYPES.map((t) => (
            <option key={t.v} value={t.v}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
