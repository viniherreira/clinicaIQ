'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Bot, ChevronDown, Clock, Copy, MessageSquareText, Pencil, Plus, Sparkles, Tag, Trash2, Users, X, Zap } from 'lucide-react';
import { DEFAULT_HOURS, EMPTY_AUDIENCE, type BotAudience, type BotHours } from '@/crm/bot-engine';
import { colorClasses } from '@/crm/colors';
import {
  BOT_TEMPLATES, blankOption, blankQuestion, NEW_STAGE,
  type UiAfter, type UiMenu, type UiOption, type UiQuestion, type UiQuestionAfter,
} from '@/crm/bot-form';
import { deleteBotAction, saveBotAction, toggleBotAction } from '../actions';
import { BotSimulator } from './bot-simulator';

export type BotRow = {
  id: string;
  name: string;
  trigger: 'NEW_CONTACT' | 'KEYWORD';
  keywords: string[];
  active: boolean;
  menu: UiMenu;
  hours: BotHours;
  audience: BotAudience;
};
type Option = { id: string; name: string };
type TagOption = Option & { color?: string };
export type BotRefs = { stages: Option[]; tags: TagOption[]; team: Option[]; fields?: Option[] };

/** As tags que os botões do robô põem no lead (menu e submenus). */
function tagsPostas(menu: UiMenu): string[] {
  const out = new Set<string>();
  const ler = (m: UiMenu) => {
    for (const o of m.options) {
      o.tagIds.forEach((t) => out.add(t));
      if (o.sub) ler(o.sub);
    }
  };
  ler(menu);
  return [...out];
}

function TagChips({ ids, tags, label }: { ids: string[]; tags: TagOption[]; label: string }) {
  const lista = ids.map((id) => tags.find((t) => t.id === id)).filter((t): t is TagOption => Boolean(t));
  if (lista.length === 0) return null;
  return (
    <ul className="inline-flex flex-wrap gap-1" aria-label={label}>
      {lista.map((t) => (
        <li key={t.id} className={`rounded-[4px] px-1.5 py-0.5 text-xs font-medium ${colorClasses(t.color ?? 'gray').chip}`}>
          {t.name}
        </li>
      ))}
    </ul>
  );
}

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const areaCls =
  'w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** O horário em português: "só fora do horário (seg–sex, 08:00–18:00)". */
export function hoursText(h: BotHours) {
  if (h.mode === 'always') return 'a qualquer hora';
  const dias = h.days.length === 7 ? 'todos os dias' : h.days.map((d) => DIAS[d].toLowerCase()).join(', ');
  return `${h.mode === 'outside' ? 'só fora do horário' : 'só no horário'} (${dias}, ${h.start}–${h.end})`;
}

/**
 * Robôs do WhatsApp, no jeito do Salesbot do Kommo, mas sem fluxograma: o
 * robô é contado em frases ("quando… responde… e faz…"), começa de um modelo
 * pronto e pode ser testado no simulador ao lado antes de ligar.
 */
export function BotsTab({ bots, stages, tags, team, fields = [], children }: { bots: BotRow[]; children?: React.ReactNode } & BotRefs) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState<BotRow | 'escolher' | null>(null);
  const refs = { stages, tags, team, fields };

  const agir = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string, fechar = false) =>
    start(async () => {
      const r = await fn();
      setAviso(r.ok ? ok : r.message ?? 'Não foi possível.');
      if (r.ok) {
        if (fechar) setEditando(null);
        router.refresh();
      }
    });

  if (editando === 'escolher') {
    return (
      <section aria-labelledby="robo-modelos">
        <div className="flex items-center justify-between gap-2">
          <h2 id="robo-modelos" className="text-base font-semibold">Como o robô começa?</h2>
          <button type="button" onClick={() => setEditando(null)} className="btn-ghost btn-sm">
            <X className="h-4 w-4" aria-hidden="true" /> Cancelar
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Escolha um modelo pronto e ajuste o texto. Dá para mudar tudo depois.</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {BOT_TEMPLATES.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => setEditando({ id: '', name: t.name, trigger: t.trigger, keywords: ['menu'], active: false, menu: t.menu(), hours: t.hours, audience: EMPTY_AUDIENCE })}
                className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-border bg-surface p-4 text-left hover:border-link focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Sparkles className="h-5 w-5 text-link" aria-hidden="true" />
                <span className="font-semibold">{t.title}</span>
                <span className="text-sm text-muted-foreground">{t.description}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() =>
                setEditando({ id: '', name: 'Meu robô', trigger: 'NEW_CONTACT', keywords: ['menu'], active: false, menu: { text: 'Oi! Como posso ajudar?', options: [blankOption('Opção 1')] }, hours: DEFAULT_HOURS, audience: EMPTY_AUDIENCE })
              }
              className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-dashed border-border-strong bg-surface p-4 text-left hover:border-link focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span className="font-semibold">Em branco</span>
              <span className="text-sm text-muted-foreground">Começar do zero, com uma opção.</span>
            </button>
          </li>
        </ul>
      </section>
    );
  }

  if (editando) {
    return (
      <BotEditor
        bot={editando}
        refs={refs}
        pending={pending}
        aviso={aviso}
        onCancel={() => setEditando(null)}
        onSave={(input) => agir(() => saveBotAction(input), 'Robô salvo.', true)}
      />
    );
  }

  return (
    <BotList
      bots={bots}
      refs={refs}
      pending={pending}
      aviso={aviso}
      onNew={() => setEditando('escolher')}
      onEdit={(b) => setEditando(b)}
      onDuplicate={(b) => setEditando({ ...b, id: '', name: `${b.name} (cópia)`.slice(0, 60), active: false })}
      onToggle={(b, on) => agir(() => toggleBotAction(b.id, on), on ? `${b.name} ligado.` : `${b.name} desligado.`)}
      onDelete={(b) => window.confirm(`Apagar o robô ${b.name}?`) && agir(() => deleteBotAction(b.id), 'Robô apagado.')}
    >
      {children}
    </BotList>
  );
}

type Situacao = 'todos' | 'ligados' | 'desligados';

/**
 * A lista dos robôs, organizada como no Kommo: separados pelo que faz cada um
 * começar, com filtro por situação e por tag (a tag que o robô pede ou põe).
 */
function BotList({
  bots,
  refs,
  pending,
  aviso,
  onNew,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
  children,
}: {
  bots: BotRow[];
  refs: BotRefs;
  pending: boolean;
  aviso: string;
  onNew: () => void;
  onEdit: (b: BotRow) => void;
  onDuplicate: (b: BotRow) => void;
  onToggle: (b: BotRow, on: boolean) => void;
  onDelete: (b: BotRow) => void;
  children?: React.ReactNode;
}) {
  const id = useId();
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [tag, setTag] = useState('');
  const usaTag = (b: BotRow, t: string) => b.audience.anyTags.includes(t) || b.audience.noneTags.includes(t) || tagsPostas(b.menu).includes(t);
  const tagsUsadas = refs.tags.filter((t) => bots.some((b) => usaTag(b, t.id)));
  const visiveis = bots.filter(
    (b) => (situacao === 'todos' || (situacao === 'ligados') === b.active) && (!tag || usaTag(b, tag)),
  );
  const grupos: { key: BotRow['trigger']; titulo: string; dica: string }[] = [
    { key: 'NEW_CONTACT', titulo: 'Quando chega um número novo', dica: 'Responde a primeira mensagem. O que pede tag responde antes do que vale para todos.' },
    { key: 'KEYWORD', titulo: 'Quando escrevem uma palavra-chave', dica: 'Responde em qualquer momento da conversa, como “menu”.' },
  ];
  const ligados = bots.filter((b) => b.active).length;

  return (
    <section aria-label="Robôs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-sm text-muted-foreground">
            O robô responde sozinho no WhatsApp com botões. Ele para quando alguém da equipe responde, quando a pessoa pede para falar com a
            equipe, se não entender duas vezes ou depois de 24 horas parado.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {bots.length} {bots.length === 1 ? 'robô' : 'robôs'} · {ligados} {ligados === 1 ? 'ligado' : 'ligados'}
          </p>
        </div>
        <button type="button" onClick={onNew} className="btn-primary btn-md">
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

      {grupos.map((g) => {
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
                <BotCard
                  key={b.id}
                  bot={b}
                  refs={refs}
                  pending={pending}
                  onEdit={() => onEdit(b)}
                  onDuplicate={() => onDuplicate(b)}
                  onToggle={(on) => onToggle(b, on)}
                  onDelete={() => onDelete(b)}
                />
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

function BotCard({
  bot: b,
  refs,
  pending,
  onEdit,
  onDuplicate,
  onToggle,
  onDelete,
}: {
  bot: BotRow;
  refs: BotRefs;
  pending: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggle: (on: boolean) => void;
  onDelete: () => void;
}) {
  const postas = tagsPostas(b.menu);
  return (
    <li className={`rounded-xl border bg-surface p-4 ${b.active ? 'border-border-strong' : 'border-border opacity-90'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${b.active ? 'bg-green-600/20 text-green-400' : 'bg-surface-alt text-muted-foreground'}`}
          aria-hidden="true"
        >
          <Bot className="h-5 w-5" />
        </span>
        <h4 className="min-w-0 flex-1 truncate font-semibold">{b.name}</h4>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" role="switch" checked={b.active} disabled={pending} onChange={(e) => onToggle(e.target.checked)} className="peer sr-only" />
          <span
            aria-hidden="true"
            className="relative h-5 w-9 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-green-600 peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring"
          />
          {b.active ? 'Ligado' : 'Desligado'}
          <span className="sr-only">: {b.name}</span>
        </label>
        <button type="button" onClick={onEdit} className="btn-outline btn-sm">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar<span className="sr-only"> {b.name}</span>
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          aria-label={`Duplicar ${b.name}`}
          title="Duplicar"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
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
            {b.trigger === 'NEW_CONTACT' ? 'Na primeira mensagem de um número novo' : `Quando escrevem ${b.keywords.map((k) => `“${k}”`).join(' ou ')}`},{' '}
            {hoursText(b.hours)}.
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
                  Só para leads com <TagChips ids={b.audience.anyTags} tags={refs.tags} label="Tags pedidas" />
                </span>
              )}
              {b.audience.noneTags.length > 0 && (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" /> nunca com <TagChips ids={b.audience.noneTags} tags={refs.tags} label="Tags que bloqueiam" />
                </span>
              )}
            </>
          )}
        </li>
        <li className="flex items-start gap-2">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {b.menu.options.length} {b.menu.options.length === 1 ? 'botão' : 'botões'}: {b.menu.options.map((o) => o.label).join(' · ')}.
          </span>
        </li>
        {postas.length > 0 && (
          <li className="flex flex-wrap items-center gap-2">
            <Tag className="h-4 w-4 shrink-0" aria-hidden="true" /> Põe as tags <TagChips ids={postas} tags={refs.tags} label="Tags que o robô põe" />
          </li>
        )}
      </ul>
    </li>
  );
}

type SaveInput = {
  id?: string;
  name: string;
  trigger: 'NEW_CONTACT' | 'KEYWORD';
  keywords: string;
  menu: UiMenu;
  hours: BotHours;
  audience: BotAudience;
  active: boolean;
};

function Passo({ n, titulo, children, id }: { n: number; titulo: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface p-4">
      <h3 id={id} className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground" aria-hidden="true">
          {n}
        </span>
        {titulo}
      </h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function BotEditor({
  bot,
  refs,
  pending,
  aviso,
  onCancel,
  onSave,
}: {
  bot: BotRow;
  refs: BotRefs;
  pending: boolean;
  aviso: string;
  onCancel: () => void;
  onSave: (i: SaveInput) => void;
}) {
  const id = useId();
  const [nome, setNome] = useState(bot.name);
  const [trigger, setTrigger] = useState(bot.trigger);
  const [keywords, setKeywords] = useState(bot.keywords.join(', '));
  const [menu, setMenu] = useState<UiMenu>(bot.menu);
  const [hours, setHours] = useState<BotHours>(bot.hours);
  const [audience, setAudience] = useState<BotAudience>(bot.audience);
  const [ativo, setAtivo] = useState(bot.active);

  return (
    // O simulador fica fora do formulário: responder no teste não pode salvar o robô.
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <form
        aria-label={bot.id ? `Editar ${bot.name}` : 'Novo robô'}
        className="min-w-0 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ id: bot.id || undefined, name: nome, trigger, keywords, menu, hours, audience, active: ativo });
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">Nome do robô</label>
            <input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} className={`${inputCls} mt-1`} />
          </div>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 accent-primary" />
            Ligado
          </label>
        </div>

        <Passo n={1} titulo="Quando o robô começa" id={`${id}-p1`}>
          <fieldset>
            <legend className="sr-only">Quando responde</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['NEW_CONTACT', 'Número novo', 'Quando alguém que a clínica não conhece manda a primeira mensagem.'],
                  ['KEYWORD', 'Palavra-chave', 'Quando a pessoa escreve uma palavra, como “menu”.'],
                ] as const
              ).map(([v, t, d]) => (
                <label key={v} className={`grid cursor-pointer grid-cols-[auto_1fr] items-center gap-x-2 rounded-lg border p-3 text-sm font-medium ${trigger === v ? 'border-link bg-primary/10' : 'border-border'}`}>
                  <input type="radio" name={`${id}-gatilho`} checked={trigger === v} onChange={() => setTrigger(v)} className="h-4 w-4 accent-primary" />
                  {t}
                  <span className="col-start-2 text-xs font-normal text-muted-foreground">{d}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {trigger === 'KEYWORD' && (
            <div>
              <label htmlFor={`${id}-palavras`} className="block text-xs font-medium text-muted-foreground">Palavras-chave (separadas por vírgula)</label>
              <input id={`${id}-palavras`} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="menu, oi, olá" className={`${inputCls} mt-1`} />
            </div>
          )}
          <HoursEditor hours={hours} onChange={setHours} />
        </Passo>

        <Passo n={2} titulo="Para quem" id={`${id}-pq`}>
          <AudienceEditor audience={audience} tags={refs.tags} onChange={setAudience} />
        </Passo>

        <Passo n={3} titulo="A primeira mensagem" id={`${id}-p2`}>
          <label htmlFor={`${id}-texto`} className="sr-only">Primeira mensagem do robô</label>
          <textarea id={`${id}-texto`} value={menu.text} onChange={(e) => setMenu({ ...menu, text: e.target.value })} rows={3} maxLength={1000} className={areaCls} />
          <p className="text-xs text-muted-foreground">Os botões do passo 4 aparecem embaixo desta mensagem.</p>
        </Passo>

        <Passo n={4} titulo="Os botões e o que cada um faz" id={`${id}-p3`}>
          <OptionsEditor menu={menu} onChange={setMenu} refs={refs} level={0} />
        </Passo>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="btn-primary btn-md">
            {pending ? 'Salvando…' : 'Salvar robô'}
          </button>
          <button type="button" onClick={onCancel} className="btn-ghost btn-md">
            Cancelar
          </button>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {aviso}
          </p>
        </div>
      </form>

      <aside aria-label="Testar o robô" className="lg:sticky lg:top-4 lg:self-start">
        <BotSimulator menu={menu} hours={hours} refs={refs} />
      </aside>
    </div>
  );
}

/** As tags do lead decidem se o robô começa: só com estas / nunca com aquelas. */
function AudienceEditor({ audience, tags, onChange }: { audience: BotAudience; tags: TagOption[]; onChange: (a: BotAudience) => void }) {
  const idBase = useId();
  if (tags.length === 0) {
    return <p className="text-sm text-muted-foreground">Para todos. Crie tags nas Configurações do CRM para separar os robôs por assunto.</p>;
  }
  const grupo = (campo: keyof BotAudience, titulo: string, dica: string) => {
    const outro: keyof BotAudience = campo === 'anyTags' ? 'noneTags' : 'anyTags';
    const escolhidas = audience[campo].map((tid) => tags.find((t) => t.id === tid)).filter((t): t is TagOption => Boolean(t));
    // A mesma tag não pode pedir e bloquear ao mesmo tempo: some da outra lista.
    const livres = tags.filter((t) => !audience[campo].includes(t.id) && !audience[outro].includes(t.id));
    const selectId = `${idBase}-${campo}`;
    return (
      <div role="group" aria-label={titulo}>
        <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground">
          {titulo}
        </label>
        <p className="text-xs text-muted-foreground/80">{dica}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {escolhidas.map((t) => (
            <span key={t.id} className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium ${colorClasses(t.color ?? 'gray').chip}`}>
              {t.name}
              <button
                type="button"
                onClick={() => onChange({ ...audience, [campo]: audience[campo].filter((x) => x !== t.id) })}
                aria-label={`Tirar ${t.name} de “${titulo}”`}
                className="rounded opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          {livres.length > 0 && (
            <select
              id={selectId}
              value=""
              onChange={(e) => e.target.value && onChange({ ...audience, [campo]: [...audience[campo], e.target.value] })}
              className="h-7 rounded-md border border-dashed border-border-strong bg-background px-2 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <option value="">+ escolher tag</option>
              {livres.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  };
  const nada = audience.anyTags.length === 0 && audience.noneTags.length === 0;
  return (
    <div className="space-y-3">
      {grupo('anyTags', 'Só para leads com alguma destas tags', 'Ex.: “implante” — combine com a Captação, que põe a tag pela primeira mensagem.')}
      {grupo('noneTags', 'Nunca para leads com estas tags', 'Ex.: “paciente” ou “não perturbe”.')}
      <p className="text-xs text-muted-foreground">
        {nada ? 'Sem tag escolhida, o robô vale para todos.' : 'Quem não tem lead ainda não tem tags: só entra se nenhuma tag for pedida.'}
      </p>
    </div>
  );
}

function HoursEditor({ hours, onChange }: { hours: BotHours; onChange: (h: BotHours) => void }) {
  const id = useId();
  return (
    <div className="rounded-lg bg-surface-alt/50 p-3">
      <label htmlFor={`${id}-modo`} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Em que horário
      </label>
      <select id={`${id}-modo`} value={hours.mode} onChange={(e) => onChange({ ...hours, mode: e.target.value as BotHours['mode'] })} className={`${inputCls} mt-1 sm:max-w-sm`}>
        <option value="always">A qualquer hora</option>
        <option value="outside">Só fora do horário de atendimento</option>
        <option value="inside">Só no horário de atendimento</option>
      </select>
      {hours.mode !== 'always' && (
        <div className="mt-3 space-y-2">
          <fieldset>
            <legend className="text-xs font-medium text-muted-foreground">Dias de atendimento</legend>
            <div className="mt-1 flex flex-wrap gap-1">
              {DIAS.map((d, i) => {
                const on = hours.days.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...hours, days: on ? hours.days.filter((x) => x !== i) : [...hours.days, i].sort() })}
                    className={`h-8 w-11 rounded-md border text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${on ? 'border-link bg-primary/15 text-link' : 'border-border text-muted-foreground'}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor={`${id}-ini`} className="text-xs text-muted-foreground">Das</label>
            <input id={`${id}-ini`} type="time" value={hours.start} onChange={(e) => onChange({ ...hours, start: e.target.value })} className={`${inputCls} w-auto`} />
            <label htmlFor={`${id}-fim`} className="text-xs text-muted-foreground">às</label>
            <input id={`${id}-fim`} type="time" value={hours.end} onChange={(e) => onChange({ ...hours, end: e.target.value })} className={`${inputCls} w-auto`} />
          </div>
        </div>
      )}
    </div>
  );
}

const AFTERS: { v: UiAfter; label: string; hint: string }[] = [
  { v: 'end', label: 'Encerrar', hint: 'O robô para aqui.' },
  { v: 'menu', label: 'Mostrar os botões de novo', hint: 'Para a pessoa escolher outra coisa.' },
  { v: 'sub', label: 'Abrir outros botões', hint: 'Um segundo menu (ex.: qual tratamento).' },
  { v: 'question', label: 'Fazer uma pergunta', hint: 'Guarda a resposta (nome, e-mail ou anotação).' },
  { v: 'handoff', label: 'Chamar alguém da equipe', hint: 'O robô para e a conversa fica com vocês.' },
];

function OptionsEditor({ menu, onChange, refs, level }: { menu: UiMenu; onChange: (m: UiMenu) => void; refs: BotRefs; level: 0 | 1 }) {
  const [aberta, setAberta] = useState<string | null>(menu.options[0]?.id ?? null);
  const setOpt = (i: number, patch: Partial<UiOption>) => onChange({ ...menu, options: menu.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {menu.options.map((o, i) => (
          <OptionCard
            key={o.id}
            n={i + 1}
            option={o}
            open={aberta === o.id}
            onToggle={() => setAberta(aberta === o.id ? null : o.id)}
            onChange={(patch) => setOpt(i, patch)}
            onRemove={menu.options.length > 1 ? () => onChange({ ...menu, options: menu.options.filter((_, j) => j !== i) }) : undefined}
            refs={refs}
            level={level}
          />
        ))}
      </ol>
      {menu.options.length < 10 && (
        <button
          type="button"
          onClick={() => {
            const nova = blankOption(`Opção ${menu.options.length + 1}`);
            onChange({ ...menu, options: [...menu.options, nova] });
            setAberta(nova.id);
          }}
          className="btn-outline btn-sm"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar botão
        </button>
      )}
    </div>
  );
}

/** "Responde · cria o lead · tag implante · chama a equipe" — o botão resumido. */
function resumo(o: UiOption, refs: BotRefs) {
  const nome = (l: Option[], id: string) => l.find((x) => x.id === id)?.name ?? '?';
  const partes: string[] = [];
  if (o.reply.trim()) partes.push('responde');
  if (o.stage === NEW_STAGE) partes.push('cria o lead');
  else if (o.stage) partes.push(`etapa ${nome(refs.stages, o.stage)}`);
  if (o.tagIds.length) partes.push(`tag ${o.tagIds.map((t) => nome(refs.tags, t)).join(', ')}`);
  if (o.assignTo) partes.push(`para ${nome(refs.team, o.assignTo)}`);
  partes.push(AFTERS.find((a) => a.v === o.after)?.label.toLowerCase() ?? '');
  return partes.join(' · ');
}

function OptionCard({
  n,
  option: o,
  open,
  onToggle,
  onChange,
  onRemove,
  refs,
  level,
}: {
  n: number;
  option: UiOption;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<UiOption>) => void;
  onRemove?: () => void;
  refs: BotRefs;
  level: 0 | 1;
}) {
  const id = useId();
  const afters = AFTERS.filter((a) => level === 0 || a.v !== 'sub');
  return (
    <li className={`rounded-lg border ${open ? 'border-link/60' : 'border-border'} bg-background/40`}>
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-corpo`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold" aria-hidden="true">
            {n}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{o.label || 'Botão sem nome'}</span>
            <span className="block truncate text-xs text-muted-foreground">{resumo(o, refs)}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          <span className="sr-only">{open ? 'Fechar' : 'Abrir'} o botão {n}</span>
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Tirar o botão ${n}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <div id={`${id}-corpo`} className="space-y-4 border-t border-border p-3">
          <div>
            <label htmlFor={`${id}-label`} className="block text-xs font-medium text-muted-foreground">
              Texto do botão <span className="font-normal">({o.label.length}/24)</span>
            </label>
            <input id={`${id}-label`} value={o.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={24} placeholder="Ex.: Agendar avaliação" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <label htmlFor={`${id}-reply`} className="block text-xs font-medium text-muted-foreground">Quando a pessoa toca, o robô responde (opcional)</label>
            <textarea id={`${id}-reply`} value={o.reply} onChange={(e) => onChange({ reply: e.target.value })} rows={2} maxLength={1000} className={`${areaCls} mt-1`} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">E faz no CRM</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-etapa`} className="block text-xs text-muted-foreground">Funil</label>
                <select id={`${id}-etapa`} value={o.stage} onChange={(e) => onChange({ stage: e.target.value })} className={`${inputCls} mt-1`}>
                  <option value="">Não mexe no funil</option>
                  <option value={NEW_STAGE}>Cria o lead na entrada</option>
                  {refs.stages.map((s) => (
                    <option key={s.id} value={s.id}>Coloca na etapa {s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-resp`} className="block text-xs text-muted-foreground">Responsável</label>
                <select id={`${id}-resp`} value={o.assignTo} onChange={(e) => onChange({ assignTo: e.target.value })} className={`${inputCls} mt-1`}>
                  <option value="">Não muda</option>
                  {refs.team.map((p) => (
                    <option key={p.id} value={p.id}>Passa para {p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {refs.tags.length > 0 && (
              <div role="group" aria-label="Tags que o robô põe">
                <p className="text-xs text-muted-foreground">Tags</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {refs.tags.map((t) => {
                    const on = o.tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange({ tagIds: on ? o.tagIds.filter((x) => x !== t.id) : [...o.tagIds, t.id] })}
                        className={`h-7 rounded-md border px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring ${on ? 'border-link bg-primary/15 text-link' : 'border-border text-muted-foreground'}`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-xs font-medium text-muted-foreground">Depois disso</legend>
            <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
              {afters.map((a) => (
                <label key={a.v} className={`grid cursor-pointer grid-cols-[auto_1fr] items-center gap-x-2 rounded-md border p-2 text-sm font-medium ${o.after === a.v ? 'border-link bg-primary/10' : 'border-border'}`}>
                  <input
                    type="radio"
                    name={`${id}-depois`}
                    checked={o.after === a.v}
                    onChange={() =>
                      onChange({
                        after: a.v,
                        ...(a.v === 'sub' && !o.sub ? { sub: { text: 'Escolha uma opção:', options: [blankOption('Opção 1')] } } : {}),
                        ...(a.v === 'question' && !o.question ? { question: blankQuestion() } : {}),
                      })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  {level === 1 && a.v === 'menu' ? 'Voltar aos primeiros botões' : a.label}
                  <span className="col-start-2 text-xs font-normal text-muted-foreground">{a.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {o.after === 'sub' && o.sub && level === 0 && (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <label htmlFor={`${id}-sub`} className="block text-xs font-medium text-muted-foreground">Mensagem dos outros botões</label>
              <textarea id={`${id}-sub`} value={o.sub.text} onChange={(e) => onChange({ sub: { ...o.sub!, text: e.target.value } })} rows={2} maxLength={1000} className={areaCls} />
              <OptionsEditor menu={o.sub} onChange={(sub) => onChange({ sub })} refs={refs} level={1} />
            </div>
          )}

          {o.after === 'question' && o.question && <QuestionEditor q={o.question} fields={refs.fields ?? []} onChange={(question) => onChange({ question })} />}
        </div>
      )}
    </li>
  );
}

function QuestionEditor({ q, fields, onChange }: { q: UiQuestion; fields: Option[]; onChange: (q: UiQuestion) => void }) {
  const id = useId();
  return (
    <div className="grid gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-texto`} className="block text-xs font-medium text-muted-foreground">Pergunta</label>
        <input id={`${id}-texto`} value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} maxLength={300} className={`${inputCls} mt-1`} />
      </div>
      <div>
        <label htmlFor={`${id}-onde`} className="block text-xs font-medium text-muted-foreground">Guardar a resposta em</label>
        <select id={`${id}-onde`} value={q.saveTo} onChange={(e) => onChange({ ...q, saveTo: e.target.value as UiQuestion['saveTo'] })} className={`${inputCls} mt-1`}>
          <option value="name">Nome do lead</option>
          <option value="email">E-mail do lead</option>
          <option value="note">Anotação no histórico</option>
          {fields.map((f) => (
            <option key={f.id} value={`field:${f.id}`}>Campo: {f.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-depois`} className="block text-xs font-medium text-muted-foreground">E então</label>
        <select id={`${id}-depois`} value={q.after} onChange={(e) => onChange({ ...q, after: e.target.value as UiQuestionAfter })} className={`${inputCls} mt-1`}>
          <option value="end">Encerrar</option>
          <option value="menu">Mostrar os primeiros botões</option>
          <option value="handoff">Chamar alguém da equipe</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-reply`} className="block text-xs font-medium text-muted-foreground">Depois que a pessoa responde, o robô diz (opcional)</label>
        <input id={`${id}-reply`} value={q.reply} onChange={(e) => onChange({ ...q, reply: e.target.value })} maxLength={500} className={`${inputCls} mt-1`} />
      </div>
    </div>
  );
}
