'use client';

import { useId, useRef, useState } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
  /** Badge vermelho: pede atenção (alerta de saúde, itens a fazer). */
  alert?: boolean;
  content: React.ReactNode;
}

/**
 * As abas da ficha (roving tabindex e setas). A aba aberta vai para o
 * endereço (`?aba=`), para voltar nela ao recarregar ou mandar o link.
 */
export function RecordTabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id);
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function open(id: string) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set('aba', id);
    window.history.replaceState(null, '', url);
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      open(tabs[next].id);
      refs.current[next]?.focus();
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 bg-background/90 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div role="tablist" aria-label="Seções da ficha" className="flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((tab, i) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="tab"
                id={`${baseId}-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => open(tab.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={[
                  'relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {tab.icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{tab.icon}</span>}
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      tab.alert ? 'bg-red-600 text-white' : isActive ? 'bg-primary/15 text-primary' : 'bg-surface-alt text-muted-foreground'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
                {isActive && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="pt-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
