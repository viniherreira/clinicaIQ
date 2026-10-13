'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface SettingsSection {
  id: string;
  label: string;
  /** Grupo do menu ("Clínica", "Agenda"…). */
  group: string;
  badge?: number;
  panel: React.ReactNode;
  /** Endereços antigos que caem aqui (ex.: `#atendimento` das abas de antes). */
  aliases?: string[];
}

/**
 * Configurações com menu lateral por grupos, como no Clínica nas Nuvens: à
 * esquerda os grupos e as seções, à direita a seção escolhida. No celular, o
 * menu vira uma lista de escolha.
 *
 * A seção vai no hash da URL (`/configuracoes#plano`), para os avisos do
 * sistema levarem a pessoa direto aonde precisa. Trocar de seção usa
 * `replaceState`: não enche o histórico de voltas para a mesma tela.
 */
export function SettingsLayout({ sections }: { sections: SettingsSection[] }) {
  const id = useId();
  const [ativa, setAtiva] = useState(sections[0]?.id);
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const alvo = window.location.hash.replace('#', '');
      const achada = sections.find((s) => s.id === alvo || s.aliases?.includes(alvo));
      if (achada) setAtiva(achada.id);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [sections]);

  const escolher = (secao: string, foco = true) => {
    setAtiva(secao);
    window.history.replaceState(null, '', `#${secao}`);
    if (foco) painel.current?.focus();
  };

  const grupos = [...new Set(sections.map((s) => s.group))];
  const atual = sections.find((s) => s.id === ativa) ?? sections[0];

  return (
    <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8">
      <div className="mb-5 lg:hidden">
        <label htmlFor={`${id}-sel`} className="text-sm font-medium">Seção</label>
        <select
          id={`${id}-sel`}
          value={atual?.id}
          onChange={(e) => escolher(e.target.value, false)}
          className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {grupos.map((g) => (
            <optgroup key={g} label={g}>
              {sections
                .filter((s) => s.group === g)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      <nav aria-label="Seções das configurações" className="hidden lg:block">
        <div className="sticky top-4 space-y-5 rounded-xl border border-border bg-surface p-3 shadow-card">
          {grupos.map((g) => (
            <div key={g}>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
              <ul className="space-y-0.5">
                {sections
                  .filter((s) => s.group === g)
                  .map((s) => {
                    const on = s.id === atual?.id;
                    return (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          aria-current={on ? 'page' : undefined}
                          onClick={(e) => {
                            e.preventDefault();
                            escolher(s.id);
                          }}
                          className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                            on ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-surface-alt'
                          }`}
                        >
                          {s.label}
                          {s.badge != null && <span className="rounded-full bg-surface-alt px-1.5 text-xs text-muted-foreground">{s.badge}</span>}
                        </a>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div ref={painel} tabIndex={-1} aria-label={atual ? `Configurações: ${atual.label}` : undefined} role="region" className="min-w-0 space-y-6 focus:outline-none">
        {atual?.panel}
      </div>
    </div>
  );
}
