'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import { COLOR_LABEL, colorClasses } from '@/crm/colors';
import { CRM_COLORS } from '@/crm/defaults';
import { normalizeShortcut } from '@/crm/quick-replies';
import {
  deleteQuickReplyAction, deleteTagAction, toggleLostReasonAction, upsertLostReasonAction, upsertQuickReplyAction, upsertTagAction,
} from '../actions';

type PipelineRow = { id: string; name: string; stages: number; leads: number };
type Tag = { id: string; name: string; color: string; leads: number };
type Reason = { id: string; name: string; active: boolean };
type QuickReply = { id: string; title: string; body: string };
type Result = { ok: true } | { ok: false; message: string };

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40';

export type SettingsTab = 'funis' | 'tags' | 'motivos' | 'respostas';

/** As abas das configurações do CRM. Automações, robôs e modelos ficam em Automações. */
export function CrmSettings({
  pipelines,
  tags,
  reasons,
  quickReplies,
  initialTab = 'funis',
}: {
  pipelines: PipelineRow[];
  tags: Tag[];
  reasons: Reason[];
  quickReplies: QuickReply[];
  initialTab?: SettingsTab;
}) {
  const [aba, setAba] = useState<SettingsTab>(initialTab);
  const [aviso, setAviso] = useState('');
  const router = useRouter();
  const [pending, start] = useTransition();
  const id = useId();

  const agir = (fn: () => Promise<Result>, sucesso: string) =>
    start(async () => {
      const r = await fn();
      setAviso(r.ok ? sucesso : r.message);
      if (r.ok) router.refresh();
    });

  const abas = [
    { key: 'funis' as const, label: 'Funis' },
    { key: 'tags' as const, label: 'Tags' },
    { key: 'motivos' as const, label: 'Motivos de perda' },
    { key: 'respostas' as const, label: 'Respostas rápidas' },
  ];

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Configurações do CRM" className="flex gap-1 border-b border-border">
        {abas.map((a) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            id={`${id}-${a.key}`}
            aria-selected={aba === a.key}
            aria-controls={`${id}-painel`}
            onClick={() => setAba(a.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring ${aba === a.key ? 'border-primary font-medium text-link' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-${aba}`} className="pt-5">
        {aba === 'funis' && <Funis pipelines={pipelines} />}
        {aba === 'tags' && <Tags tags={tags} pending={pending} agir={agir} />}
        {aba === 'motivos' && <Motivos reasons={reasons} pending={pending} agir={agir} />}
        {aba === 'respostas' && <Respostas items={quickReplies} pending={pending} agir={agir} />}
      </div>

      {aviso && (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {aviso}
        </p>
      )}
    </div>
  );
}

type Agir = (fn: () => Promise<Result>, sucesso: string) => void;

function ColorSelect({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
      {CRM_COLORS.map((c) => (
        <option key={c} value={c}>{COLOR_LABEL[c]}</option>
      ))}
    </select>
  );
}

function NameInput({ value, label, onSave }: { value: string; label: string; onSave: (v: string) => void }) {
  const [texto, setTexto] = useState(value);
  return (
    <input
      aria-label={label}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => texto.trim() && texto.trim() !== value && onSave(texto)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setTexto(value);
      }}
      className={inputCls}
    />
  );
}

function Funis({ pipelines }: { pipelines: PipelineRow[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        As etapas se editam no próprio quadro, como no Kommo: abra o funil e use <strong className="font-medium text-foreground">⋯ › Editar funil</strong>.
        Para criar um funil, clique no nome do funil, no canto do quadro, e em <strong className="font-medium text-foreground">Novo funil</strong>.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {pipelines.map((f, i) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {f.name}
                {i === 0 && <span className="ml-2 rounded bg-surface-alt px-1.5 py-0.5 text-xs font-normal text-muted-foreground">principal</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {f.stages} etapas · {f.leads} {f.leads === 1 ? 'lead' : 'leads'}
              </p>
            </div>
            <Link href={`/crm?funil=${f.id}&editar=1`} className="btn-outline btn-sm">
              Editar funil
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tags({ tags, pending, agir }: { tags: Tag[]; pending: boolean; agir: Agir }) {
  const [nova, setNova] = useState({ name: '', color: 'violet' });
  return (
    <section aria-label="Tags">
      {tags.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tag ainda. Elas também podem ser criadas direto na ficha do lead.</p>}
      <ul className="space-y-2">
        {tags.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${colorClasses(t.color).chip}`}>{t.name}</span>
            <div className="min-w-40 flex-1">
              <NameInput value={t.name} label={`Nome da tag ${t.name}`} onSave={(v) => agir(() => upsertTagAction({ id: t.id, name: v, color: t.color }), 'Tag renomeada.')} />
            </div>
            <ColorSelect value={t.color} label={`Cor da tag ${t.name}`} onChange={(v) => agir(() => upsertTagAction({ id: t.id, name: t.name, color: v }), 'Cor alterada.')} />
            <span className="text-xs text-muted-foreground">{t.leads} {t.leads === 1 ? 'lead' : 'leads'}</span>
            <button
              type="button"
              className={`${iconBtn} hover:text-destructive`}
              disabled={pending}
              onClick={() => {
                if (confirm(`Apagar a tag ${t.name}? Ela sai de ${t.leads} ${t.leads === 1 ? 'lead' : 'leads'}.`)) agir(() => deleteTagAction(t.id), `Tag ${t.name} apagada.`);
              }}
              aria-label={`Apagar tag ${t.name}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          agir(() => upsertTagAction(nova), `Tag ${nova.name.trim().toLowerCase()} criada.`);
          setNova({ name: '', color: 'violet' });
        }}
      >
        <div className="min-w-40 flex-1">
          <label htmlFor="cfg-nova-tag" className="block text-xs font-medium text-muted-foreground">Nova tag</label>
          <input id="cfg-nova-tag" value={nova.name} onChange={(e) => setNova((n) => ({ ...n, name: e.target.value }))} placeholder="implante, vip…" className={`${inputCls} mt-1`} />
        </div>
        <ColorSelect value={nova.color} label="Cor da nova tag" onChange={(v) => setNova((n) => ({ ...n, color: v }))} />
        <button type="submit" disabled={pending || !nova.name.trim()} className="btn-primary btn-md inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" /> Criar tag
        </button>
      </form>
    </section>
  );
}

function Motivos({ reasons, pending, agir }: { reasons: Reason[]; pending: boolean; agir: Agir }) {
  const [novo, setNovo] = useState('');
  return (
    <section aria-label="Motivos de perda">
      <p className="text-xs text-muted-foreground">Motivo desativado sai da lista de escolha, mas continua nos leads que já foram perdidos por ele.</p>
      <ul className="mt-3 space-y-2">
        {reasons.map((r) => (
          <li key={r.id} className={`flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 ${r.active ? 'bg-surface' : 'bg-surface-alt/60'}`}>
            <div className="min-w-40 flex-1">
              <NameInput value={r.name} label={`Motivo ${r.name}`} onSave={(v) => agir(() => upsertLostReasonAction({ id: r.id, name: v }), 'Motivo renomeado.')} />
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={r.active}
                disabled={pending}
                onChange={(e) => agir(() => toggleLostReasonAction(r.id, e.target.checked), e.target.checked ? 'Motivo ativado.' : 'Motivo desativado.')}
                className="h-4 w-4 accent-primary"
              />
              Ativo
            </label>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          agir(() => upsertLostReasonAction({ name: novo }), 'Motivo criado.');
          setNovo('');
        }}
      >
        <div className="min-w-40 flex-1">
          <label htmlFor="cfg-novo-motivo" className="block text-xs font-medium text-muted-foreground">Novo motivo</label>
          <input id="cfg-novo-motivo" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Mudou de cidade…" className={`${inputCls} mt-1`} />
        </div>
        <button type="submit" disabled={pending || !novo.trim()} className="btn-primary btn-md inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" /> Criar motivo
        </button>
      </form>
    </section>
  );
}

function Respostas({ items, pending, agir }: { items: QuickReply[]; pending: boolean; agir: Agir }) {
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  return (
    <section aria-label="Respostas rápidas">
      <p className="text-xs text-muted-foreground">
        Na conversa, digite <kbd className="rounded border border-border px-1">/</kbd> e o atalho para usar.{' '}
        <code>{'{nome}'}</code> vira o primeiro nome do contato.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((q) => (
          <li key={q.id}>
            <RespostaItem item={q} pending={pending} agir={agir} />
          </li>
        ))}
      </ul>
      <form
        className="mt-3 space-y-2 rounded-lg border border-dashed border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          agir(() => upsertQuickReplyAction({ title: titulo, body: texto }), `Resposta /${normalizeShortcut(titulo)} criada.`);
          setTitulo('');
          setTexto('');
        }}
      >
        <div>
          <label htmlFor="cfg-nova-resposta-atalho" className="block text-xs font-medium text-muted-foreground">Atalho</label>
          <input
            id="cfg-nova-resposta-atalho"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="horarios"
            maxLength={40}
            className={`${inputCls} mt-1 sm:max-w-xs`}
          />
        </div>
        <div>
          <label htmlFor="cfg-nova-resposta-texto" className="block text-xs font-medium text-muted-foreground">Texto</label>
          <textarea
            id="cfg-nova-resposta-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Oi {nome}! Atendemos de segunda a sexta, das 8h às 18h, e sábado até 12h."
            className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
        <button type="submit" disabled={pending || !titulo.trim() || !texto.trim()} className="btn-primary btn-md inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" /> Criar resposta
        </button>
      </form>
    </section>
  );
}

function RespostaItem({ item, pending, agir }: { item: QuickReply; pending: boolean; agir: Agir }) {
  const id = useId();
  const [titulo, setTitulo] = useState(item.title);
  const [texto, setTexto] = useState(item.body);
  const mudou = titulo !== item.title || texto !== item.body;
  return (
    <form
      className="space-y-2 rounded-lg border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        agir(() => upsertQuickReplyAction({ id: item.id, title: titulo, body: texto }), `Resposta /${normalizeShortcut(titulo)} salva.`);
      }}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-atalho`} className="sr-only">Atalho</label>
        <span className="text-sm text-muted-foreground" aria-hidden="true">/</span>
        <input id={`${id}-atalho`} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={40} className={`${inputCls} max-w-xs`} />
        <span className="flex-1" />
        <button type="submit" disabled={pending || !mudou} className="btn-outline btn-sm">
          <Save className="h-3.5 w-3.5" aria-hidden="true" /> Salvar<span className="sr-only"> /{item.title}</span>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => agir(() => deleteQuickReplyAction(item.id), `Resposta /${item.title} apagada.`)}
          className={iconBtn}
          aria-label={`Apagar resposta /${item.title}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <label htmlFor={`${id}-texto`} className="sr-only">Texto de /{item.title}</label>
      <textarea
        id={`${id}-texto`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        maxLength={1000}
        className="w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
    </form>
  );
}
