import { redirect } from 'next/navigation';
import { requireCrm } from '@/crm/guard';

export default async function AutomacoesPage() {
  const ctx = await requireCrm('crm');
  redirect(ctx.manager ? '/crm/automacoes/bots' : '/crm/automacoes/transmissoes');
}
