'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Lista de opções desenhada por nós.
 *
 * Existe porque a lista aberta de um `<select>` nativo é desenhada pelo sistema
 * operacional e não aceita CSS nenhum: dava para estilizar o campo fechado, mas
 * ao clicar aparecia a caixa branca com fonte do Windows, que não combinava com
 * nada em volta.
 *
 * Segue o padrão ARIA de listbox, então o que se ganha em aparência não se perde
 * em teclado: setas andam pelas opções, Home e End vão aos extremos, Enter e
 * Espaço escolhem, Esc fecha e devolve o foco ao botão, e digitar uma letra pula
 * para a primeira opção que começa com ela — tudo o que o nativo já fazia.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Linha de apoio, quando o rótulo sozinho não basta. */
  hint?: string;
}

export function SelectField({
  value,
  options,
  onChange,
  disabled,
  id,
  ariaLabel,
  className = '',
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const auto = useId();
  const botaoId = id ?? `sel-${auto}`;
  const listaId = `${botaoId}-lista`;

  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const raizRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const digitado = useRef({ texto: '', quando: 0 });

  const selecionada = options.find((o) => o.value === value);

  // Fecha ao clicar fora. Sem isto a lista fica presa aberta quando a pessoa
  // desiste e clica em outro lugar da tela.
  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!raizRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  // Mantém a opção destacada visível quando a navegação é por teclado.
  useEffect(() => {
    if (!aberto) return;
    listaRef.current?.querySelector<HTMLElement>('[data-ativo="true"]')?.scrollIntoView({
      block: 'nearest',
    });
  }, [aberto, ativo]);

  function abrir() {
    if (disabled) return;
    setAtivo(Math.max(0, options.findIndex((o) => o.value === value)));
    setAberto(true);
  }

  function escolher(i: number) {
    const opcao = options[i];
    if (!opcao) return;
    onChange(opcao.value);
    setAberto(false);
    botaoRef.current?.focus();
  }

  function porLetra(letra: string) {
    const agora = Date.now();
    // Digitar "pro" rápido procura "pro"; depois de uma pausa, recomeça.
    const texto = agora - digitado.current.quando < 700 ? digitado.current.texto + letra : letra;
    digitado.current = { texto, quando: agora };

    const alvo = options.findIndex((o) => o.label.toLowerCase().startsWith(texto.toLowerCase()));
    if (alvo >= 0) {
      setAtivo(alvo);
      if (!aberto) escolher(alvo);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    if (e.key === 'Escape') {
      if (aberto) {
        e.preventDefault();
        setAberto(false);
        botaoRef.current?.focus();
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (aberto) escolher(ativo);
      else abrir();
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aberto) {
        abrir();
        return;
      }
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      setAtivo((i) => (i + passo + options.length) % options.length);
      return;
    }

    if (e.key === 'Home' || e.key === 'End') {
      if (!aberto) return;
      e.preventDefault();
      setAtivo(e.key === 'Home' ? 0 : options.length - 1);
      return;
    }

    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      porLetra(e.key);
    }
  }

  return (
    <div ref={raizRef} className={`relative ${className}`}>
      <button
        ref={botaoRef}
        id={botaoId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? listaId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={onKeyDown}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background pl-3 pr-2.5 text-sm font-medium transition-colors hover:border-muted-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selecionada?.label ?? '—'}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <ul
          ref={listaRef}
          id={listaId}
          role="listbox"
          aria-labelledby={botaoId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="absolute z-50 mt-1.5 max-h-64 w-full min-w-max overflow-auto rounded-lg border border-border bg-surface p-1 shadow-lg animate-fade-in"
        >
          {options.map((o, i) => {
            const marcada = o.value === value;
            const destacada = i === ativo;
            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- o teclado é tratado no contêiner, como manda o padrão de listbox
              <li
                key={o.value}
                role="option"
                aria-selected={marcada}
                data-ativo={destacada}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(i)}
                className={`flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-sm ${
                  destacada ? 'bg-primary/10' : ''
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={`mt-0.5 h-4 w-4 shrink-0 text-primary ${marcada ? '' : 'invisible'}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span className="min-w-0">
                  <span className={`block ${marcada ? 'font-medium' : ''}`}>{o.label}</span>
                  {o.hint && (
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {o.hint}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
