'use client';

import { useEffect, useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Users, X } from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { SOURCE_LABEL } from '@/crm/format';
import { EMPTY_AUDIENCE, type Audience, type AudienceStatus } from '@/crm/audience';
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

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Minutos que a transmissão leva no QR (mesma conta de `gatewayDurationMinutes`). */
const minutosQr = (n: number) => Math.ceil((n * 20 + Math.floor(n / 20) * 120) / 60);

/** "AAAA-MM-DD" de hoje menos `dias`, no horário de Brasília. */
function diaMenos(dias: number) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const d = new Date(`${hoje}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

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

const alterna = (lista: string[], v: string) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

/**
 * Nova transmissão: quem recebe (os mesmos filtros da busca de leads), a
 * mensagem e quando. À direita, quantas pessoas recebem e quem são.
 */
export function BroadcastForm({
  initialAudience,
  pipelines,
  tags,
  team,
  channel,
  templates,
}: {
  initialAudience: Audience;
  pipelines: PipelineOption[];
  tags: TagOption[];
  team: Option[];
  channel: 'cloud' | 'gateway';
  templates: Template[];
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

  const set = <K extends keyof Audience>(k: K, v: Audience[K]) => setAud((a) => ({ ...a, [k]: v }));

  const chave = JSON.stringify(aud);
  useEffect(() => {
    setPreview(null);
    const t = setTimeout(async () => {
      const r = await previewAudienceAction(JSON.parse(chave));
      if (r.ok) {
        setPreview(r.preview);
        setAmostra(r.sample);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [chave]);

  // Etapas: as dos funis marcados (ou de todos).
  const funisVisiveis = aud.pipelineIds.length ? pipelines.filter((p) => aud.pipelineIds.includes(p.id)) : pipelines;
  const tagsVisiveis = useMemo(() => {
    const q = achaTag.trim().toLowerCase();
    return q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
  }, [tags, achaTag]);

  const periodo = (dias: number | 'mes' | '') => {
    if (dias === '') return setAud((a) => ({ ...a, createdFrom: '', createdTo: '' }));
    const de = dias === 'mes' ? `${diaMenos(0).slice(0, 8)}01` : diaMenos(dias);
    setAud((a) => ({ ...a, createdFrom: de, createdTo: '' }));
  };

  const t = templates.find((x) => x.id === templateId) ?? null;
  const exemplo =
    channel === 'cloud'
      ? t?.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => (params[Number(n) - 1] || `{{${n}}}`).replace(/\{nome\}/gi, 'Ana')) ?? ''
      : texto.replace(/\{nome\}/gi, 'Ana');
  const n = preview?.reachable ?? 0;
  const filtros =
    aud.pipelineIds.length + aud.stageIds.length + aud.tagIds.length + aud.excludeTagIds.length + aud.sources.length +
    aud.assignedToIds.length + (aud.createdFrom || aud.createdTo ? 1 : 0) + (aud.status !== 'abertos' ? 1 : 0);

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

        <section aria-labelledby={`${id}-publico`} className="space-y-5 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`${id}-publico`} className="text-sm font-semibold">1. Quem recebe</h3>
            {filtros > 0 && (
              <button type="button" onClick={() => setAud(EMPTY_AUDIENCE)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpar filtros
              </button>
            )}
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">Os mesmos filtros da busca de leads. Grupo sem nada marcado não filtra.</p>

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situação do lead</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SITUACOES.map((s) => (
                <Chip key={s.v} on={aud.status === s.v} onClick={() => set('status', s.v)}>{s.label}</Chip>
              ))}
            </div>
          </fieldset>

          {pipelines.length > 1 && (
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funil</legend>
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
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etapa</legend>
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
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</legend>
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

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dia em que o lead entrou</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip on={!aud.createdFrom && !aud.createdTo} onClick={() => periodo('')}>Qualquer dia</Chip>
              <Chip on={aud.createdFrom === diaMenos(0) && !aud.createdTo} onClick={() => periodo(0)}>Hoje</Chip>
              <Chip on={aud.createdFrom === diaMenos(6) && !aud.createdTo} onClick={() => periodo(6)}>Últimos 7 dias</Chip>
              <Chip on={aud.createdFrom === diaMenos(29) && !aud.createdTo} onClick={() => periodo(29)}>Últimos 30 dias</Chip>
              <Chip on={aud.createdFrom === `${diaMenos(0).slice(0, 8)}01` && !aud.createdTo} onClick={() => periodo('mes')}>Este mês</Chip>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor={`${id}-de`} className="text-xs text-muted-foreground">De</label>
              <input id={`${id}-de`} type="date" value={aud.createdFrom} onChange={(e) => set('createdFrom', e.target.value)} className={`${inputCls} w-auto`} />
              <label htmlFor={`${id}-ate`} className="text-xs text-muted-foreground">até</label>
              <input id={`${id}-ate`} type="date" value={aud.createdTo} onChange={(e) => set('createdTo', e.target.value)} className={`${inputCls} w-auto`} />
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Origem</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <Chip key={s} on={aud.sources.includes(s)} onClick={() => set('sources', alterna(aud.sources, s) as Audience['sources'])}>
                    {SOURCE_LABEL[s]}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsável</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {team.map((p) => (
                  <Chip key={p.id} on={aud.assignedToIds.includes(p.id)} onClick={() => set('assignedToIds', alterna(aud.assignedToIds, p.id))}>
                    {p.name}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section aria-labelledby={`${id}-msg`} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <h3 id={`${id}-msg`} className="text-sm font-semibold">2. Mensagem</h3>
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

        <fieldset className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <legend className="px-1 text-sm font-semibold">3. Quando</legend>
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
                <strong className="text-lg tabular-nums">{preview.reachable}</strong> {preview.reachable === 1 ? 'pessoa recebe' : 'pessoas recebem'}
              </span>
            ) : (
              'Contando…'
            )}
          </p>
          {preview && preview.optedOut > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{preview.optedOut} do filtro pediram para não receber (SAIR) e ficam de fora.</p>
          )}
          {amostra.length > 0 && (
            <>
              <p className="mt-3 text-xs font-medium text-muted-foreground">Alguns de quem recebe</p>
              <ul className="mt-1 divide-y divide-border/70 text-sm">
                {amostra.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.stage}</span>
                  </li>
                ))}
              </ul>
              {preview && preview.reachable > amostra.length && (
                <p className="mt-1 text-xs text-muted-foreground">e mais {preview.reachable - amostra.length}.</p>
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
