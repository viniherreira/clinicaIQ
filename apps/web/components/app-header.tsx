'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { Menu, X } from 'lucide-react';
import { NAV } from './app-sidebar';
import { ThemeToggle } from './theme-toggle';

export function AppHeader({ clinicName }: { clinicName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface/80 px-4 backdrop-blur-md sm:px-6">
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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient text-[11px] font-bold text-white">CIQ</div>
        </div>

        <div className="flex-1" />

        <ThemeToggle />
        <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
        <UserButton
          appearance={{ elements: { avatarBox: 'h-8 w-8' } }}
          afterSignOutUrl="/sign-in"
        />
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
          <nav aria-label="Menu principal" className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-2xl animate-fade-in">
            <div className="flex h-16 items-center justify-between px-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-sm font-bold text-white">CIQ</div>
                <span className="text-[15px] font-semibold tracking-tight">ClinicaIQ</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <ul className="flex-1 space-y-1 overflow-y-auto p-3">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
