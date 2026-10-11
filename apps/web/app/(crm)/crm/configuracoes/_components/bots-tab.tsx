'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Pencil, Plus, Trash2, X } from 'lucide-react';
import { blankOption, exampleMenu, type UiAfter, type UiAction, type UiMenu, type UiOption } from '@/crm/bot-form';
import { deleteBotAction, saveBotAction, toggleBotAction } from '../actions';

export type BotRow = {
  id: string;
  name: string;
  trigger: 'NEW_CONTACT' | 'KEYWORD';
  keywords: string[];
  active: boolean;
  menu: UiMenu;
};
type Option = { id: string; name: string };

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const areaCls =
  'w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Robôs por botões. Contato novo: responde a primeira mensagem de quem ninguém
 * conhece (ótimo fora do horário). Palavra-chave: quando alguém manda "menu".
 */
export function BotsTab({ bots, stages, tags, team }: { bots: BotRow[]; stages: Option[]; tags: Option[]; team: Option[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState<BotRow | 'novo' | null>(null);

  const agir = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string, fechar = false) =>
    start(async () => {
      const r = await fn();
      setAviso(r.ok ? ok : r.message ?? 'Não foi possível.');
      if (r.ok) {
        if (fechar) setEditando(null);
        router.refresh();
      }
    });

  if (editando) {
    return (
      <BotEditor
        bot={editando === 'novo' ? null : editando}
        stages={stages}
        tags={tags}
        team={team}
        pending={pending}
        aviso={aviso}
        onCancel={() => setEditando(null)}
        onSave={(input) => agir(() => saveBotAction(input), 'Robô salvo.', true)}
      />
    );
  }

  return (
    <section aria-label="Robôs">
      <p className="text-xs text-muted-foreground">
        O robô responde com um menu de opções. Ele para quando alguém da equipe responde, quando a pessoa escolhe falar com a equipe, se não
        entender duas vezes ou depois de 24 horas parado.
      </p>
      <ul className="mt-3 space-y-2">
        {bots.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
            <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{b.name}</p>
              <p className="text-xs text-muted-foreground">
                {b.trigger === 'NEW_CONTACT' ? 'Responde a primeira mensagem de números novos' : `Quando escrevem: ${b.keywords.join(', ')}`} ·{' '}
                {b.menu.options.length} opções
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={b.active}
                disabled={pending}
                onChange={(e) => agir(() => toggleBotAction(b.id, e.target.checked), e.target.checked ? `${b.name} ligado.` : `${b.name} desligado.`)}
                className="h-4 w-4 accent-primary"
              />
              Ligado<span className="sr-only">: {b.name}</span>
            </label>
            <button type="button" onClick={() => setEditando(b)} className="btn-ghost btn-sm">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar<span className="sr-only"> {b.name}</span>
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => window.confirm(`Apagar o robô ${b.name}?`) && agir(() => deleteBotAction(b.id), 'Robô apagado.')}
              aria-label={`Apagar ${b.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {bots.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nenhum robô ainda.</p>}
      <button type="button" onClick={() => setEditando('novo')} className="btn-primary btn-md mt-3">
        <Plus className="h-4 w-4" aria-hidden="true" /> Novo robô
      </button>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">
        {aviso}
      </p>
    </section>
  );
}

function BotEditor({
  bot,
  stages,
  tags,
  team,
  pending,
  aviso,
  onCancel,
  onSave,
}: {
  bot: BotRow | null;
  stages: Option[];
  tags: Option[];
  team: Option[];
  pending: boolean;
  aviso: string;
  onCancel: () => void;
  onSave: (i: { id?: string; name: string; trigger: 'NEW_CONTACT' | 'KEYWORD'; keywords: string; menu: UiMenu; active: boolean }) => void;
}) {
  const id = useId();
  const [nome, setNome] = useState(bot?.name ?? 'Boas-vindas');
  const [trigger, setTrigger] = useState<'NEW_CONTACT' | 'KEYWORD'>(bot?.trigger ?? 'NEW_CONTACT');
  const [keywords, setKeywords] = useState((bot?.keywords ?? ['menu']).join(', '));
  const [menu, setMenu] = useState<UiMenu>(bot?.menu ?? exampleMenu());
  const [ativo, setAtivo] = useState(bot?.active ?? true);

  return (
    <form
      aria-label={bot ? `Editar ${bot.name}` : 'Novo robô'}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ id: bot?.id, name: nome, trigger, keywords, menu, active: ativo });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">Nome do robô</label>
          <input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} className={`${inputCls} mt-1`} />
        </div>
        <div>
          <label htmlFor={`${id}-gatilho`} className="block text-xs font-medium text-muted-foreground">Quando responde</label>
          <select id={`${id}-gatilho`} value={trigger} onChange={(e) => setTrigger(e.target.value as 'NEW_CONTACT' | 'KEYWORD')} className={`${inputCls} mt-1`}>
            <option value="NEW_CONTACT">Primeira mensagem de um número novo</option>
            <option value="KEYWORD">Quando a pessoa escreve uma palavra-chave</option>
          </select>
        </div>
      </div>
      {trigger === 'KEYWORD' && (
        <div>
          <label htmlFor={`${id}-palavras`} className="block text-xs font-medium text-muted-foreground">Palavras-chave (separadas por vírgula)</label>
          <input id={`${id}-palavras`} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="menu, oi, olá" className={`${inputCls} mt-1`} />
        </div>
      )}

      <MenuEditor menu={menu} onChange={setMenu} stages={stages} tags={tags} team={team} level={0} />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 accent-primary" />
        Ligado
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn-primary btn-md">
          {pending ? 'Salvando…' : 'Salvar robô'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost btn-md">
          Cancelar
        </button>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {aviso}
      </p>
    </form>
  );
}

const ACTION_LABEL: Record<UiAction, string> = {
  none: 'Nenhuma ação',
  createLead: 'Criar o lead na etapa…',
  tag: 'Pôr a tag…',
  stage: 'Mover o lead para a etapa…',
  assign: 'Passar o lead para…',
};

function MenuEditor({
  menu,
  onChange,
  stages,
  tags,
  team,
  level,
}: {
  menu: UiMenu;
  onChange: (m: UiMenu) => void;
  stages: Option[];
  tags: Option[];
  team: Option[];
  level: 0 | 1;
}) {
  const id = useId();
  const setOpt = (i: number, patch: Partial<UiOption>) => onChange({ ...menu, options: menu.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const afters: { value: UiAfter; label: string }[] = [
    { value: 'end', label: 'Terminar o robô' },
    { value: 'menu', label: level === 0 ? 'Mostrar o menu de novo' : 'Voltar ao menu principal' },
    ...(level === 0 ? [{ value: 'sub' as const, label: 'Abrir um submenu' }] : []),
    { value: 'handoff', label: 'Passar para a equipe' },
  ];

  return (
    <fieldset className={`space-y-3 rounded-xl border border-border p-4 ${level ? 'bg-surface-alt/40' : 'bg-surface'}`}>
      <legend className="px-1 text-sm font-semibold">{level ? 'Submenu' : 'Menu'}</legend>
      <div>
        <label htmlFor={`${id}-texto`} className="block text-xs font-medium text-muted-foreground">Mensagem (as opções vão numeradas embaixo)</label>
        <textarea id={`${id}-texto`} value={menu.text} onChange={(e) => onChange({ ...menu, text: e.target.value })} rows={2} maxLength={1000} className={`${areaCls} mt-1`} />
      </div>
      <ol className="space-y-3">
        {menu.options.map((o, i) => (
          <li key={o.id} className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
            <div className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-sm font-semibold text-muted-foreground" aria-hidden="true">{i + 1}</span>
              <label htmlFor={`${id}-${o.id}-label`} className="sr-only">Nome da opção {i + 1}</label>
              <input
                id={`${id}-${o.id}-label`}
                value={o.label}
                onChange={(e) => setOpt(i, { label: e.target.value })}
                maxLength={24}
                placeholder="Nome da opção (até 24 letras)"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => onChange({ ...menu, options: menu.options.filter((_, j) => j !== i) })}
                aria-label={`Tirar a opção ${i + 1}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <label htmlFor={`${id}-${o.id}-reply`} className="sr-only">Resposta da opção {i + 1}</label>
            <textarea
              id={`${id}-${o.id}-reply`}
              value={o.reply}
              onChange={(e) => setOpt(i, { reply: e.target.value })}
              rows={2}
              maxLength={1000}
              placeholder="O que o robô responde (opcional)"
              className={areaCls}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-${o.id}-acao`} className="block text-xs font-medium text-muted-foreground">Ação no CRM</label>
                <select
                  id={`${id}-${o.id}-acao`}
                  value={o.action}
                  onChange={(e) => setOpt(i, { action: e.target.value as UiAction, target: '' })}
                  className={`${inputCls} mt-1`}
                >
                  {(Object.keys(ACTION_LABEL) as UiAction[]).map((a) => (
                    <option key={a} value={a}>
                      {ACTION_LABEL[a]}
                    </option>
                  ))}
                </select>
              </div>
              {o.action !== 'none' && (
                <div>
                  <label htmlFor={`${id}-${o.id}-alvo`} className="block text-xs font-medium text-muted-foreground">
                    {o.action === 'tag' ? 'Tag' : o.action === 'assign' ? 'Pessoa' : 'Etapa'}
                  </label>
                  <select id={`${id}-${o.id}-alvo`} value={o.target} onChange={(e) => setOpt(i, { target: e.target.value })} className={`${inputCls} mt-1`}>
                    {o.action === 'createLead' && <option value="">Novo (padrão)</option>}
                    {o.action !== 'createLead' && <option value="">Escolha…</option>}
                    {(o.action === 'tag' ? tags : o.action === 'assign' ? team : stages).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label htmlFor={`${id}-${o.id}-depois`} className="block text-xs font-medium text-muted-foreground">Depois</label>
              <select
                id={`${id}-${o.id}-depois`}
                value={o.after}
                onChange={(e) => {
                  const after = e.target.value as UiAfter;
                  setOpt(i, { after, ...(after === 'sub' && !o.sub ? { sub: { text: 'Escolha uma opção:', options: [blankOption()] } } : {}) });
                }}
                className={`${inputCls} mt-1 sm:max-w-xs`}
              >
                {afters.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            {o.after === 'sub' && o.sub && level === 0 && (
              <MenuEditor menu={o.sub} onChange={(sub) => setOpt(i, { sub })} stages={stages} tags={tags} team={team} level={1} />
            )}
          </li>
        ))}
      </ol>
      {menu.options.length < 10 && (
        <button type="button" onClick={() => onChange({ ...menu, options: [...menu.options, blankOption()] })} className="btn-outline btn-sm">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar opção
        </button>
      )}
    </fieldset>
  );
}
