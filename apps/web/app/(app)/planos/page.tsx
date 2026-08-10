import type { Metadata } from 'next';
import { getBillingData } from './actions';
import { BillingView } from './_components/billing-view';

import { requireCapability } from '@/lib/guard';
export const metadata: Metadata = { title: 'Planos e cobrança' };

export default async function PlanosPage() {
  await requireCapability('planos');

  const data = await getBillingData();
  return <BillingView data={data} />;
}
