'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, FileCheck2, Megaphone, Workflow } from 'lucide-react';

const ITENS = [
  { href: '/crm/automacoes/bots', label: 'Bots', icon: Bot, config: true },
  { href: '/crm/automacoes/modelos', label: 'Modelos', icon: FileCheck2, config: true },
  { href: '/crm/automacoes/transmissoes', label: 'Transmissões', icon: Megaphone, config: false },
  { href: '/crm/automacoes/etapas', label: 'Por etapa do funil', icon: Workflow, config: true },
];

export function AutomacoesNav({ config }: { config: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Automações" className="mt-2 flex gap-1 overflow-x-auto">
      {ITENS.filter((i) => config || !i.config).map((i) => {
        const atual = pathname === i.href || pathname.startsWith(`${i.href}/`);
        const Icon = i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={atual ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring ${
              atual ? 'border-link font-medium text-link' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
