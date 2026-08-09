'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * Abas seguindo o padrão ARIA de tablist.
 *
 * Escrito à mão em vez de puxar uma dependência porque o comportamento de
 * teclado é o produto aqui: seta esquerda/direita circula entre as abas, Home e
 * End vão para a primeira e a última, e só a aba ativa fica no fluxo do Tab —
 * assim quem navega por teclado passa pela barra inteira com um toque, não com
 * seis.
 *
 * A aba escolhida vai para o hash da URL para a tela poder ser linkada
 * diretamente: o aviso de assinatura manda para `/configuracoes#plano` e a
 * pessoa cai onde precisa, em vez de na primeira aba.
 */

export interface TabDef {
  id: string;
  label: string;
  /** Contador opcional à direita do rótulo (ex.: quantidade de profissionais). */
  badge?: number;
  panel: React.ReactNode;
}

export function Tabs({ tabs, ariaLabel }: { tabs: TabDef[]; ariaLabel: string }) {
  const base = useId();
  const [active, setActive] = useState(tabs[0]?.id);
  const refs = useRef(new Map<string, HTMLButtonElement | null>());

  // Lê o hash na montagem e acompanha voltar/avançar do navegador.
  useEffect(() => {
    const sync = () => {
      const alvo = window.location.hash.replace('#', '');
      if (alvo && tabs.some((t) => t.id === alvo)) setActive(alvo);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [tabs]);

  const escolher = useCallback((id: string, moverFoco = false) => {
    setActive(id);
    // `replaceState` em vez de mudar o hash direto: trocar de aba não deveria
    // encher o histórico de voltas para a mesma tela.
    window.history.replaceState(null, '', `#${id}`);
    if (moverFoco) refs.current.get(id)?.focus();
  }, []);

  // O handler vive em cada aba, não no contêiner: `tablist` não é focável, então
  // um `onKeyDown` ali só dispararia por borbulhamento e deixaria o contêiner
  // parecendo interativo sem ser alcançável — que é exatamente o que a regra
  // jsx-a11y/interactive-supports-focus reclama, com razão.
  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    if (i < 0) return;
    let proximo: number | null = null;

    if (e.key === 'ArrowRight') proximo = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') proximo = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') proximo = 0;
    else if (e.key === 'End') proximo = tabs.length - 1;

    if (proximo !== null) {
      e.preventDefault();
      escolher(tabs[proximo].id, true);
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-1 overflow-x-auto border-b border-border pb-px"
      >
        {tabs.map((t) => {
          const selecionada = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current.set(t.id, el);
              }}
              role="tab"
              id={`${base}-tab-${t.id}`}
              type="button"
              aria-selected={selecionada}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => escolher(t.id)}
              onKeyDown={onKeyDown}
              className={`shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                selecionada
                  ? 'border-b-2 border-primary text-foreground'
                  : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {typeof t.badge === 'number' && (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                    selecionada ? 'bg-primary/15 text-primary' : 'bg-surface-alt text-muted-foreground'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== active}
          // Focável para o painel ser alcançável por teclado logo depois da aba,
          // como o padrão ARIA recomenda quando o painel não começa com um
          // elemento interativo.
          tabIndex={0}
          className="pt-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t.id === active && t.panel}
        </div>
      ))}
    </div>
  );
}
