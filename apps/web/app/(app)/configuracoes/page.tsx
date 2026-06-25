import { getClinic, listProfessionals, suggestColor } from './actions';
import { SettingsView } from './_components/settings-view';

export const metadata = { title: 'Configurações · ClinicaIQ' };

export default async function ConfiguracoesPage() {
  const [clinic, professionals, suggestedColor] = await Promise.all([
    getClinic(),
    listProfessionals(),
    suggestColor(),
  ]);

  if (!clinic) return null; // requireOwner() redirects when there is no tenant

  return (
    <SettingsView clinic={clinic} professionals={professionals} suggestedColor={suggestedColor} />
  );
}
