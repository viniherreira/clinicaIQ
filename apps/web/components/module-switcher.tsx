import Link from 'next/link';
import { Building2, KanbanSquare } from 'lucide-react';

export type Space = 'clinic' | 'crm';

/**
 * Na clínica só com o CRM, do lado da clínica só existem estas telas
 * (dados, equipe, plano). Fora de um arquivo de cliente de propósito: o layout
 * do servidor também lê.
 */
export const CRM_ONLY_CLINIC_PATHS = ['/configuracoes', '/planos', '/sem-acesso', '/crm-indisponivel'] as const;

/** Onde o lado "Clínica" abre. */
export const clinicHomeFor = (crmOnly: boolean) => (crmOnly ? '/configuracoes' : '/dashboard');

/**
 * A chave entre os dois espaços do sistema: a gestão da clínica e o CRM.
 *
 * São dois links, não botões de alternância: cada lado é um lugar com
 * endereço próprio, e "voltar" do navegador tem que funcionar como a pessoa
 * espera. `aria-current` diz ao leitor de tela em qual dos dois ela está.
 *
 * Só aparece quando a clínica tem os dois módulos e a pessoa alcança o CRM —
 * quem decide isso é o `AppShell`, no servidor.
 */
export function ModuleSwitcher({
  space,
  onNavigate,
  clinicHome = '/dashboard',
}: {
  space: Space;
  onNavigate?: () => void;
  /** Onde o lado "Clínica" abre. Na clínica só com o CRM, nas Configurações. */
  clinicHome?: string;
}) {
  const opcoes = [
    { space: 'clinic' as const, href: clinicHome, label: 'Clínica', icon: Building2 },
    { space: 'crm' as const, href: '/crm', label: 'CRM', icon: KanbanSquare },
  ];

  return (
    <nav aria-label="Trocar de módulo" className="segmented w-full">
      {opcoes.map((o) => {
        const atual = o.space === space;
        const Icon = o.icon;
        return (
          <Link
            key={o.space}
            href={o.href}
            onClick={onNavigate}
            aria-current={atual ? 'page' : undefined}
            className="segmented-item inline-flex flex-1 items-center justify-center gap-1.5"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
