import { getWhatsAppPanel } from './actions';
import { WhatsAppView } from './_components/whatsapp-view';

export const metadata = { title: 'WhatsApp · ClinicaIQ' };

export default async function WhatsAppPage() {
  const data = await getWhatsAppPanel();
  return <WhatsAppView data={data} />;
}
