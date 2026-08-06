import { getClinic, listProfessionals, suggestColor, getBusinessHours } from './actions';
import { SettingsView } from './_components/settings-view';
import { BillingCard } from './_components/billing-card';

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
    <div>
      {/* Billing sits above the clinic's own settings: it is the first thing an
          owner comes here to check, and the only one with a deadline. */}
      <div className="mx-auto max-w-5xl px-6 pt-6 lg:px-8">
        <BillingCard tenantId={clinic.id} />
      </div>

      <SettingsView
        clinic={clinic}
        professionals={professionals}
        suggestedColor={suggestedColor}
        businessHours={businessHours}
      />
    </div>
  );
}
