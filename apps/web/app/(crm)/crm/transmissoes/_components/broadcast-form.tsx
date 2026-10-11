'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Users } from 'lucide-react';
import { SOURCE_LABEL } from '@/crm/format';
import { createBroadcastAction, previewAudienceAction } from '../actions';

type Option = { id: string; name: string };
type Template = { id: string; name: string; body: string; variables: number };

const SOURCES = ['WHATSAPP', 'INDICACAO', 'INSTAGRAM', 'SITE', 'MANUAL', 'OUTRO'] as const;

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Minutos que a transmissão leva no QR (mesma conta de `gatewayDurationMinutes`). */
const minutosQr = (n: number) => Math.ceil((n * 20 + Math.floor(n / 20) * 120) / 60);

function Chips({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset>
      <legend className="text-xs font-medium text-muted-foreground">{legend}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
              className={`h-8 rounded-lg border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface text-muted-foreground hover:text-foreground'}`}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function BroadcastForm({
  stages,
  tags,
  team,
  channel,
  templates,
}: {
  stages: Option[];
  tags: Option[];
  team: Option[];
  channel: 'cloud' | 'gateway';
  templates: Template[];
}) {
  const id = useId();
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [assignedToIds, setAssigned] = useState<string[]>([]);
  const [texto, setTexto] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [quando, setQuando] = useState<'agora' | 'depois'>('agora');
  const [data, setData] = useState('');
  const [preview, setPreview] = useState<{ total: number; optedOut: number; reachable: number } | null>(null);
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();

  const audience = { stageIds, tagIds, sources, assignedToIds };
  const chave = JSON.stringify(audience);
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await previewAudienceAction(JSON.parse(chave));
      if (r.ok) setPreview(r.preview);
    }, 250);
    return () => clearTimeout(t);
  }, [chave]);

  const t = templates.find((x) => x.id === templateId) ?? null;
  const exemplo = channel === 'cloud'
    ? t?.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => (params[Number(n) - 1] || `{{${n}}}`).replace(/\{nome\}/gi, 'Ana')) ?? ''
    : texto.replace(/\{nome\}/gi, 'Ana');
  const n = preview?.reachable ?? 0;

  return (
    <form
      className="mt-6 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErro('');
        start(async () => {
          const r = await createBroadcastAction({
            name: nome,
            audience,
            ...(channel === 'cloud' ? { templateId, templateParams: params } : { text: texto }),
            scheduledLocal: quando === 'depois' ? data : '',
          });
          if (!r.ok) return setErro(r.message);
          router.push(`/crm/transmissoes/${r.broadcastId}`);
        });
      }}
    >
      <div>
        <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">Nome (só para a equipe)</label>
        <input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Promoção de clareamento — outubro" className={`${inputCls} mt-1`} />
      </div>

      <section aria-labelledby={`${id}-publico`} className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 id={`${id}-publico`} className="text-sm font-semibold">Quem recebe</h2>
        <p className="text-xs text-muted-foreground">Leads abertos. Sem nada marcado num grupo, ele não filtra.</p>
        <Chips legend="Etapas" options={stages} value={stageIds} onChange={setStageIds} />
        <Chips legend="Tags" options={tags} value={tagIds} onChange={setTagIds} />
        <Chips legend="Origem" options={SOURCES.map((s) => ({ id: s, name: SOURCE_LABEL[s] }))} value={sources} onChange={setSources} />
        <Chips legend="Responsável" options={team} value={assignedToIds} onChange={setAssigned} />
        <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-surface-alt px-3 py-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {preview ? (
            <span>
              <strong>{preview.reachable}</strong> {preview.reachable === 1 ? 'pessoa recebe' : 'pessoas recebem'}
              {preview.optedOut > 0 && ` · ${preview.optedOut} pediram para não receber`}
            </span>
          ) : (
            'Contando…'
          )}
        </p>
      </section>

      <section aria-labelledby={`${id}-msg`} className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 id={`${id}-msg`} className="text-sm font-semibold">Mensagem</h2>
        {channel === 'cloud' ? (
          templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Na API oficial, transmissão só com modelo aprovado. Crie um em CRM → WhatsApp.</p>
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
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              {t &&
                Array.from({ length: t.variables }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <label htmlFor={`${id}-p${i}`} className="w-12 shrink-0 font-mono text-xs">{`{{${i + 1}}}`}</label>
                    <input
                      id={`${id}-p${i}`}
                      value={params[i] ?? ''}
                      onChange={(e) => setParams((xs) => Object.assign([...xs], { [i]: e.target.value }))}
                      className={inputCls}
                    />
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
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm">{exemplo}</p>
          </div>
        )}
      </section>

      <fieldset className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <legend className="px-1 text-sm font-semibold">Quando</legend>
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

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <button type="submit" disabled={pending || n === 0} className="btn-primary btn-md">
        <Send className="h-4 w-4" aria-hidden="true" />
        {pending ? 'Salvando…' : quando === 'depois' ? `Agendar para ${n} ${n === 1 ? 'pessoa' : 'pessoas'}` : `Enviar para ${n} ${n === 1 ? 'pessoa' : 'pessoas'}`}
      </button>
    </form>
  );
}
