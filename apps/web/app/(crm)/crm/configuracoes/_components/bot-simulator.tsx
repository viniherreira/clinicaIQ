'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { RotateCcw, Send, Smartphone } from 'lucide-react';
import { continueBot, isOpenAt, startBot, type BotAction, type BotDecision, type BotHours } from '@/crm/bot-engine';
import { toSteps, type UiMenu } from '@/crm/bot-form';

type Option = { id: string; name: string };
type Linha =
  | { de: 'robo'; texto: string; botoes?: { id: string; title: string }[] }
  | { de: 'pessoa'; texto: string }
  | { de: 'crm'; texto: string };

/**
 * Testar o robô sem WhatsApp: a mesma regra que roda nas conversas, aqui na
 * tela. Toque nos botões (ou escreva) e veja o que ele responde e o que faria
 * no CRM. Nada é gravado.
 */
export function BotSimulator({ menu, hours, refs }: { menu: UiMenu; hours: BotHours; refs: { stages: Option[]; tags: Option[]; team: Option[]; fields?: Option[] } }) {
  const id = useId();
  const flow = useMemo(() => toSteps(menu, hours), [menu, hours]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [estado, setEstado] = useState<{ stepId: string; misses: number } | null>(null);
  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  const nome = (l: Option[], x: string) => l.find((o) => o.id === x)?.name ?? '?';
  const descreve = (a: BotAction): string | null => {
    switch (a.type) {
      case 'createLead':
        return a.stageId ? null : 'Lead criado na entrada do funil';
      case 'stage':
        return `Lead vai para a etapa ${nome(refs.stages, a.stageId)}`;
      case 'tag':
        return `Tag “${nome(refs.tags, a.tagId)}” no lead`;
      case 'assign':
        return `Responsável: ${nome(refs.team, a.userId)}`;
      case 'save':
        if (a.field.startsWith('field:')) return `${nome(refs.fields ?? [], a.field.slice(6))}: ${a.value}`;
        return a.field === 'name' ? `Nome do lead: ${a.value}` : a.field === 'email' ? `E-mail do lead: ${a.value}` : `Anotado no histórico: ${a.value}`;
      case 'handoff':
        return 'Robô para — a equipe assume a conversa';
    }
  };

  const aplica = (d: BotDecision, antes: Linha[]) => {
    const novas: Linha[] = [...antes];
    for (const m of d.messages) novas.push({ de: 'robo', texto: m.text, botoes: m.buttons });
    for (const a of d.actions) {
      const t = descreve(a);
      if (t) novas.push({ de: 'crm', texto: t });
    }
    if (!d.next && !d.actions.some((a) => a.type === 'handoff')) novas.push({ de: 'crm', texto: 'Robô encerrado' });
    setLinhas(novas);
    setEstado(d.next);
  };

  const recomecar = () => {
    try {
      aplica(startBot(flow), [{ de: 'pessoa', texto: 'Oi, boa tarde!' }]);
    } catch {
      setLinhas([]);
      setEstado(null);
    }
  };

  // Recomeça quando o robô muda (o texto do menu, um botão…).
  const chave = JSON.stringify(flow.steps);
  useEffect(() => {
    recomecar();
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest' });
  }, [linhas]);

  const responder = (t: string, buttonId?: string) => {
    if (!estado || !t.trim()) return;
    const antes: Linha[] = [...linhas, { de: 'pessoa', texto: t }];
    aplica(continueBot(flow, estado, { text: t, buttonId }), antes);
  };

  const ultimoRobo = [...linhas].reverse().find((l): l is Extract<Linha, { de: 'robo' }> => l.de === 'robo');
  const agoraAberto = isOpenAt(hours, new Date());

  return (
    <section aria-labelledby={`${id}-t`} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 id={`${id}-t`} className="flex items-center gap-1.5 text-sm font-semibold">
          <Smartphone className="h-4 w-4 text-link" aria-hidden="true" /> Teste o robô
        </h3>
        <button type="button" onClick={recomecar} className="btn-ghost btn-sm inline-flex items-center gap-1">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Recomeçar
        </button>
      </div>
      {hours.mode !== 'always' && (
        <p className="border-b border-border bg-surface-alt/60 px-3 py-1.5 text-xs text-muted-foreground">
          Agora a clínica está {agoraAberto ? 'no horário' : 'fora do horário'}:{' '}
          {(hours.mode === 'outside') !== agoraAberto ? 'este robô responderia.' : 'este robô não responderia agora.'}
        </p>
      )}
      <div role="log" aria-label="Conversa de teste" className="h-[420px] space-y-2 overflow-y-auto bg-board p-3 text-sm">
        {linhas.map((l, i) =>
          l.de === 'crm' ? (
            <p key={i} className="mx-auto w-fit max-w-[90%] rounded-full bg-surface-alt px-2.5 py-0.5 text-center text-[11px] text-muted-foreground">
              ⚙ {l.texto}
            </p>
          ) : (
            <div key={i} className={`flex ${l.de === 'pessoa' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 shadow-sm ${
                  l.de === 'pessoa' ? 'rounded-tr-none bg-bubble-out' : 'rounded-tl-none bg-surface'
                }`}
              >
                <span className="sr-only">{l.de === 'pessoa' ? 'Pessoa: ' : 'Robô: '}</span>
                {l.texto}
              </div>
            </div>
          ),
        )}
        {ultimoRobo?.botoes && estado && (
          <div className="flex flex-col items-start gap-1">
            {ultimoRobo.botoes.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => responder(b.title, b.id)}
                className="w-[85%] rounded-lg border border-link/50 bg-surface px-3 py-1.5 text-center text-sm font-medium text-link hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {b.title}
              </button>
            ))}
          </div>
        )}
        <div ref={fim} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          responder(texto);
          setTexto('');
        }}
      >
        <label htmlFor={`${id}-msg`} className="sr-only">Responder como a pessoa</label>
        <input
          id={`${id}-msg`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={!estado}
          placeholder={estado ? 'Responda como a pessoa…' : 'Conversa encerrada — clique em Recomeçar'}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
        />
        <button type="submit" disabled={!estado || !texto.trim()} className="btn-primary btn-sm" aria-label="Enviar resposta de teste">
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
