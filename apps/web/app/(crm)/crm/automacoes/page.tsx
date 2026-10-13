import { redirect } from 'next/navigation';
import { requireCrm } from '@/crm/guard';
import { can } from '@/lib/permissions';

export default async function AutomacoesPage() {
  const ctx = await requireCrm('crm');
  redirect(can(ctx.role, 'crm_config') ? '/crm/automacoes/bots' : '/crm/automacoes/transmissoes');
}
