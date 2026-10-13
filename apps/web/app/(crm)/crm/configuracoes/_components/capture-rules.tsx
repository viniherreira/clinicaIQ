'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { cleanCaptureKeywords, matchCapture, type CaptureRuleLite } from '@/crm/capture-rules';
import { SOURCE_LABEL } from '@/crm/format';
import { deleteCaptureRuleAction, saveCaptureRuleAction, toggleCaptureRuleAction, upsertTagAction } from '../actions';

export type CaptureRow = CaptureRuleLite & { active: boolean };
type Option = { id: string; name: string };

const SOURCES = ['WHATSAPP', 'INSTAGRAM', 'SITE', 'INDICACAO', 'OUTRO'] as const;
const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Captação: palavras na primeira mensagem de um número que já viram lead com
 * tag, funil e origem, antes do robô responder (`crm/capture.ts`).
 */
export function CaptureRules({ rules, tags, pipelines }: { rules: CaptureRow[]; tags: Option[]; pipelines: Option[] }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState<CaptureRow | null>(null);
  const [teste, setTeste] = useState('');

  const nome = (l: Option[], x: string | null) => l.find((o) => o.id === x)?.name;
  const agir = (fn: () => Promise<{ ok: boolean; message?: string }>, ok: string, fechar = false) =>
    start(async () => {
      const r = await fn();
      setAviso(r.ok ? ok : r.message ?? 'Não foi possível.');
      if (r.ok) {
        if (fechar) setEditando(null);
        router.refresh();
      }
    });

  const resultado = useMemo(() => (teste.trim() ? matchCapture(teste, rules.filter((r) => r.active)) : null), [teste, rules]);
  const efeito = (r: { tagIds: string[]; pipelineId: string | null; source: string | null }) =>
    [
      r.tagIds.length ? `tag ${r.tagIds.map((t) => nome(tags, t) ?? '?').join(', ')}` : null,
      r.pipelineId ? `funil ${nome(pipelines, r.pipelineId) ?? 'principal'}` : null,
      r.source ? `origem ${SOURCE_LABEL[r.source]}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <section aria-labelledby={`${id}-t`} className="mt-8 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id={`${id}-t`} className="flex items-center gap-2 text-base font-semibold">
            <Tag className="h-4 w-4 text-link" aria-hidden="true" /> Captação pela primeira mensagem
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quando um número manda a primeira mensagem com uma destas palavras, o lead já entra com a tag, no funil e com a origem que você
            escolher — antes do robô responder. Ex.: quem chega do anúncio com “Quero saber do implante” entra com a tag implante.
          </p>
        </div>
        {!editando && (
          <button
            type="button"
            onClick={() => setEditando({ id: '', name: '', keywords: [], tagIds: [], pipelineId: null, source: null, active: true })}
            className="btn-primary btn-md"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nova regra
          </button>
        )}
      </div>

      {editando && (
        <RuleForm
          key={editando.id || 'nova'}
          rule={editando}
          tags={tags}
          pipelines={pipelines}
          pending={pending}
          onCancel={() => setEditando(null)}
          onSave={(input) => agir(() => saveCaptureRuleAction(input), 'Regra salva.', true)}
          onNewTag={(name) => agir(() => upsertTagAction({ name, color: 'blue' }), `Tag “${name}” criada.`)}
        />
      )}

      <ul className="mt-4 space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {r.keywords.map((k) => `“${k}”`).join(', ')} → {efeito(r) || 'nada'}
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                role="switch"
                checked={r.active}
                disabled={pending}
                onChange={(e) => agir(() => toggleCaptureRuleAction(r.id, e.target.checked), e.target.checked ? `${r.name} ligada.` : `${r.name} desligada.`)}
                className="h-4 w-4 accent-primary"
              />
              {r.active ? 'Ligada' : 'Desligada'}
              <span className="sr-only">: regra {r.name}</span>
            </label>
            <button type="button" onClick={() => setEditando(r)} className="btn-outline btn-sm">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar<span className="sr-only"> a regra {r.name}</span>
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => window.confirm(`Apagar a regra ${r.name}?`) && agir(() => deleteCaptureRuleAction(r.id), 'Regra apagada.')}
              aria-label={`Apagar a regra ${r.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {rules.length === 0 && !editando && (
        <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Nenhuma regra ainda. Crie uma para cada tratamento ou anúncio (implante, clareamento, harmonização…).
        </p>
      )}

      {rules.length > 0 && (
        <div className="mt-4 rounded-lg bg-surface-alt/50 p-3">
          <label htmlFor={`${id}-teste`} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Search className="h-3.5 w-3.5" aria-hidden="true" /> Testar uma primeira mensagem
          </label>
          <input
            id={`${id}-teste`}
            value={teste}
            onChange={(e) => setTeste(e.target.value)}
            placeholder="Ex.: Oi, vi o anúncio do implante"
            className={`${inputCls} mt-1`}
          />
          <p role="status" aria-live="polite" className="mt-2 text-sm">
            {!teste.trim()
              ? ''
              : resultado
                ? `Achou ${resultado.hits.map((h) => `“${h.keyword}”`).join(', ')} → ${efeito(resultado) || 'nada'}.`
                : 'Nenhuma regra acionada: o lead entra sem tag (e o robô segue normal).'}
          </p>
        </div>
      )}

      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">
        {aviso}
      </p>
    </section>
  );
}

function RuleForm({
  rule,
  tags,
  pipelines,
  pending,
  onCancel,
  onSave,
  onNewTag,
}: {
  rule: CaptureRow;
  tags: Option[];
  pipelines: Option[];
  pending: boolean;
  onCancel: () => void;
  onSave: (r: { id?: string; name: string; keywords: string[]; tagIds: string[]; pipelineId: string | null; source: CaptureRow['source']; active: boolean }) => void;
  onNewTag: (name: string) => void;
}) {
  const id = useId();
  const [name, setName] = useState(rule.name);
  const [palavras, setPalavras] = useState(rule.keywords.join(', '));
  const [tagIds, setTagIds] = useState(rule.tagIds);
  const [pipelineId, setPipelineId] = useState(rule.pipelineId ?? '');
  const [source, setSource] = useState<string>(rule.source ?? '');
  const [active, setActive] = useState(rule.active);
  const [novaTag, setNovaTag] = useState('');
  const limpas = cleanCaptureKeywords(palavras.split(','));

  return (
    <form
      aria-label={rule.id ? `Editar a regra ${rule.name}` : 'Nova regra de captação'}
      className="mt-4 space-y-3 rounded-lg border border-link/60 bg-background/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: rule.id || undefined,
          name,
          keywords: palavras.split(','),
          tagIds,
          pipelineId: pipelineId || null,
          source: (source || null) as CaptureRow['source'],
          active,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">Nome da regra</label>
          <input id={`${id}-nome`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex.: Implante" className={`${inputCls} mt-1`} />
        </div>
        <div>
          <label htmlFor={`${id}-palavras`} className="block text-xs font-medium text-muted-foreground">Palavras (separadas por vírgula)</label>
          <input
            id={`${id}-palavras`}
            value={palavras}
            onChange={(e) => setPalavras(e.target.value)}
            placeholder="implante, protese, dente fixo"
            aria-describedby={`${id}-palavras-d`}
            className={`${inputCls} mt-1`}
          />
          <p id={`${id}-palavras-d`} className="mt-1 text-xs text-muted-foreground">
            {limpas.length ? `Procura: ${limpas.map((k) => `“${k}”`).join(', ')} (o plural também vale).` : 'Acento e maiúscula não importam.'}
          </p>
        </div>
      </div>

      <div role="group" aria-labelledby={`${id}-tags`}>
        <p id={`${id}-tags`} className="text-xs font-medium text-muted-foreground">Tags que o lead recebe</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setTagIds(on ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])}
                className={`h-7 rounded-md border px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring ${on ? 'border-link bg-primary/15 text-link' : 'border-border text-muted-foreground'}`}
              >
                {t.name}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1">
            <label htmlFor={`${id}-nova`} className="sr-only">Nome da nova tag</label>
            <input
              id={`${id}-nova`}
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              placeholder="nova tag"
              maxLength={30}
              className="h-7 w-28 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
            />
            <button
              type="button"
              disabled={pending || !novaTag.trim()}
              onClick={() => {
                onNewTag(novaTag.trim());
                setNovaTag('');
              }}
              className="btn-outline btn-sm h-7"
            >
              Criar tag
            </button>
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-funil`} className="block text-xs font-medium text-muted-foreground">Funil em que o lead entra</label>
          <select id={`${id}-funil`} value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">O principal</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-origem`} className="block text-xs font-medium text-muted-foreground">Origem do lead</label>
          <select id={`${id}-origem`} value={source} onChange={(e) => setSource(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">WhatsApp (padrão)</option>
            {SOURCES.filter((s) => s !== 'WHATSAPP').map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-primary" />
          Ligada
        </label>
        <button type="submit" disabled={pending} className="btn-primary btn-md">
          {pending ? 'Salvando…' : 'Salvar regra'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost btn-md">
          Cancelar
        </button>
      </div>
    </form>
  );
}
