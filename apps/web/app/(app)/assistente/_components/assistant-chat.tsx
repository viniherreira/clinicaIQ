'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Sparkles, Send, CalendarDays, Wallet, Users, BarChart3 } from 'lucide-react';
import { askAssistant } from '../actions';
import { LogoMark } from '@/components/logo';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
}

const TOOL_LABELS: Record<string, string> = {
  consultar_agenda: 'Agenda',
  resumo_financeiro: 'Financeiro',
  buscar_paciente: 'Pacientes',
  estatisticas: 'Estatísticas',
};

const SUGGESTIONS = [
  { icon: CalendarDays, text: 'Como está a agenda de hoje?' },
  { icon: Wallet, text: 'Quanto recebemos este mês?' },
  { icon: BarChart3, text: 'Quantas faltas tivemos nos últimos 30 dias?' },
  { icon: Users, text: 'Qual a situação financeira do paciente Maria?' },
];

export function AssistantChat({ enabled }: { enabled: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, isPending]);

  function send(text: string) {
    const message = text.trim();
    if (!message || isPending) return;
    setError(null);
    setInput('');

    const nextTurns: Turn[] = [...turns, { role: 'user', content: message }];
    setTurns(nextTurns);

    // Send a bounded window of history to keep requests small.
    const history = nextTurns.slice(-12).map(({ role, content }) => ({ role, content }));

    startTransition(async () => {
      const res = await askAssistant(history);
      if (res.ok) {
        setTurns((prev) => [...prev, { role: 'assistant', content: res.reply, toolsUsed: res.toolsUsed }]);
      } else {
        setError(res.error);
        setTurns((prev) => prev.slice(0, -1));
        setInput(message);
      }
      inputRef.current?.focus();
    });
  }

  if (!enabled) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Assistente ClinicaIQ</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            O assistente responde perguntas sobre a agenda, os pacientes e o financeiro
            da clínica em linguagem natural. Para ativá-lo, o administrador do sistema
            precisa configurar a chave de API de inteligência artificial.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-4 sm:px-6">
      {/* Conversation */}
      <div className="flex-1 overflow-y-auto py-6" aria-live="polite">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Assistente ClinicaIQ</h1>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Pergunte sobre a agenda, os pacientes ou o financeiro. As respostas
              vêm dos dados reais da clínica.
            </p>
            <div className="mt-6 grid w-full max-w-md gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(({ icon: Icon, text }) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => send(text)}
                  className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-left text-xs font-medium transition-colors hover:border-primary/40 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-4">
            {turns.map((t, i) => (
              <li key={i} className={`flex gap-2.5 ${t.role === 'user' ? 'justify-end' : ''}`}>
                {t.role === 'assistant' && <LogoMark size="sm" className="mt-0.5" />}
                <div className={`max-w-[85%] ${t.role === 'user' ? 'order-first' : ''}`}>
                  <div
                    className={
                      t.role === 'user'
                        ? 'rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground'
                        : 'rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-2.5 text-sm shadow-card'
                    }
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{t.content}</p>
                  </div>
                  {t.role === 'assistant' && t.toolsUsed && t.toolsUsed.length > 0 && (
                    <p className="mt-1 pl-1 text-[11px] text-muted-foreground">
                      Consultou: {t.toolsUsed.map((x) => TOOL_LABELS[x] ?? x).join(' · ')}
                    </p>
                  )}
                </div>
              </li>
            ))}
            {isPending && (
              <li className="flex gap-2.5">
                <LogoMark size="sm" className="mt-0.5" />
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 shadow-card" aria-label="Assistente pensando">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: '300ms' }} />
                </div>
              </li>
            )}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border pb-4 pt-3">
        {error && (
          <p role="alert" className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre a agenda, pacientes ou financeiro..."
            aria-label="Pergunta para o assistente"
            maxLength={2000}
            className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            aria-label="Enviar pergunta"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary-hover disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Send className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          As respostas vêm dos dados da clínica. Confira informações críticas antes de decidir.
        </p>
      </div>
    </div>
  );
}
