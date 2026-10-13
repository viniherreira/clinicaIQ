'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Menu, Search, X } from 'lucide-react';
import { can } from '@/lib/permissions';
import { activeHref, navFor } from './app-sidebar';
import { ModuleSwitcher, type Space } from './module-switcher';
import { ThemeToggle } from './theme-toggle';
import { LogoMark, LogoWordmark } from './logo';
import { UserMenu } from './user-menu';
import { UnitSwitcher, type UnitChoice } from './unit-switcher';

export function AppHeader({
  clinicName,
  userName,
  userEmail,
  role,
  roleLabel,
  canConfig,
  canPlanos,
  space = 'clinic',
  showSwitcher = false,
  units = null,
}: {
  clinicName: string;
  /** Quem está logado agora — não a clínica, não o dono. */
  userName: string;
  userEmail: string;
  role: string;
  roleLabel: string;
  canConfig: boolean;
  canPlanos: boolean;
  space?: Space;
  showSwitcher?: boolean;
  /** Mais de uma unidade que a pessoa vê: o seletor de unidade. */
  units?: UnitChoice | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const buscaId = useId();
  const [busca, setBusca] = useState('');
  // O menu do celular precisa esconder exatamente o mesmo que a lateral.
  const itens = navFor(role, space);
  const ativo = activeHref(itens, pathname);
  const atual = itens.find((i) => i.href === ativo);
  // A busca rápida de paciente, como a do topo do Clínica nas Nuvens: Enter abre a lista filtrada.
  const buscaPaciente = space === 'clinic' && can(role, 'pacientes');

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6 print:hidden">
        {/* Mobile menu + brand */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-alt hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2 md:hidden">
          <LogoMark size="sm" />
        </div>

        {atual && (
          <nav aria-label="Você está em" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
            {atual.group && atual.group !== atual.label && (
              <>
                <span className="text-muted-foreground">{atual.group}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
              </>
            )}
            <span className="truncate font-medium text-foreground" aria-current="page">{atual.label}</span>
          </nav>
        )}

        <div className="flex-1" />

        {units && <UnitSwitcher units={units} />}

        {buscaPaciente && (
          <form
            role="search"
            className="relative hidden w-72 lg:block"
            onSubmit={(e) => {
              e.preventDefault();
              const q = busca.trim();
              setBusca('');
              router.push(q ? `/pacientes?q=${encodeURIComponent(q)}` : '/pacientes');
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <label htmlFor={buscaId} className="sr-only">Buscar paciente</label>
            <input
              id={buscaId}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar paciente…"
              className="h-9 w-full rounded-lg border border-border bg-surface-alt/60 pl-8 pr-2 text-sm placeholder:text-muted-foreground focus:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
          </form>
        )}

        {/* O CRM é sempre escuro (components/crm-theme.tsx). */}
        {space !== 'crm' && <ThemeToggle />}
        <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

        <UserMenu
          userName={userName}
          userEmail={userEmail}
          roleLabel={roleLabel}
          clinicName={clinicName}
          canConfig={canConfig}
          canPlanos={canPlanos}
        />
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
          <nav aria-label="Menu principal" className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-2xl animate-fade-in">
            <div className="flex h-16 items-center justify-between px-5">
              <div className="flex items-center gap-2.5">
                <LogoMark size="md" />
                <LogoWordmark className="text-[15px] font-semibold tracking-tight" />
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {showSwitcher && (
              <div className="px-3">
                <ModuleSwitcher space={space} onNavigate={() => setOpen(false)} />
              </div>
            )}
            <ul className="flex-1 space-y-1 overflow-y-auto p-3">
              {itens.map((item) => {
                const active = item.href === ativo;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground',
                      ].join(' ')}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border px-5 py-3 text-sm text-muted-foreground">{clinicName}</div>
          </nav>
        </div>
      )}
    </>
  );
}
