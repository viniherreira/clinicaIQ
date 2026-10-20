'use client';

import { useEffect, useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Users, X } from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { formatCents, SOURCE_LABEL } from '@/crm/format';
import { EMPTY_AUDIENCE, type Audience, type AudienceStatus, type AudienceTask } from '@/crm/audience';
import { FIELD_LABEL, matchingPreset, rangeText, resolvePeriod, type Period } from '@/crm/period';
import { PeriodPicker } from '@/components/crm-period-picker';
import { createBroadcastAction, previewAudienceAction, type AudienceSample } from '../actions';

type Option = { id: string; name: string };
type PipelineOption = { id: string; name: string; stages: Option[] };
type TagOption = { id: string; name: string; color: string; count: number };
type Template = { id: string; name: string; body: string; variables: number };

const SOURCES = ['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO'] as const;
const SITUACOES: { v: AudienceStatus; label: string }[] = [
  { v: 'abertos', label: 'Em andamento' },
  { v: 'ganhos', label: 'Ganhos' },
  { v: 'perdidos', label: 'Perdidos' },
  { v: 'todos', label: 'Todos' },
];
const TAREFAS: { v: AudienceTask; label: string }[] = [
  { v: '', label: 'Tanto faz' },
  { v: 'none', label: 'Sem tarefa' },
  { v: 'overdue', label: 'Com tarefa atrasada' },
];

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const legendCls = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

/** Minutos que a transmissão leva no QR (mesma conta de `gatewayDurationMinutes`). */
const minutosQr = (n: number) => Math.ceil((n * 20 + Math.floor(n / 20) * 120) / 60);

function Chip({ on, onClick, children, className = '' }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        on ? 'border-link bg-primary/15 text-link' : 'border-border bg-surface text-muted-foreground hover:text-foreground'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Step({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-link">
        {n}
      </span>
      <span className="sr-only">{n}. </span>
      {children}
    </h3>
  );
}

const alterna = (lista: string[], v: string) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

const reaisDe = (v: string): number | null => {
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return v.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Nova transmissão: quem recebe (os mesmos filtros da busca de leads, com o
 * período no calendário), a mensagem e quando. À direita, quantas pessoas
 * recebem, por quais critérios e quem são.
 */
export function BroadcastForm({
  initialAudience,
  pipelines,
  tags,
  team,
  channel,
  templates,
  today,
  fromSearch = false,
}: {
  initialAudience: Audience;
  pipelines: PipelineOption[];
  tags: TagOption[];
  team: Option[];
  channel: 'cloud' | 'gateway';
  templates: Template[];
  /** Dia da clínica, "AAAA-MM-DD". */
  today: string;
  /** O público veio da busca de leads ("Transmissão para estes leads"). */
  fromSearch?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [aud, setAud] = useState<Audience>(initialAudience);
  const [achaTag, setAchaTag] = useState('');
  const [texto, setTexto] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [quando, setQuando] = useState<'agora' | 'depois'>('agora');
  const [data, setData] = useState('');
  const [preview, setPreview] = useState<{ total: number; optedOut: number; reachable: number } | null>(null);
  const [amostra, setAmostra] = useState<AudienceSample>([]);
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();
  const [vmin, setVmin] = useState(initialAudience.valueMin != null ? String(initialAudience.valueMin).replace('.', ',') : '');
  const [vmax, setVmax] = useState(initialAudience.valueMax != null ? String(initialAudience.valueMax).replace('.', ',') : '');

  const set = <K extends keyof Audience>(k: K, v: Audience[K]) => setAud((a) => ({ ...a, [k]: v }));

  const chave = JSON.stringify(aud);
  useEffect(() => {
    setPreview(null);
    const t = setTimeout(async () => {
      try {
        const r = await previewAudienceAction(JSON.parse(chave));
        if (r.ok) {
          setPreview(r.preview);
          setAmostra(r.sample);
        }
      } catch {
        // Sem conexão: fica "Contando…" até a próxima mudança.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [chave]);

  // Etapas: as dos funis marcados (ou de todos).
  const funisVisiveis = aud.pipelineIds.length ? pipelines.filter((p) => aud.pipelineIds.includes(p.id)) : pipelines;
  const tagsVisiveis = useMemo(() => {
    const q = achaTag.trim().toLowerCase();
    const lista = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
    // Marcadas (para receber ou para ficar de fora) sobem.
    const marcada = (t: TagOption) => Number(aud.tagIds.includes(t.id) || aud.excludeTagIds.includes(t.id));
    return [...lista].sort((a, b) => marcada(b) - marcada(a));
  }, [tags, achaTag, aud.tagIds, aud.excludeTagIds]);

  // O período no calendário. O público guarda dias fixos; se eles batem com
  // um atalho de hoje, o botão mostra o atalho (com os dias ao lado).
  const periodo: Period = {
    field: aud.dateField,
    preset: matchingPreset(aud.dateFrom, aud.dateTo, today),
    from: aud.dateFrom,
    to: aud.dateTo,
  };
  const mudaPeriodo = (p: Period) => {
    const r = resolvePeriod(p, today);
    setAud((a) => ({
      ...a,
      dateField: r ? p.field : 'criado',
      dateFrom: r?.from ?? '',
      dateTo: r?.to ?? '',
      // Fechado num período nunca está "em andamento".
      status: r && p.field === 'fechado' && a.status === 'abertos' ? 'todos' : a.status,
    }));
  };

  const t = templates.find((x) => x.id === templateId) ?? null;
  const exemplo =
    channel === 'cloud'
      ? t?.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => (params[Number(n) - 1] || `{{${n}}}`).replace(/\{nome\}/gi, 'Ana')) ?? ''
      : texto.replace(/\{nome\}/gi, 'Ana');
  const n = preview?.reachable ?? 0;

  // O que está filtrando, em palavras, para o resumo ao lado.
  const nomesDe = (ids: string[], opts: Option[]) => ids.map((x) => opts.find((o) => o.id === x)?.name).filter(Boolean).join(', ');
  const todasEtapas = pipelines.flatMap((p) => p.stages);
  const criterios: { label: string; valor: string }[] = [];
  criterios.push({ label: 'Situação', valor: SITUACOES.find((s) => s.v === aud.status)?.label ?? '' });
  if (aud.dateFrom || aud.dateTo) criterios.push({ label: FIELD_LABEL[aud.dateField], valor: rangeText(aud.dateFrom, aud.dateTo) });
  if (aud.stageIds.length) criterios.push({ label: 'Etapa', valor: nomesDe(aud.stageIds, todasEtapas) });
  else if (aud.pipelineIds.length) criterios.push({ label: 'Funil', valor: nomesDe(aud.pipelineIds, pipelines) });
  if (aud.tagIds.length) criterios.push({ label: aud.tagMode === 'all' ? 'Com todas as tags' : 'Com a tag', valor: nomesDe(aud.tagIds, tags) });
  if (aud.excludeTagIds.length) criterios.push({ label: 'Sem a tag', valor: nomesDe(aud.excludeTagIds, tags) });
  if (aud.sources.length) criterios.push({ label: 'Origem', valor: aud.sources.map((s) => SOURCE_LABEL[s]).join(', ') });
  if (aud.assignedToIds.length) criterios.push({ label: 'Responsável', valor: nomesDe(aud.assignedToIds, team) });
  if (aud.task) criterios.push({ label: 'Tarefas', valor: TAREFAS.find((x) => x.v === aud.task)?.label ?? '' });
  if (aud.valueMin != null || aud.valueMax != null) {
    const r = (v: number) => formatCents(Math.round(v * 100));
    criterios.push({
      label: 'Valor',
      valor: aud.valueMin != null && aud.valueMax != null ? `${r(aud.valueMin)} – ${r(aud.valueMax)}` : aud.valueMin != null ? `a partir de ${r(aud.valueMin)}` : `até ${r(aud.valueMax!)}`,
    });
  }
  if (aud.search) criterios.push({ label: 'Nome contém', valor: `"${aud.search}"` });
  const filtros = criterios.length - 1 + (aud.status !== 'abertos' ? 1 : 0);

  return (
    <form
      className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]"
      onSubmit={(e) => {
        e.preventDefault();
        setErro('');
        start(async () => {
          const r = await createBroadcastAction({
            name: nome,
            audience: aud,
            ...(channel === 'cloud' ? { templateId, templateParams: params } : { text: texto }),
            scheduledLocal: quando === 'depois' ? data : '',
          });
          if (!r.ok) return setErro(r.message);
          router.push(`/crm/automacoes/transmissoes/${r.broadcastId}`);
        });
      }}
    >
      <div className="min-w-0 space-y-6">
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">Nome (só para a equipe)</label>
          <input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Promoção de clareamento — outubro" className={`${inputCls} mt-1`} />
        </div>

        <section aria-labelledby={`${id}-publico`} className="space-y-5 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Step n={1} id={`${id}-publico`}>Quem recebe</Step>
            {filtros > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAud(EMPTY_AUDIENCE);
                  setVmin('');
                  setVmax('');
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpar filtros
              </button>
            )}
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">
            {fromSearch
              ? 'Os filtros vieram da busca de leads: quem estava na tela recebe. Ajuste aqui se quiser.'
              : 'Os mesmos filtros da busca de leads. Grupo sem nada marcado não filtra.'}
          </p>

          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <fieldset>
              <legend className={legendCls}>Situação do lead</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SITUACOES.map((s) => (
                  <Chip
                    key={s.v}
                    on={aud.status === s.v}
                    onClick={() =>
                      // "Em andamento" não tem data de fechamento: o período volta a contar pela entrada.
                      setAud((a) => ({ ...a, status: s.v, ...(s.v === 'abertos' && a.dateField === 'fechado' ? { dateField: 'criado' as const } : {}) }))
                    }
                  >
                    {s.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <PeriodPicker value={periodo} onChange={mudaPeriodo} today={today} label="Período" showDays />
          </div>

          {pipelines.length > 1 && (
            <fieldset>
              <legend className={legendCls}>Funil</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pipelines.map((p) => (
                  <Chip
                    key={p.id}
                    on={aud.pipelineIds.includes(p.id)}
                    onClick={() => {
                      const novos = alterna(aud.pipelineIds, p.id);
                      // Etapas de funil desmarcado saem junto.
                      const etapas = novos.length ? pipelines.filter((x) => novos.includes(x.id)).flatMap((x) => x.stages.map((s) => s.id)) : null;
                      setAud((a) => ({ ...a, pipelineIds: novos, stageIds: etapas ? a.stageIds.filter((s) => etapas.includes(s)) : a.stageIds }));
                    }}
                  >
                    {p.name}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend className={legendCls}>Etapa</legend>
            <div className="mt-1.5 space-y-2">
              {funisVisiveis.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-1.5">
                  {pipelines.length > 1 && <span className="mr-1 text-xs text-muted-foreground">{p.name}:</span>}
                  {p.stages.map((s) => (
                    <Chip key={s.id} on={aud.stageIds.includes(s.id)} onClick={() => set('stageIds', alterna(aud.stageIds, s.id))}>
                      {s.name}
                    </Chip>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={legendCls}>Tags</legend>
            {tags.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Nenhuma tag criada.</p>
            ) : (
              <>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <label htmlFor={`${id}-acha-tag`} className="sr-only">Localizar tags</label>
                  <input id={`${id}-acha-tag`} value={achaTag} onChange={(e) => setAchaTag(e.target.value)} placeholder="Localizar tags" className={`${inputCls} max-w-[220px]`} />
                  {aud.tagIds.length > 1 && (
                    <div role="group" aria-label="Como combinar as tags" className="segmented">
                      <button type="button" aria-pressed={aud.tagMode === 'any'} onClick={() => set('tagMode', 'any')} className="segmented-item">Qualquer uma</button>
                      <button type="button" aria-pressed={aud.tagMode === 'all'} onClick={() => set('tagMode', 'all')} className="segmented-item">Todas</button>
                    </div>
                  )}
                </div>
                <ul className="mt-2 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                  {tagsVisiveis.map((tg) => {
                    const dentro = aud.tagIds.includes(tg.id);
                    const fora = aud.excludeTagIds.includes(tg.id);
                    return (
                      <li key={tg.id}>
                        <button
                          type="button"
                          // Um clique: tem a tag. Outro: não tem a tag. Outro: tanto faz.
                          onClick={() =>
                            setAud((a) =>
                              dentro
                                ? { ...a, tagIds: a.tagIds.filter((x) => x !== tg.id), excludeTagIds: [...a.excludeTagIds, tg.id] }
                                : fora
                                  ? { ...a, excludeTagIds: a.excludeTagIds.filter((x) => x !== tg.id) }
                                  : { ...a, tagIds: [...a.tagIds, tg.id] },
                            )
                          }
                          aria-label={`${tg.name}, ${tg.count} leads: ${dentro ? 'recebe quem tem' : fora ? 'não recebe quem tem' : 'não filtra'}`}
                          className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${colorClasses(tg.color).chip} ${
                            dentro ? 'ring-2 ring-link' : fora ? 'line-through opacity-80 ring-2 ring-destructive' : ''
                          }`}
                        >
                          {fora && <span aria-hidden="true">sem</span>}
                          {tg.name}
                          <span className="tabular-nums opacity-75">{tg.count}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1.5 text-xs text-muted-foreground">Um clique: recebe quem tem a tag. Dois cliques: <strong className="font-medium">não</strong> recebe quem tem. Três: tira o filtro.</p>
              </>
            )}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className={legendCls}>Origem</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <Chip key={s} on={aud.sources.includes(s)} onClick={() => set('sources', alterna(aud.sources, s) as Audience['sources'])}>
                    {SOURCE_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className={legendCls}>Responsável</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {team.map((p) => (
                  <Chip key={p.id} on={aud.assignedToIds.includes(p.id)} onClick={() => set('assignedToIds', alterna(aud.assignedToIds, p.id))}>
                    {p.name}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className={legendCls}>Tarefas</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TAREFAS.map((x) => (
                  <Chip key={x.v || 'todas'} on={aud.task === x.v} onClick={() => set('task', x.v)}>
                    {x.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className={legendCls}>Valor de venda (R$)</legend>
              <div className="mt-1.5 flex items-center gap-2">
                <label htmlFor={`${id}-vmin`} className="sr-only">Valor mínimo (R$)</label>
                <input
                  id={`${id}-vmin`}
                  inputMode="decimal"
                  placeholder="de"
                  value={vmin}
                  onChange={(e) => {
                    setVmin(e.target.value);
                    set('valueMin', reaisDe(e.target.value));
                  }}
                  className={inputCls}
                />
                <span aria-hidden="true" className="text-muted-foreground">–</span>
                <label htmlFor={`${id}-vmax`} className="sr-only">Valor máximo (R$)</label>
                <input
                  id={`${id}-vmax`}
                  inputMode="decimal"
                  placeholder="até"
                  value={vmax}
                  onChange={(e) => {
                    setVmax(e.target.value);
                    set('valueMax', reaisDe(e.target.value));
                  }}
                  className={inputCls}
                />
              </div>
            </fieldset>
          </div>

          <div>
            <label htmlFor={`${id}-busca`} className={`block ${legendCls}`}>Nome do lead ou do negócio contém</label>
            <input
              id={`${id}-busca`}
              value={aud.search}
              onChange={(e) => set('search', e.target.value.slice(0, 80))}
              placeholder="Ex.: clareamento"
              className={`${inputCls} mt-1.5 max-w-sm`}
            />
          </div>
        </section>

        <section aria-labelledby={`${id}-msg`} className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <Step n={2} id={`${id}-msg`}>Mensagem</Step>
          {channel === 'cloud' ? (
            templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Na API oficial, transmissão só com modelo aprovado. Crie um em Automações › Modelos.</p>
            ) : (
              <>
                <label htmlFor={`${id}-modelo`} className="block text-xs font-medium text-muted-foreground">Modelo aprovado</label>
                <select
                  id={`${id}-modelo`}
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    const novo = templates.find((x) => x.id === e.target.value);
                    setParams(novo ? Array.from({ length: novo.variables }, (_, i) => (i === 0 ? '{nome}' : '')) : []);
                  }}
                  className={inputCls}
                >
                  <option value="">Escolha…</option>
                  {templates.map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
                {t &&
                  Array.from({ length: t.variables }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <label htmlFor={`${id}-p${i}`} className="w-12 shrink-0 font-mono text-xs">{`{{${i + 1}}}`}</label>
                      <input id={`${id}-p${i}`} value={params[i] ?? ''} onChange={(e) => setParams((xs) => Object.assign([...xs], { [i]: e.target.value }))} className={inputCls} />
                    </div>
                  ))}
                <p className="text-xs text-muted-foreground">Use {'{nome}'} numa variável para o primeiro nome de cada pessoa.</p>
              </>
            )
          ) : (
            <>
              <label htmlFor={`${id}-texto`} className="block text-xs font-medium text-muted-foreground">Texto ({'{nome}'} vira o primeiro nome)</label>
              <textarea
                id={`${id}-texto`}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Oi {nome}! Em outubro o clareamento está com 20% de desconto. Quer agendar uma avaliação? Responda SAIR para não receber mais."
                className="w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <p className="text-xs text-muted-foreground">
                Pelo QR code, as mensagens saem devagar, como uma pessoa mandando, para o número não ser bloqueado
                {n > 0 && ` — cerca de ${minutosQr(n)} min para ${n} pessoas`}.
              </p>
            </>
          )}
          {exemplo && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Como a Ana vai receber</p>
              <p className="mt-1 max-w-md whitespace-pre-wrap rounded-lg rounded-tl-none bg-bubble-out px-3 py-2 text-sm">{exemplo}</p>
            </div>
          )}
        </section>

        <fieldset className="space-y-2 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <legend className="sr-only">3. Quando</legend>
          <p aria-hidden="true" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-link">3</span>
            Quando
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`${id}-quando`} checked={quando === 'agora'} onChange={() => setQuando('agora')} className="h-4 w-4 accent-primary" />
            Agora
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`${id}-quando`} checked={quando === 'depois'} onChange={() => setQuando('depois')} className="h-4 w-4 accent-primary" />
            Agendar
          </label>
          {quando === 'depois' && (
            <div className="pl-6">
              <label htmlFor={`${id}-data`} className="sr-only">Data e hora</label>
              <input id={`${id}-data`} type="datetime-local" value={data} onChange={(e) => setData(e.target.value)} className={`${inputCls} max-w-xs`} />
            </div>
          )}
        </fieldset>
      </div>

      <aside aria-label="Resumo do público" className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
            <Users className="h-5 w-5 text-link" aria-hidden="true" />
            {preview ? (
              <span>
                <strong className="text-lg tabular-nums">{preview.reachable.toLocaleString('pt-BR')}</strong> {preview.reachable === 1 ? 'pessoa recebe' : 'pessoas recebem'}
              </span>
            ) : (
              'Contando…'
            )}
          </p>
          {preview && preview.optedOut > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{preview.optedOut} do filtro pediram para não receber (SAIR) e ficam de fora.</p>
          )}

          <dl className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
            {criterios.map((c) => (
              <div key={c.label} className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">{c.label}</dt>
                <dd className="min-w-0 break-words font-medium text-foreground">{c.valor}</dd>
              </div>
            ))}
          </dl>

          {amostra.length > 0 && (
            <>
              <p className="mt-3 border-t border-border pt-3 text-xs font-medium text-muted-foreground">Alguns de quem recebe</p>
              <ul className="mt-1 divide-y divide-border/70 text-sm">
                {amostra.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.stage}</span>
                  </li>
                ))}
              </ul>
              {preview && preview.reachable > amostra.length && (
                <p className="mt-1 text-xs text-muted-foreground">e mais {(preview.reachable - amostra.length).toLocaleString('pt-BR')}.</p>
              )}
            </>
          )}
        </div>

        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <button type="submit" disabled={pending || n === 0} className="btn-primary btn-md w-full">
          <Send className="h-4 w-4" aria-hidden="true" />
          {pending ? 'Salvando…' : quando === 'depois' ? `Agendar para ${n} ${n === 1 ? 'pessoa' : 'pessoas'}` : `Enviar para ${n} ${n === 1 ? 'pessoa' : 'pessoas'}`}
        </button>
      </aside>
    </form>
  );
}
