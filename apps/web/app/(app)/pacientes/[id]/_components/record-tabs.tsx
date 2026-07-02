'use client';

import { useId, useRef, useState } from 'react';

interface Tab {
  id: string;
  label: string;
  badge?: number;
  content: React.ReactNode;
}

/** Accessible tabs (roving tabindex + arrow keys) used by the patient record. */
export function RecordTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      setActive(tabs[next].id);
      refs.current[next]?.focus();
    }
  }

  return (
    <div>
      <div role="tablist" aria-label="Seções da ficha" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab, i) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => { refs.current[i] = el; }}
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={[
                'relative shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  {tab.badge}
                </span>
              )}
              {isActive && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden="true" />}
            </button>
          );
        })}
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
