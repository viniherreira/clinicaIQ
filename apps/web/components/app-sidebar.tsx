'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLiveUnread } from './crm-chat/unread';
import {
  LayoutDashboard, CalendarDays, Users, Stethoscope, FileText, Wallet,
  MessageCircle, Megaphone, Settings, PhoneCall, KanbanSquare, List, ListChecks, Smartphone,
} from 'lucide-react';
import { LogoMark, LogoWordmark } from './logo';
import { ModuleSwitcher, type Space } from './module-switcher';
import { can, type Capability } from '@/lib/permissions';

/**
 * O menu, com a permissão que cada módulo exige.
 *
 * Quase tudo é do dia a dia da clínica e aparece para quem tem login. Some só
 * o que é de administração — hoje, Plano e cobrança.
 *
 * Isto é arrumação, não segurança. Quem digitar o endereço direto continua
 * sendo barrado no servidor, por `requireCapability`.
 */
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  capability?: Capability;
};

export const CLINIC_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, capability: 'agenda' },
  { href: '/pacientes', label: 'Pacientes', icon: Users, capability: 'pacientes' },
  { href: '/retorno', label: 'Retorno', icon: PhoneCall, capability: 'pacientes' },
  { href: '/procedimentos', label: 'Procedimentos', icon: Stethoscope, capability: 'configuracoes' },
  { href: '/orcamentos', label: 'Orçamentos', icon: FileText, capability: 'financeiro' },
  // Financeiro e relatórios são uma tela só: resumo em cima, detalhamento embaixo.
  { href: '/financeiro', label: 'Financeiro', icon: Wallet, capability: 'financeiro' },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, capability: 'configuracoes' },
  { href: '/campanhas', label: 'Campanhas', icon: Megaphone, capability: 'campanhas' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings, capability: 'configuracoes' },
];

/**
 * O menu do espaço CRM. Transmissões e Chatbot entram nas próximas etapas. O
 * próprio espaço só abre para quem tem `crm` (ver `crm/guard.ts`).
 */
export const CRM_NAV: NavItem[] = [
  { href: '/crm', label: 'Funil', icon: KanbanSquare, capability: 'crm' },
  { href: '/crm/conversas', label: 'Conversas', icon: MessageCircle, capability: 'crm' },
  { href: '/crm/leads', label: 'Leads', icon: List, capability: 'crm' },
  { href: '/crm/tarefas', label: 'Tarefas', icon: ListChecks, capability: 'crm' },
  { href: '/crm/transmissoes', label: 'Transmissões', icon: Megaphone, capability: 'crm' },
  { href: '/crm/whatsapp', label: 'WhatsApp', icon: Smartphone, capability: 'crm_config' },
  { href: '/crm/configuracoes', label: 'Configurações do CRM', icon: Settings, capability: 'crm_config' },
];

export function navFor(role: string | null | undefined, space: Space = 'clinic') {
  const nav = space === 'crm' ? CRM_NAV : CLINIC_NAV;
  return nav.filter((item) => !item.capability || can(role, item.capability));
}

/**
 * Item ativo: o de endereço mais longo que casa com a página. Sem isso, em
 * /crm/leads o "Funil" (/crm) também acenderia, porque /crm/leads começa com /crm.
 */
export function activeHref(items: NavItem[], pathname: string): string | undefined {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function AppSidebar({
  clinicName,
  role,
  space = 'clinic',
  showSwitcher = false,
  counts = {},
}: {
  clinicName: string;
  role: string;
  space?: Space;
  /** A clínica tem os dois módulos e a pessoa alcança o CRM. */
  showSwitcher?: boolean;
  /** Números ao lado de um item (conversas não lidas), por endereço. */
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const itens = navFor(role, space);
  const unread = useLiveUnread(counts['/crm/conversas'] ?? 0);
  const contagem: Record<string, number> = { ...counts, '/crm/conversas': unread };
  const ativo = activeHref(itens, pathname);

  return (
    <nav aria-label="Menu principal" className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex print:!hidden">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <LogoMark size="md" />
        <div className="flex flex-col leading-none">
          <LogoWordmark className="text-[15px] font-semibold tracking-tight" />
          {!showSwitcher && (
            <span className="mt-1 text-[11px] text-muted-foreground">
              {space === 'crm' ? 'CRM' : 'Gestão clínica'}
            </span>
          )}
        </div>
      </div>

      {showSwitcher && (
        <div className="px-3 pb-2">
          <ModuleSwitcher space={space} />
        </div>
      )}

      <ul className="flex-1 space-y-1 overflow-y-auto px-3 pb-3 pt-1">
        {itens.map((item) => {
          const active = item.href === ativo;
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
                {(contagem[item.href] ?? 0) > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {contagem[item.href]}
                    <span className="sr-only"> não lida(s)</span>
                  </span>
                )}
                {item.badge && (
                  <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    {item.badge}
                  </span>
                )}
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
