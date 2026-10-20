'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronLeft, LayoutGrid, List, Plus, Settings2, Smartphone, Wand2 } from 'lucide-react';
import type { ChatbotTrigger } from '@clinicaiq/db';
import { DEFAULT_HOURS, type BotHours } from '@/crm/bot-engine';
import { flowProblem, stepHandles, type FlowDoc, type FlowStep, type FlowStepType } from '@/crm/flow-engine';
import { autoLayout } from '@/crm/flow-legacy';
import { newId, newStep, STEP_META, STEP_ORDER, triggerLabel } from '@/crm/flow-templates';
import { saveFlowAction } from '../actions';
import type { FlowRefs } from './flow-refs';
import { FlowSimulator } from './flow-simulator';
import { StartNode, StepNode, type StepNodeData } from './step-node';
import { StepPanel } from './step-panel';

export interface FlowBotMeta {
  id: string | null;
  name: string;
  trigger: ChatbotTrigger;
  keywords: string[];
  active: boolean;
}

const nodeTypes = { step: StepNode, start: StartNode };
const START = '__start__';
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const TRIGGERS: { v: ChatbotTrigger; label: string; hint: string }[] = [
  { v: 'NEW_CONTACT', label: 'Número novo', hint: 'Primeira mensagem de alguém que a clínica não conhece.' },
  { v: 'KEYWORD', label: 'Palavra-chave', hint: 'A pessoa escreve uma palavra, como "menu".' },
  { v: 'STAGE', label: 'Lead entra numa etapa', hint: 'O lead é criado ou movido para a etapa do funil.' },
  { v: 'TAG', label: 'Tag posta no lead', hint: 'Alguém (ou a automação) põe a tag.' },
  { v: 'NO_REPLY', label: 'Sem resposta', hint: 'A clínica falou por último e a pessoa sumiu há algumas horas.' },
];

export function FlowEditor(props: { meta: FlowBotMeta; doc: FlowDoc; refs: FlowRefs }) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor({ meta: inicial, doc: docInicial, refs }: { meta: FlowBotMeta; doc: FlowDoc; refs: FlowRefs }) {
  const router = useRouter();
  const id = useId();
  const rf = useReactFlow();
  const [doc, setDoc] = useState<FlowDoc>(docInicial);
  const [meta, setMeta] = useState(inicial);
  const [keywords, setKeywords] = useState(inicial.keywords.join(', '));
  const [selected, setSelected] = useState<string | null>(null);
  const [painel, setPainel] = useState<'config' | 'step' | 'teste'>('config');
  const [vista, setVista] = useState<'quadro' | 'lista'>('quadro');
  const [ativo, setAtivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  // Robô novo (de modelo ou em branco) ainda não foi salvo.
  const [sujo, setSujo] = useState(inicial.id == null);
  const [menuSolto, setMenuSolto] = useState<{ x: number; y: number; source: string; handle: string } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const ordem = Object.keys(doc.steps);
  const numberOf = useCallback((sid: string) => {
    const i = ordem.indexOf(sid);
    return i < 0 ? null : i + 1;
  }, [ordem.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (fn: (d: FlowDoc) => FlowDoc) => {
    setDoc((d) => fn(d));
    setSujo(true);
  };

  // Sair com coisa não salva pergunta antes.
  useEffect(() => {
    if (!sujo) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sujo]);

  const metaComKw = { ...meta, keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean) };
  const layout = doc.layout ?? {};
  const nodes: Node[] = useMemo(
    () => [
      {
        id: START,
        type: 'start',
        position: layout[START] ?? { x: (layout[doc.start]?.x ?? 0) - 300, y: (layout[doc.start]?.y ?? 0) + 30 },
        data: { label: triggerLabel(metaComKw, doc, refs) },
        deletable: false,
        selectable: false,
      },
      ...ordem.map((sid, i) => ({
        id: sid,
        type: 'step',
        position: layout[sid] ?? { x: i * 40, y: i * 40 },
        selected: sid === selected,
        data: { step: doc.steps[sid], n: i + 1, refs, isStart: sid === doc.start, active: sid === ativo, numberOf } satisfies StepNodeData,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, selected, ativo, refs, keywords, meta.trigger],
  );
  const edges: Edge[] = useMemo(() => {
    const out: Edge[] = [{ id: 'e-start', source: START, sourceHandle: 'start', target: doc.start, markerEnd: { type: MarkerType.ArrowClosed }, className: 'flow-edge' }];
    for (const s of Object.values(doc.steps)) {
      for (const h of stepHandles(s)) {
        const alvo = s.out[h.key];
        if (alvo && doc.steps[alvo]) out.push({ id: `e:${s.id}:${h.key}`, source: s.id, sourceHandle: h.key, target: alvo, markerEnd: { type: MarkerType.ArrowClosed } });
      }
      if (s.type === 'goto' && s.target && doc.steps[s.target]) {
        out.push({ id: `g:${s.id}`, source: s.id, target: s.target, animated: true, style: { strokeDasharray: '4 4' }, selectable: false, deletable: false });
      }
    }
    return out;
  }, [doc]);

  const onNodesChange = (changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position) {
        const p = c.position;
        mudar((d) => ({ ...d, layout: { ...(d.layout ?? {}), [c.id]: { x: Math.round(p.x), y: Math.round(p.y) } } }));
      }
      if (c.type === 'remove' && c.id !== START) apagar(c.id);
    }
  };

  const ligar = (source: string, handle: string, target: string) => {
    if (source === START) mudar((d) => ({ ...d, start: target }));
    else mudar((d) => ({ ...d, steps: { ...d.steps, [source]: { ...d.steps[source], out: { ...d.steps[source].out, [handle]: target } } as FlowStep } }));
  };

  const onConnect = (c: Connection) => {
    if (c.source && c.target && c.target !== START) ligar(c.source, c.sourceHandle ?? 'next', c.target);
  };

  // Soltou a seta no vazio: escolhe o tipo do passo novo ali (como no Kommo).
  const onConnectEnd = (event: MouseEvent | TouchEvent, s: FinalConnectionState) => {
    if (s.isValid || !s.fromNode || !s.fromHandle) return;
    const pt = 'changedTouches' in event ? event.changedTouches[0] : event;
    setMenuSolto({ x: pt.clientX, y: pt.clientY, source: s.fromNode.id, handle: s.fromHandle.id ?? 'next' });
  };

  const criar = (type: FlowStepType, onde?: { x: number; y: number }, ligarDe?: { source: string; handle: string }) => {
    const step = newStep(type);
    const pos = onde
      ? rf.screenToFlowPosition(onde)
      : (() => {
          const r = wrapper.current?.getBoundingClientRect();
          return rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 });
        })();
    mudar((d) => ({ ...d, steps: { ...d.steps, [step.id]: step }, layout: { ...(d.layout ?? {}), [step.id]: { x: Math.round(pos.x), y: Math.round(pos.y) } } }));
    if (ligarDe) ligar(ligarDe.source, ligarDe.handle, step.id);
    setSelected(step.id);
    setPainel('step');
  };

  const apagar = (sid: string) => {
    mudar((d) => {
      const steps: Record<string, FlowStep> = {};
      for (const [k, s] of Object.entries(d.steps)) {
        if (k === sid) continue;
        const out = Object.fromEntries(Object.entries(s.out).map(([h, t]) => [h, t === sid ? undefined : t]));
        steps[k] = { ...s, out, ...(s.type === 'goto' && s.target === sid ? { target: '' } : {}) } as FlowStep;
      }
      const restantes = Object.keys(steps);
      if (restantes.length === 0) {
        const novo = newStep('message', 'inicio');
        return { ...d, start: 'inicio', steps: { inicio: novo } };
      }
      return { ...d, steps, start: d.start === sid ? restantes[0] : d.start };
    });
    if (selected === sid) {
      setSelected(null);
      setPainel('config');
    }
  };

  const duplicar = (sid: string) => {
    const s = doc.steps[sid];
    if (!s) return;
    const novo = { ...structuredClone(s), id: newId(), out: {} } as FlowStep;
    const p = layout[sid] ?? { x: 0, y: 0 };
    mudar((d) => ({ ...d, steps: { ...d.steps, [novo.id]: novo }, layout: { ...(d.layout ?? {}), [novo.id]: { x: p.x + 40, y: p.y + 220 } } }));
    setSelected(novo.id);
  };

  const organizar = () => {
    mudar((d) => ({ ...d, layout: autoLayout(d) }));
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 50);
  };

  const salvar = async () => {
    const problema = flowProblem(doc);
    if (problema) {
      setAviso(problema);
      return;
    }
    setSalvando(true);
    setAviso('');
    const r = await saveFlowAction({ id: meta.id ?? undefined, name: meta.name, trigger: meta.trigger, keywords, active: meta.active, doc }).catch(() => ({
      ok: false as const,
      message: 'Não foi possível salvar. Tente de novo.',
    }));
    setSalvando(false);
    if (!r.ok) return setAviso(r.message);
    setSujo(false);
    setAviso('Robô salvo.');
    if (!meta.id) {
      setMeta((m) => ({ ...m, id: r.id }));
      router.replace(`/crm/automacoes/bots/${r.id}`);
    } else router.refresh();
  };

  const sel = selected ? doc.steps[selected] : null;
  const passos = ordem.map((sid, i) => ({ id: sid, n: i + 1, label: STEP_META[doc.steps[sid].type].label }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra de cima: nome, ligado, vista, testar, salvar. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <Link href="/crm/automacoes/bots" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Robôs
        </Link>
        <label htmlFor={`${id}-nome`} className="sr-only">
          Nome do robô
        </label>
        <input
          id={`${id}-nome`}
          value={meta.name}
          maxLength={60}
          onChange={(e) => {
            setMeta({ ...meta, name: e.target.value });
            setSujo(true);
          }}
          className="h-9 min-w-[160px] max-w-xs flex-1 rounded-lg border border-transparent bg-transparent px-2 text-base font-semibold hover:border-border focus-visible:border-border focus-visible:outline-2 focus-visible:outline-ring"
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            checked={meta.active}
            onChange={(e) => {
              setMeta({ ...meta, active: e.target.checked });
              setSujo(true);
            }}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-5 w-9 rounded-full bg-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-green-600 peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring"
          />
          {meta.active ? 'Ligado' : 'Desligado'}
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Como ver o robô" className="segmented">
            <button type="button" aria-pressed={vista === 'quadro'} onClick={() => setVista('quadro')} className="segmented-item inline-flex items-center gap-1 px-2.5">
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" /> Quadro
            </button>
            <button type="button" aria-pressed={vista === 'lista'} onClick={() => setVista('lista')} className="segmented-item inline-flex items-center gap-1 px-2.5">
              <List className="h-3.5 w-3.5" aria-hidden="true" /> Lista
            </button>
          </div>
          <button type="button" onClick={() => setPainel('config')} aria-pressed={painel === 'config'} className="btn-outline btn-sm">
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" /> Gatilho e público
          </button>
          <button type="button" onClick={() => setPainel(painel === 'teste' ? 'config' : 'teste')} aria-pressed={painel === 'teste'} className="btn-outline btn-sm">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Testar
          </button>
          <button type="button" onClick={salvar} disabled={salvando} className="btn-primary btn-sm">
            {salvando ? 'Salvando…' : sujo ? 'Salvar' : 'Salvo'}
          </button>
        </div>
        <p role="status" aria-live="polite" className={`w-full text-xs ${aviso && aviso !== 'Robô salvo.' ? 'text-destructive' : 'text-muted-foreground'} ${aviso ? '' : 'sr-only'}`}>
          {aviso}
        </p>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={wrapper} className="relative min-w-0 flex-1 bg-board">
          {vista === 'quadro' ? (
            <>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={(changes) => {
                  for (const c of changes) {
                    if (c.type !== 'remove') continue;
                    const [, src, ...h] = c.id.split(':');
                    if (c.id.startsWith('e:') && src) mudar((d) => ({ ...d, steps: { ...d.steps, [src]: { ...d.steps[src], out: { ...d.steps[src].out, [h.join(':')]: undefined } } as FlowStep } }));
                  }
                }}
                onConnect={onConnect}
                onConnectEnd={onConnectEnd}
                onNodeClick={(_, n) => {
                  if (n.id === START) {
                    setSelected(null);
                    setPainel('config');
                    return;
                  }
                  setSelected(n.id);
                  setPainel('step');
                }}
                onPaneClick={() => {
                  setSelected(null);
                  setMenuSolto(null);
                  if (painel === 'step') setPainel('config');
                }}
                colorMode="dark"
                style={{ background: 'hsl(var(--board))' }}
                defaultEdgeOptions={{ style: { stroke: 'hsl(var(--link))', strokeWidth: 1.6, opacity: 0.75 } }}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                deleteKeyCode={['Delete']}
                proOptions={{ hideAttribution: true }}
                aria-label="Quadro do robô"
              >
                <Background gap={22} size={1.2} />
                <Controls showInteractive={false} />
                <MiniMap
                  pannable
                  zoomable
                  className="!bg-surface"
                  maskColor="rgba(10,20,40,0.55)"
                  nodeColor={(n) => (n.id === START ? 'hsl(171 77% 64%)' : 'hsl(219 40% 40%)')}
                  nodeStrokeColor={() => 'hsl(219 30% 60%)'}
                  aria-label="Mapa do robô"
                />
              </ReactFlow>
              <div className="absolute left-3 top-3 z-10 flex gap-2">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger className="btn-primary btn-sm shadow-lg">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Passo
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="start" sideOffset={6} className="z-50 w-72 rounded-xl border border-border bg-popover p-1 shadow-xl">
                      {STEP_ORDER.map((t) => (
                        <DropdownMenu.Item key={t} onSelect={() => criar(t)} className="flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-alt">
                          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${STEP_META[t].tone}`} aria-hidden="true" />
                          <span>
                            <span className="block font-medium">{STEP_META[t].label}</span>
                            <span className="block text-xs text-muted-foreground">{STEP_META[t].description}</span>
                          </span>
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
                <button type="button" onClick={organizar} className="btn-outline btn-sm bg-surface shadow-lg">
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" /> Organizar
                </button>
              </div>
              {menuSolto && (
                <div
                  role="menu"
                  aria-label="Tipo do passo novo"
                  className="fixed z-50 w-60 rounded-xl border border-border bg-popover p-1 shadow-xl"
                  style={{ left: menuSolto.x, top: menuSolto.y }}
                >
                  <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Novo passo ligado aqui:</p>
                  {STEP_ORDER.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        criar(t, { x: menuSolto.x, y: menuSolto.y }, { source: menuSolto.source, handle: menuSolto.handle });
                        setMenuSolto(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${STEP_META[t].tone}`} aria-hidden="true" />
                      {STEP_META[t].label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <ListaDePassos doc={doc} passos={passos} onEdit={(sid) => { setSelected(sid); setPainel('step'); }} onLink={ligar} onAdd={(t) => criar(t)} />
          )}
        </div>

        <aside aria-label="Painel do robô" className="flex w-full max-w-[380px] shrink-0 flex-col border-l border-border bg-surface">
          {painel === 'teste' ? (
            <FlowSimulator doc={doc} refs={refs} onActive={setAtivo} onClose={() => { setPainel('config'); setAtivo(null); }} />
          ) : painel === 'step' && sel ? (
            <StepPanel
              key={sel.id}
              step={sel}
              n={numberOf(sel.id) ?? 0}
              isStart={doc.start === sel.id}
              steps={passos}
              refs={refs}
              onChange={(s) => mudar((d) => ({ ...d, steps: { ...d.steps, [s.id]: s } }))}
              onDelete={() => apagar(sel.id)}
              onDuplicate={() => duplicar(sel.id)}
              onMakeStart={() => mudar((d) => ({ ...d, start: sel.id }))}
              onClose={() => {
                setSelected(null);
                setPainel('config');
              }}
            />
          ) : (
            <Configuracao
              meta={meta}
              keywords={keywords}
              doc={doc}
              refs={refs}
              onMeta={(m) => {
                setMeta(m);
                setSujo(true);
              }}
              onKeywords={(k) => {
                setKeywords(k);
                setSujo(true);
              }}
              onDoc={mudar}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

/** A vista em lista: os mesmos passos, cada saída um seletor "vai para" (teclado e leitor de tela). */
function ListaDePassos({
  doc,
  passos,
  onEdit,
  onLink,
  onAdd,
}: {
  doc: FlowDoc;
  passos: { id: string; n: number; label: string }[];
  onEdit: (id: string) => void;
  onLink: (source: string, handle: string, target: string) => void;
  onAdd: (t: FlowStepType) => void;
}) {
  const id = useId();
  return (
    <div className="h-full overflow-y-auto p-4">
      <ol className="mx-auto max-w-2xl space-y-3" aria-label="Passos do robô">
        {passos.map((p) => {
          const s = doc.steps[p.id];
          return (
            <li key={p.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${STEP_META[s.type].tone}`} aria-hidden="true" />
                <h3 className="flex-1 text-sm font-semibold">
                  Passo {p.n} · {p.label}
                  {doc.start === p.id && <span className="ml-2 text-xs font-normal text-link">(início)</span>}
                </h3>
                <button type="button" onClick={() => onEdit(p.id)} className="btn-outline btn-sm">
                  Editar<span className="sr-only"> o passo {p.n}</span>
                </button>
              </div>
              {s.type === 'message' && s.text && <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{s.text}</p>}
              {stepHandles(s).length > 0 && (
                <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {stepHandles(s).map((h) => (
                    <div key={h.key} className="flex items-center gap-2 text-xs">
                      <dt className="w-32 shrink-0 truncate text-muted-foreground">
                        <label htmlFor={`${id}-${p.id}-${h.key}`}>{h.label} →</label>
                      </dt>
                      <dd className="min-w-0 flex-1">
                        <select
                          id={`${id}-${p.id}-${h.key}`}
                          value={s.out[h.key] ?? ''}
                          onChange={(e) => onLink(p.id, h.key, e.target.value)}
                          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <option value="">{h.key === 'other' && s.type === 'message' && s.buttons.length ? '"Não entendi" (padrão)' : 'Termina'}</option>
                          {passos
                            .filter((x) => x.id !== p.id)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                Passo {x.n} · {x.label}
                              </option>
                            ))}
                        </select>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mx-auto mt-3 max-w-2xl">
        <label htmlFor={`${id}-novo`} className="sr-only">
          Adicionar passo
        </label>
        <select
          id={`${id}-novo`}
          value=""
          onChange={(e) => e.target.value && onAdd(e.target.value as FlowStepType)}
          className="h-9 w-full rounded-lg border border-dashed border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="">+ Adicionar passo…</option>
          {STEP_ORDER.map((t) => (
            <option key={t} value={t}>
              {STEP_META[t].label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Painel sem passo escolhido: o gatilho, o público e o horário do robô. */
function Configuracao({
  meta,
  keywords,
  doc,
  refs,
  onMeta,
  onKeywords,
  onDoc,
}: {
  meta: FlowBotMeta;
  keywords: string;
  doc: FlowDoc;
  refs: FlowRefs;
  onMeta: (m: FlowBotMeta) => void;
  onKeywords: (k: string) => void;
  onDoc: (fn: (d: FlowDoc) => FlowDoc) => void;
}) {
  const id = useId();
  const cfg = doc.trigger ?? {};
  const hours: BotHours = doc.hours ?? DEFAULT_HOURS;
  const aud = doc.audience ?? { anyTags: [], noneTags: [] };
  const setCfg = (patch: Partial<typeof cfg>) => onDoc((d) => ({ ...d, trigger: { ...(d.trigger ?? {}), ...patch } }));
  const setHours = (h: BotHours) => onDoc((d) => ({ ...d, hours: h }));
  const toggle = (lista: string[] | undefined, x: string) => ((lista ?? []).includes(x) ? (lista ?? []).filter((y) => y !== x) : [...(lista ?? []), x]);

  const chips = (lista: { id: string; name: string }[], escolhidos: string[] | undefined, onPick: (x: string) => void, label: string) => (
    <div role="group" aria-label={label} className="mt-1.5 flex flex-wrap gap-1.5">
      {lista.length === 0 && <p className="text-xs text-muted-foreground">Nada cadastrado ainda.</p>}
      {lista.map((o) => {
        const on = (escolhidos ?? []).includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(o.id)}
            className={`rounded-md border px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-ring ${on ? 'border-link bg-primary/15 text-link' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Gatilho e público</h2>
        <p className="text-xs text-muted-foreground">Quando o robô começa e para quem. Clique numa caixa do quadro para editar o passo.</p>
      </div>
      <div className="space-y-5 px-4 py-4">
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">Começa quando</legend>
          <div className="mt-1.5 space-y-1.5">
            {TRIGGERS.map((t) => (
              <label key={t.v} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${meta.trigger === t.v ? 'border-link bg-primary/10' : 'border-border'}`}>
                <input
                  type="radio"
                  name={`${id}-gat`}
                  checked={meta.trigger === t.v}
                  onChange={() => onMeta({ ...meta, trigger: t.v })}
                  aria-describedby={`${id}-gat-${t.v}`}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="font-medium">
                  {t.label}
                  <span id={`${id}-gat-${t.v}`} className="block text-xs font-normal text-muted-foreground">
                    {t.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {meta.trigger === 'KEYWORD' && (
          <div>
            <label htmlFor={`${id}-kw`} className="block text-xs font-medium text-muted-foreground">
              Palavras-chave (separadas por vírgula)
            </label>
            <input id={`${id}-kw`} value={keywords} onChange={(e) => onKeywords(e.target.value)} placeholder="menu, oi, olá" className={`${inputCls} mt-1`} />
          </div>
        )}
        {meta.trigger === 'STAGE' && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Etapas que fazem o robô começar</p>
            {chips(refs.stages, cfg.stageIds, (x) => setCfg({ stageIds: toggle(cfg.stageIds, x) }), 'Etapas do gatilho')}
            <p className="mt-1 text-xs text-muted-foreground">Fora da janela de 24 h da API oficial, a primeira mensagem precisa de um modelo aprovado.</p>
          </div>
        )}
        {meta.trigger === 'TAG' && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Tags que fazem o robô começar</p>
            {chips(refs.tags, cfg.tagIds, (x) => setCfg({ tagIds: toggle(cfg.tagIds, x) }), 'Tags do gatilho')}
          </div>
        )}
        {meta.trigger === 'NO_REPLY' && (
          <div>
            <label htmlFor={`${id}-h`} className="block text-xs font-medium text-muted-foreground">
              Começa depois de quantas horas sem resposta
            </label>
            <input id={`${id}-h`} type="number" min={1} max={720} value={cfg.hours ?? 24} onChange={(e) => setCfg({ hours: Math.min(720, Math.max(1, Number(e.target.value) || 1)) })} className={`${inputCls} mt-1 w-28`} />
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground">Só para leads com alguma destas tags</p>
          {chips(refs.tags, aud.anyTags, (x) => onDoc((d) => ({ ...d, audience: { ...aud, anyTags: toggle(aud.anyTags, x), noneTags: aud.noneTags.filter((y) => y !== x) } })), 'Só para leads com')}
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Nunca para leads com estas tags</p>
          {chips(refs.tags, aud.noneTags, (x) => onDoc((d) => ({ ...d, audience: { ...aud, noneTags: toggle(aud.noneTags, x), anyTags: aud.anyTags.filter((y) => y !== x) } })), 'Nunca para leads com')}
        </div>

        <div className="space-y-2">
          <label htmlFor={`${id}-modo`} className="block text-xs font-medium text-muted-foreground">
            Em que horário pode começar
          </label>
          <select id={`${id}-modo`} value={hours.mode} onChange={(e) => setHours({ ...hours, mode: e.target.value as BotHours['mode'] })} className={inputCls}>
            <option value="always">A qualquer hora</option>
            <option value="outside">Só fora do horário de atendimento</option>
            <option value="inside">Só no horário de atendimento</option>
          </select>
          <p className="text-xs text-muted-foreground">O horário de atendimento abaixo também vale para a condição &quot;horário&quot;.</p>
          <div role="group" aria-label="Dias de atendimento" className="flex flex-wrap gap-1">
            {DIAS.map((d, i) => {
              const on = hours.days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHours({ ...hours, days: on ? hours.days.filter((x) => x !== i) : [...hours.days, i].sort() })}
                  className={`h-8 w-10 rounded-md border text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${on ? 'border-link bg-primary/15 text-link' : 'border-border text-muted-foreground'}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor={`${id}-ini`} className="text-xs text-muted-foreground">
              Das
            </label>
            <input id={`${id}-ini`} type="time" value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} className={`${inputCls} w-auto`} />
            <label htmlFor={`${id}-fim`} className="text-xs text-muted-foreground">
              às
            </label>
            <input id={`${id}-fim`} type="time" value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} className={`${inputCls} w-auto`} />
          </div>
        </div>
      </div>
    </div>
  );
}
