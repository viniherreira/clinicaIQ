'use client';

import { usePathname } from 'next/navigation';
import { useLiveUnread } from './crm-chat/unread';
import {
  LayoutDashboard, CalendarDays, Users, Stethoscope, FileText, Wallet,
  MessageCircle, Megaphone, Settings, PhoneCall, KanbanSquare, List, ListChecks, Smartphone, BarChart3, Zap,
} from 'lucide-react';
import { CrmRail } from './crm-rail';
import { ClinicSidebar } from './clinic-sidebar';
import { clinicHomeFor, type Space } from './module-switcher';
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
  /** O nome que cabe no menu estreito do CRM. */
  short?: string;
  /** Grupo no menu da clínica (`CLINIC_GROUPS`); sem grupo, fica solto no topo. */
  group?: string;
};

export const CLINIC_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, capability: 'agenda', group: 'Atendimento' },
  { href: '/pacientes', label: 'Pacientes', icon: Users, capability: 'pacientes', group: 'Atendimento' },
  { href: '/retorno', label: 'Retorno', icon: PhoneCall, capability: 'pacientes', group: 'Atendimento' },
  { href: '/orcamentos', label: 'Orçamentos', icon: FileText, capability: 'financeiro', group: 'Financeiro' },
  // Financeiro e relatórios são uma tela só: resumo em cima, detalhamento embaixo.
  { href: '/financeiro', label: 'Financeiro', icon: Wallet, capability: 'financeiro', group: 'Financeiro' },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, capability: 'configuracoes', group: 'Relacionamento' },
  { href: '/campanhas', label: 'Campanhas', icon: Megaphone, capability: 'campanhas', group: 'Relacionamento' },
  { href: '/procedimentos', label: 'Procedimentos', icon: Stethoscope, capability: 'configuracoes', group: 'Configurações' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings, capability: 'configuracoes', group: 'Configurações' },
];

/**
 * O menu do espaço CRM. Transmissões e Chatbot entram nas próximas etapas. O
 * próprio espaço só abre para quem tem `crm` (ver `crm/guard.ts`).
 */
export const CRM_NAV: NavItem[] = [
  { href: '/crm/painel', label: 'Painel', icon: BarChart3, capability: 'crm' },
  { href: '/crm', label: 'Funil', icon: KanbanSquare, capability: 'crm' },
  { href: '/crm/conversas', label: 'Conversas', icon: MessageCircle, capability: 'crm' },
  { href: '/crm/leads', label: 'Leads', icon: List, capability: 'crm' },
  { href: '/crm/tarefas', label: 'Tarefas', icon: ListChecks, capability: 'crm' },
  { href: '/crm/automacoes', label: 'Automações', icon: Zap, capability: 'crm' },
  { href: '/crm/whatsapp', label: 'WhatsApp', icon: Smartphone, capability: 'crm_config' },
  // Todo mundo entra (o próprio perfil); a equipe, os funis e o resto são do gestor.
  { href: '/crm/configuracoes', label: 'Configurações do CRM', short: 'Configurações', icon: Settings, capability: 'crm' },
];

/**
 * O menu de quem está logado. No CRM, o que é de configurar (`crm_config`) sai
 * do cargo no CRM (`crmManager`), não do perfil da clínica; sem ele informado,
 * vale o padrão do perfil.
 */
export function navFor(role: string | null | undefined, space: Space = 'clinic', crmOnly = false, crmManager?: boolean) {
  const nav = space === 'crm' ? CRM_NAV : CLINIC_NAV.filter((item) => !crmOnly || item.href === '/configuracoes');
  return nav.filter((item) => {
    if (!item.capability) return true;
    if (item.capability === 'crm_config' && crmManager !== undefined) return can(role, 'crm') && crmManager;
    return can(role, item.capability);
  });
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
  crmOnly = false,
  crmManager,
}: {
  clinicName: string;
  /** É Gestor no CRM (mostra Equipe, WhatsApp e Configurações do CRM). */
  crmManager?: boolean;
  role: string;
  space?: Space;
  /** A clínica tem os dois módulos e a pessoa alcança o CRM. */
  showSwitcher?: boolean;
  /** A clínica contratou só o CRM: do lado da clínica, só Configurações. */
  crmOnly?: boolean;
  /** Números ao lado de um item (conversas não lidas), por endereço. */
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const itens = navFor(role, space, crmOnly, crmManager);
  const unread = useLiveUnread(counts['/crm/conversas'] ?? 0);
  const contagem: Record<string, number> = { ...counts, '/crm/conversas': unread };
  const ativo = activeHref(itens, pathname);

  if (space === 'crm') {
    return (
      <CrmRail items={itens} active={ativo} counts={contagem} clinicName={clinicName} showSwitcher={showSwitcher} clinicHome={clinicHomeFor(crmOnly)} />
    );
  }
  return <ClinicSidebar items={itens} active={ativo} clinicName={clinicName} showSwitcher={showSwitcher} clinicHome={clinicHomeFor(crmOnly)} />;
}
