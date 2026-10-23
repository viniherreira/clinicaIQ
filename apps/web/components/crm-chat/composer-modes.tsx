'use client';

import { useId, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ComposerMode {
  key: string;
  label: string;
  icon: LucideIcon;
  content: React.ReactNode;
}

/**
 * A caixa de baixo da ficha, como no Kommo: Bate-papo, Nota ou Tarefa. Abas de
 * verdade (setas trocam), e cada modo guarda o que foi digitado enquanto a
 * pessoa troca de um para outro.
 */
export function ComposerModes({ modes, initial }: { modes: ComposerMode[]; initial?: string }) {
  const id = useId();
  const [ativo, setAtivo] = useState(initial ?? modes[0]?.key);

  const mover = (de: string, passo: number) => {
    const i = modes.findIndex((m) => m.key === de);
    const proximo = modes[(i + passo + modes.length) % modes.length];
    setAtivo(proximo.key);
    document.getElementById(`${id}-${proximo.key}`)?.focus();
  };

  return (
    <div className="border-t border-border bg-surface">
      <div role="tablist" aria-label="Escrever" className="flex gap-4 px-4 pt-2.5 text-sm">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            id={`${id}-${m.key}`}
            aria-selected={ativo === m.key}
            aria-controls={`${id}-painel-${m.key}`}
            tabIndex={ativo === m.key ? 0 : -1}
            onClick={() => setAtivo(m.key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                mover(m.key, e.key === 'ArrowRight' ? 1 : -1);
              }
            }}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-1 focus-visible:outline-2 focus-visible:outline-ring ${
              ativo === m.key ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <m.icon className="h-4 w-4" aria-hidden="true" /> {m.label}
          </button>
        ))}
      </div>
      {modes.map((m) => (
        // Todos ficam montados (escondidos): trocar de aba não apaga o que foi escrito.
        <div key={m.key} id={`${id}-painel-${m.key}`} role="tabpanel" aria-labelledby={`${id}-${m.key}`} hidden={ativo !== m.key}>
          {m.content}
        </div>
      ))}
    </div>
  );
}
