'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FastForward, RotateCcw, Send, Smartphone, X } from 'lucide-react';
import { runFlow, type FlowContext, type FlowDoc, type FlowEffect, type FlowEvent, type FlowResult, type FlowState } from '@/crm/flow-engine';
import type { FlowRefs } from './flow-refs';

type Linha = { de: 'robo'; texto: string; botoes?: { id: string; title: string }[] } | { de: 'pessoa'; texto: string } | { de: 'crm'; texto: string };

/**
 * Testar o robô sem WhatsApp, como a prévia do Kommo: o mesmo motor que roda
 * nas conversas, um celular ao lado e o passo atual aceso no quadro. Nada é
 * gravado. No teste, a pessoa se chama Ana Souza.
 */
export function FlowSimulator({ doc, refs, onActive, onClose }: { doc: FlowDoc; refs: FlowRefs; onActive: (stepId: string | null) => void; onClose: () => void }) {
  const id = useId();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [estado, setEstado] = useState<FlowState | null>(null);
  const [texto, setTexto] = useState('');
  const [aberta, setAberta] = useState(true);
  const ctxRef = useRef<{ tagIds: string[]; stageId: string | null; fields: Record<string, string> }>({ tagIds: [], stageId: null, fields: {} });
  const rr = useRef<Record<string, number>>({});
  const fim = useRef<HTMLDivElement>(null);

  const nome = (l: { id: string; name: string }[], x?: string) => l.find((o) => o.id === x)?.name ?? '?';
  const descreve = (e: FlowEffect): string | null => {
    switch (e.type) {
      case 'createLead':
        return e.stageId ? `Lead criado na etapa ${nome(refs.stages, e.stageId)}` : 'Lead criado na entrada do funil';
      case 'stage':
        return `Lead vai para a etapa ${nome(refs.stages, e.stageId)}`;
      case 'tag':
        return `Tag “${nome(refs.tags, e.tagId)}” no lead`;
      case 'untag':
        return `Tag “${nome(refs.tags, e.tagId)}” sai do lead`;
      case 'assign':
        return `Responsável: ${nome(refs.team, e.userId)}`;
      case 'setField':
        return `${e.field === 'name' ? 'Nome' : e.field === 'email' ? 'E-mail' : e.field === 'note' ? 'Anotação' : nome(refs.fields, e.field.slice(6))}: ${e.value}`;
      case 'task':
        return `Tarefa criada: ${e.text}`;
      case 'note':
        return `Anotado: ${e.text}`;
      case 'notify':
        return `Aviso para a equipe: ${e.text}`;
      case 'handoff':
        return 'O robô para e a equipe assume a conversa';
      case 'startBot':
        return `Passa para o robô ${nome(refs.bots, e.botId)}`;
    }
  };

  const contexto = (): FlowContext => ({
    now: new Date(),
    tagIds: ctxRef.current.tagIds,
    stageId: ctxRef.current.stageId,
    source: 'WHATSAPP',
    fields: ctxRef.current.fields,
    open: aberta,
    vars: { name: 'Ana Souza', clinic: 'sua clínica', phone: '(11) 98765-4321', fieldsByName: {} },
    roundRobin: (stepId) => {
      const n = rr.current[stepId] ?? 0;
      rr.current[stepId] = n + 1;
      return n;
    },
  });

  const aplica = (r: FlowResult, antes: Linha[]) => {
    const novas = [...antes];
    for (const m of r.messages) novas.push({ de: 'robo', texto: m.text, botoes: m.buttons });
    for (const e of r.effects) {
      const t = descreve(e);
      if (t) novas.push({ de: 'crm', texto: t });
      if (e.type === 'tag' && !ctxRef.current.tagIds.includes(e.tagId)) ctxRef.current.tagIds.push(e.tagId);
      if (e.type === 'untag') ctxRef.current.tagIds = ctxRef.current.tagIds.filter((x) => x !== e.tagId);
      if (e.type === 'stage') ctxRef.current.stageId = e.stageId;
      if (e.type === 'setField' && e.field.startsWith('field:')) ctxRef.current.fields[e.field.slice(6)] = e.value ?? '';
    }
    if (!r.state && !r.effects.some((e) => e.type === 'handoff' || e.type === 'startBot')) novas.push({ de: 'crm', texto: 'Robô encerrado' });
    setLinhas(novas);
    setEstado(r.state);
    onActive(r.state?.stepId ?? r.visited.at(-1) ?? null);
  };

  const rodar = (ev: FlowEvent, antes: Linha[]) => {
    try {
      aplica(runFlow(doc, ev.kind === 'start' ? null : estado, ev, contexto()), antes);
    } catch {
      setLinhas([...antes, { de: 'crm', texto: 'O robô tem um passo incompleto.' }]);
      setEstado(null);
    }
  };

  const recomecar = () => {
    ctxRef.current = { tagIds: [], stageId: null, fields: {} };
    rr.current = {};
    rodar({ kind: 'start', text: 'Oi, boa tarde!' }, [{ de: 'pessoa', texto: 'Oi, boa tarde!' }]);
  };

  // Recomeça quando o robô muda.
  const chave = JSON.stringify({ s: doc.steps, start: doc.start, aberta });
  useEffect(() => {
    recomecar();
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest' });
  }, [linhas]);

  const responder = (t: string, buttonId?: string) => {
    if (!estado || !t.trim()) return;
    rodar({ kind: 'message', text: t, buttonId }, [...linhas, { de: 'pessoa', texto: t }]);
  };

  return (
    <section aria-labelledby={`${id}-t`} className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Smartphone className="h-4 w-4 text-link" aria-hidden="true" />
        <h2 id={`${id}-t`} className="flex-1 text-sm font-semibold">
          Testar o robô
        </h2>
        <button type="button" onClick={recomecar} className="btn-ghost btn-sm">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Recomeçar
        </button>
        <button type="button" onClick={onClose} aria-label="Fechar o teste" className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <label className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={aberta} onChange={(e) => setAberta(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
        Testar com a clínica atendendo agora
      </label>
      <div role="log" aria-label="Conversa de teste" className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-board p-3 text-sm">
        {linhas.map((l, i) =>
          l.de === 'crm' ? (
            <p key={i} className="text-center text-[11px] text-muted-foreground">
              {l.texto}
            </p>
          ) : (
            <div key={i} className={`flex ${l.de === 'pessoa' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 ${l.de === 'pessoa' ? 'bg-bubble-out' : 'bg-surface'}`}>
                <p className="whitespace-pre-wrap">{l.texto}</p>
                {l.de === 'robo' && l.botoes && i === linhas.map((x) => x.de).lastIndexOf('robo') && estado && (
                  <div className="mt-2 flex flex-col gap-1">
                    {l.botoes.map((b) => (
                      <button key={b.id} type="button" onClick={() => responder(b.title, b.id)} className="btn-outline btn-sm justify-center">
                        {b.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        <div ref={fim} />
      </div>
      {estado?.wakeAt && (
        <div className="border-t border-border px-3 py-2">
          <button type="button" onClick={() => rodar({ kind: 'timer' }, [...linhas, { de: 'crm', texto: 'O tempo passou' }])} className="btn-outline btn-sm w-full justify-center">
            <FastForward className="h-3.5 w-3.5" aria-hidden="true" /> Passar o tempo (sem resposta)
          </button>
        </div>
      )}
      <form
        className="flex items-center gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          responder(texto);
          setTexto('');
        }}
      >
        <label htmlFor={`${id}-msg`} className="sr-only">
          Responder como a pessoa
        </label>
        <input
          id={`${id}-msg`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={!estado}
          placeholder={estado ? 'Responda como a pessoa…' : 'Conversa encerrada. Clique em Recomeçar'}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
        />
        <button type="submit" disabled={!estado || !texto.trim()} className="btn-primary btn-sm" aria-label="Enviar resposta de teste">
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
