'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CalendarDays, Users, Stethoscope, FileText, Settings,
} from 'lucide-react';

export const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays },
  { href: '/pacientes', label: 'Pacientes', icon: Users },
  { href: '/procedimentos', label: 'Procedimentos', icon: Stethoscope },
  { href: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AppSidebar({ clinicName }: { clinicName: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu principal" className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-sm">
          <span className="text-sm font-bold text-white">CIQ</span>
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">ClinicaIQ</span>
          <span className="mt-1 text-[11px] text-muted-foreground">Gestão clínica</span>
        </div>
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto px-3 pb-3 pt-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-surface-alt hover:text-foreground',
                ].join(' ')}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden="true" />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Clinic */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-surface-alt px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-xs font-semibold text-white">
            {clinicName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{clinicName}</p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              Ativo
            </p>
          </div>
        </div>
      </div>
    </nav>
  );
}
