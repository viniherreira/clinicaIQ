import { getWhatsAppPanel } from './actions';
import { WhatsAppView } from './_components/whatsapp-view';

import { requireCapability } from '@/lib/guard';
export const metadata = { title: 'WhatsApp · DreamClin' };

export default async function WhatsAppPage() {
  await requireCapability('configuracoes');

  const data = await getWhatsAppPanel();
  return <WhatsAppView data={data} />;
}
