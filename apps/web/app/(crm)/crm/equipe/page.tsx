import { redirect } from 'next/navigation';

/** A Equipe mudou para dentro das Configurações do CRM (como a Gestão de usuários do Kommo). */
export default function EquipePage() {
  redirect('/crm/configuracoes?aba=equipe');
}
