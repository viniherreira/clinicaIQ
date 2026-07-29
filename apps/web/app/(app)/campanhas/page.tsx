import { listCampaigns } from './actions';
import { CampaignsView } from './_components/campaigns-view';

export const metadata = { title: 'Campanhas · ClinicaIQ' };

export default async function CampanhasPage() {
  const data = await listCampaigns();
  return <CampaignsView data={data} />;
}
