'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { Logo, LogoMark } from './logo';
import { ModuleSwitcher } from './module-switcher';
import type { LucideIcon } from 'lucide-react';

export interface ClinicNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: string;
}

/** A ordem dos grupos no menu. Item sem grupo fica solto no topo. */
export const CLINIC_GROUPS = ['Atendimento', 'Financeiro', 'Relacionamento', 'Configurações'] as const;

const FECHADOS_KEY = 'menu-grupos-fechados';
const RECOLHIDO_KEY = 'menu-recolhido';

/**
 * O menu da clínica no jeito do Clínica nas Nuvens: branco, com busca no topo,
 * grupos que abrem e fecham e o item atual pintado. Dá para recolher só nos
 * ícones; a escolha fica guardada neste navegador.
 *
 * A busca filtra os itens enquanto se digita; Enter abre o primeiro.
 */
export function ClinicSidebar({
  items,
  active,
  clinicName,
  showSwitcher,
}: {
  items: ClinicNavItem[];
  active: string | undefined;
  clinicName: string;
  showSwitcher: boolean;
}) {
  const router = useRouter();
  const buscaId = useId();
  const [busca, setBusca] = useState('');
  const [fechados, setFechados] = useState<string[]>([]);
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    try {
      setFechados(JSON.parse(localStorage.getItem(FECHADOS_KEY) ?? '[]'));
      setRecolhido(localStorage.getItem(RECOLHIDO_KEY) === '1');
    } catch {
      // Sem acesso ao armazenamento do navegador: tudo aberto, menu largo.
    }
  }, []);

  function alternarGrupo(g: string) {
    const novos = fechados.includes(g) ? fechados.filter((x) => x !== g) : [...fechados, g];
    setFechados(novos);
    try {
      localStorage.setItem(FECHADOS_KEY, JSON.stringify(novos));
    } catch {}
  }

  function alternarRecolhido() {
    setRecolhido((r) => {
      try {
        localStorage.setItem(RECOLHIDO_KEY, r ? '0' : '1');
      } catch {}
      return !r;
    });
  }

  const termo = busca.trim().toLowerCase();
  const achados = useMemo(
    () => (termo ? items.filter((i) => `${i.label} ${i.group ?? ''}`.toLowerCase().includes(termo)) : []),
    [items, termo],
  );
  const soltos = items.filter((i) => !i.group);
  const grupos = CLINIC_GROUPS.map((g) => ({ nome: g, itens: items.filter((i) => i.group === g) })).filter((g) => g.itens.length);

  return (
    <nav
      aria-label="Menu principal"
      className={`hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex print:!hidden ${recolhido ? 'w-[72px]' : 'w-64'}`}
    >
      <div className={`flex h-14 items-center gap-2 ${recolhido ? 'justify-center px-2' : 'justify-between px-4'}`}>
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {recolhido ? (
            <>
              <LogoMark size="md" />
              <span className="sr-only">DreamClin</span>
            </>
          ) : (
            <Logo size="md" />
          )}
        </Link>
        {!recolhido && (
          <button
            type="button"
            onClick={alternarRecolhido}
            aria-label="Recolher o menu"
            title="Recolher o menu"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {recolhido ? (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={alternarRecolhido}
            aria-label="Abrir o menu"
            title="Abrir o menu"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="space-y-2 px-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <label htmlFor={buscaId} className="sr-only">
              Pesquisar no menu
            </label>
            <input
              id={buscaId}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && achados[0]) {
                  e.preventDefault();
                  setBusca('');
                  router.push(achados[0].href);
                }
                if (e.key === 'Escape') setBusca('');
              }}
              placeholder="Pesquisar…"
              className="h-9 w-full rounded-lg border border-border bg-surface-alt/60 pl-8 pr-2 text-sm placeholder:text-muted-foreground focus:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
          </div>
          {showSwitcher && <ModuleSwitcher space="clinic" />}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {termo ? (
          achados.length ? (
            <ul className="space-y-0.5" aria-label="Resultados da pesquisa">
              {achados.map((i) => (
                <Item key={i.href} item={i} active={i.href === active} recolhido={false} />
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nada com “{busca.trim()}”.</p>
          )
        ) : (
          <>
            <ul className="space-y-0.5">
              {soltos.map((i) => (
                <Item key={i.href} item={i} active={i.href === active} recolhido={recolhido} />
              ))}
            </ul>
            {grupos.map((g) => {
              const temAtivo = g.itens.some((i) => i.href === active);
              const aberto = recolhido || temAtivo || !fechados.includes(g.nome);
              const listaId = `${buscaId}-${g.nome}`;
              return (
                <div key={g.nome} className="mt-3">
                  {recolhido ? (
                    <div className="mx-auto my-2 h-px w-8 bg-border" aria-hidden="true" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => alternarGrupo(g.nome)}
                      aria-expanded={aberto}
                      aria-controls={listaId}
                      disabled={temAtivo}
                      className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:hover:text-muted-foreground"
                    >
                      {g.nome}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? '' : '-rotate-90'}`} aria-hidden="true" />
                    </button>
                  )}
                  {aberto && (
                    <ul id={listaId} className="mt-0.5 space-y-0.5" aria-label={g.nome}>
                      {g.itens.map((i) => (
                        <Item key={i.href} item={i} active={i.href === active} recolhido={recolhido} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className={`flex items-center gap-2.5 rounded-lg ${recolhido ? 'justify-center' : 'bg-surface-alt px-3 py-2.5'}`} title={clinicName}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-xs font-semibold text-white">
            <span aria-hidden="true">{clinicName.slice(0, 2).toUpperCase()}</span>
          </div>
          {recolhido ? (
            <span className="sr-only">Clínica: {clinicName}</span>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{clinicName}</p>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                Ativo
              </p>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function Item({ item, active, recolhido }: { item: ClinicNavItem; active: boolean; recolhido: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        title={recolhido ? item.label : undefined}
        className={[
          'flex items-center gap-3 rounded-lg text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
          recolhido ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
          active ? 'bg-primary/10 font-semibold text-primary-hover dark:text-sky-300' : 'font-medium text-foreground/75 hover:bg-surface-alt hover:text-foreground',
        ].join(' ')}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <span className={recolhido ? 'sr-only' : 'truncate'}>{item.label}</span>
      </Link>
    </li>
  );
}
