import { listCampaigns } from './actions';
import { CampaignsView } from './_components/campaigns-view';

import { requireCapability } from '@/lib/guard';
export const metadata = { title: 'Campanhas · ClinicaIQ' };

export default async function CampanhasPage() {
  await requireCapability('campanhas');

  const data = await listCampaigns();
  return <CampaignsView data={data} />;
}
