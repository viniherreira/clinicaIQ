import { requireCrm } from '@/crm/guard';
import { can } from '@/lib/permissions';
import { AutomacoesNav } from './_components/automacoes-nav';

/**
 * Automações, como no Kommo: Bots, Modelos (aprovados pela Meta),
 * Transmissões e o que cada etapa do funil faz sozinha. Quem não configura o
 * CRM só vê as Transmissões.
 */
export default async function AutomacoesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCrm('crm');
  const config = can(ctx.role, 'crm_config');
  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border bg-surface px-4 pt-3 sm:px-6">
        <h1 className="text-sm font-bold uppercase tracking-wide">Automações</h1>
        <AutomacoesNav config={config} />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
