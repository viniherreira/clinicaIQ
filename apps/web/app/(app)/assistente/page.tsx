import { assistantEnabled } from '@/lib/assistant';
import { AssistantChat } from './_components/assistant-chat';

export const metadata = { title: 'Assistente · ClinicaIQ' };

export default function AssistentePage() {
  return <AssistantChat enabled={assistantEnabled()} />;
}
