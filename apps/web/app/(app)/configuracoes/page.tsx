import { prisma } from '@clinicaiq/db';
import {
  getClinic,
  listProfessionals,
  suggestColor,
  getBusinessHours,
  listTeam,
  getPrivacySummary,
  listAudit,
  listInvites,
  getMessageSettings,
} from './actions';
import { SettingsView } from './_components/settings-view';
import { BillingCard } from './_components/billing-card';

export const metadata = { title: 'Configurações · ClinicaIQ' };

export default async function ConfiguracoesPage() {
  const clinic = await getClinic();
  if (!clinic) return null; // requireOwner() redirects when there is no tenant

  const [professionals, suggestedColor, businessHours, team, privacy, audit, invites, messages, session] =
    await Promise.all([
      listProfessionals(),
      suggestColor(),
      getBusinessHours(),
      listTeam(),
      getPrivacySummary(),
      listAudit(50),
      listInvites(),
      getMessageSettings(),
      prisma.whatsAppSession.findUnique({
        where: { tenantId: clinic.id },
        select: { status: true, phoneNumber: true },
      }),
    ]);

  return (
    <SettingsView
      clinic={clinic}
      professionals={professionals}
      suggestedColor={suggestedColor}
      businessHours={businessHours}
      team={team}
      privacy={privacy}
      audit={audit}
      invites={invites}
      messages={messages}
      // Renderizado aqui, no servidor, e entregue pronto para a aba: o cartão
      // busca dados do Asaas e não pode virar componente de cliente.
      billing={<BillingCard tenantId={clinic.id} />}
      whatsapp={{
        status: session?.status ?? 'DISCONNECTED',
        phoneNumber: session?.phoneNumber ?? null,
      }}
    />
  );
}
