'use client';

import { useId, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { fillQuickReply } from '@/crm/quick-replies';

export interface QuickReplyOption {
  id: string;
  title: string;
  body: string;
}

/**
 * A caixa de texto da conversa. Enter envia, Shift+Enter quebra a linha.
 * Começar com "/" abre as respostas rápidas, filtradas pelo que vem depois.
 */
export function ChatComposer({
  onSend,
  quickReplies,
  contactName,
  disabled,
  disabledReason,
  placeholder = 'Escreva uma mensagem…',
}: {
  onSend: (text: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  quickReplies: QuickReplyOption[];
  contactName: string | null;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [fechado, setFechado] = useState(false);

  const busca = texto.startsWith('/') && !texto.includes('\n') ? texto.slice(1).toLowerCase() : null;
  const opcoes =
    busca === null || fechado
      ? []
      : quickReplies.filter((q) => q.title.toLowerCase().includes(busca) || q.body.toLowerCase().includes(busca)).slice(0, 8);
  const aberto = opcoes.length > 0;
  const listaId = `${id}-respostas`;

  function escolher(q: QuickReplyOption) {
    setTexto(fillQuickReply(q.body, contactName));
    setAtivo(0);
    setFechado(true);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando || disabled) return;
    setEnviando(true);
    setErro('');
    const r = await onSend(t);
    setEnviando(false);
    if (!r.ok) return setErro(r.message);
    setTexto('');
    setFechado(false);
    ref.current?.focus();
  }

  return (
    <div className="relative border-t border-border bg-surface p-3">
      {aberto && (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Respostas rápidas"
          className="absolute bottom-full left-3 right-3 mb-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          {opcoes.map((q, i) => (
            <li
              key={q.id}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(q);
              }}
              className={`cursor-pointer rounded-md px-3 py-2 text-sm ${i === ativo ? 'bg-primary/10' : 'hover:bg-surface-alt'}`}
            >
              <span className="font-medium">/{q.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{q.body}</span>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor={`${id}-texto`} className="sr-only">
          Mensagem
        </label>
        <textarea
          ref={ref}
          id={`${id}-texto`}
          value={texto}
          disabled={disabled}
          onChange={(e) => {
            setTexto(e.target.value);
            setErro('');
            setAtivo(0);
            if (!e.target.value.startsWith('/')) setFechado(false);
          }}
          onKeyDown={(e) => {
            if (aberto) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                return setAtivo((a) => (a + 1) % opcoes.length);
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                return setAtivo((a) => (a - 1 + opcoes.length) % opcoes.length);
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                return escolher(opcoes[ativo] ?? opcoes[0]);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                return setFechado(true);
              }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={Math.min(6, Math.max(1, texto.split('\n').length))}
          maxLength={4096}
          placeholder={disabled ? disabledReason : quickReplies.length ? `${placeholder} ( / respostas rápidas)` : placeholder}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={aberto ? listaId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={aberto ? `${listaId}-${ativo}` : undefined}
          aria-invalid={erro ? true : undefined}
          aria-describedby={`${id}-dica${erro ? ` ${id}-erro` : ''}`}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
        />
        <button type="submit" disabled={disabled || enviando || !texto.trim()} className="btn-primary h-10 w-10 shrink-0 p-0" aria-label="Enviar">
          <SendHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      <p id={`${id}-dica`} className="sr-only">
        Enter envia; Shift mais Enter quebra a linha.{quickReplies.length ? ' Comece com barra para escolher uma resposta rápida.' : ''}
      </p>
      {erro && (
        <p id={`${id}-erro`} role="alert" className="mt-1.5 text-xs text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
