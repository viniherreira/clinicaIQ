'use client';

import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { LogoMark } from './logo';

type RailItem = { href: string; label: string; short?: string; icon: React.ComponentType<{ className?: string }> };

/**
 * O menu do CRM no jeito do Kommo: uma faixa escura e estreita, ícone em cima
 * e nome embaixo, com o número de conversas não lidas em vermelho.
 *
 * O nome curto (`short`) é só o que cabe na faixa; o leitor de tela ouve o
 * nome inteiro, que começa pelo curto (o que se vê também é o que se fala).
 */
export function CrmRail({
  items,
  active,
  counts,
  clinicName,
  showSwitcher,
}: {
  items: RailItem[];
  active: string | undefined;
  counts: Record<string, number>;
  clinicName: string;
  showSwitcher: boolean;
}) {
  return (
    <nav aria-label="Menu principal" className="hidden w-[92px] shrink-0 flex-col bg-rail text-rail-foreground md:flex print:!hidden">
      <div className="flex h-16 items-center justify-center">
        <LogoMark size="md" />
        <span className="sr-only">ClinicaIQ CRM</span>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-3">
        {items.map((item) => {
          const atual = item.href === active;
          const Icon = item.icon;
          const n = counts[item.href] ?? 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={atual ? 'page' : undefined}
                aria-label={item.short ? item.label : undefined}
                title={item.label}
                className={[
                  'relative flex flex-col items-center gap-1 rounded-lg px-0.5 py-2.5 text-center text-[10.5px] font-medium leading-tight transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white',
                  atual ? 'bg-rail-active text-white' : 'hover:bg-rail-active/60 hover:text-white',
                ].join(' ')}
              >
                {atual && <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-white" aria-hidden="true" />}
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  {n > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-rail">
                      {n > 99 ? '99+' : n}
                      <span className="sr-only"> não lida(s)</span>
                    </span>
                  )}
                </span>
                <span className="w-full truncate">{item.short ?? item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="space-y-1 px-1.5 pb-3">
        {showSwitcher && (
          <nav aria-label="Trocar de módulo">
            <Link
              href="/dashboard"
              className="flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-[11px] font-medium leading-tight hover:bg-rail-active/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              <Building2 className="h-[22px] w-[22px]" aria-hidden="true" />
              Clínica
            </Link>
          </nav>
        )}
        <div className="flex justify-center pt-1" title={clinicName}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white">
            <span aria-hidden="true">{clinicName.slice(0, 2).toUpperCase()}</span>
            <span className="sr-only">Clínica: {clinicName}</span>
          </span>
        </div>
      </div>
    </nav>
  );
}
