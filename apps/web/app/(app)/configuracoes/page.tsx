import { getClinic, listProfessionals, suggestColor, getBusinessHours } from './actions';
import { SettingsView } from './_components/settings-view';

export const metadata = { title: 'Configurações · ClinicaIQ' };

export default async function ConfiguracoesPage() {
  const [clinic, professionals, suggestedColor, businessHours] = await Promise.all([
    getClinic(),
    listProfessionals(),
    suggestColor(),
    getBusinessHours(),
  ]);

  if (!clinic) return null; // requireOwner() redirects when there is no tenant

  return (
    <SettingsView
      clinic={clinic}
      professionals={professionals}
      suggestedColor={suggestedColor}
      businessHours={businessHours}
    />
  );
}
