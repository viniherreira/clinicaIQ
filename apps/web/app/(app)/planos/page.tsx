import type { Metadata } from 'next';
import { getBillingData } from './actions';
import { BillingView } from './_components/billing-view';

export const metadata: Metadata = { title: 'Planos e cobrança' };

export default async function PlanosPage() {
  const data = await getBillingData();
  return <BillingView data={data} />;
}
