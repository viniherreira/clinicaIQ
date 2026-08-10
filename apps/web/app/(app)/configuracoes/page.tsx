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

import { requireCapability } from '@/lib/guard';
import { can } from '@/lib/permissions';
export const metadata = { title: 'Configurações · ClinicaIQ' };

export default async function ConfiguracoesPage() {
  const { role } = await requireCapability('configuracoes');

  const clinic = await getClinic();
  if (!clinic) return null; // requireOwner() redirects when there is no tenant

  const podeEquipe = can(role, 'equipe');
  const podePlano = can(role, 'planos');
  const podePrivacidade = can(role, 'privacidade');

  // As abas de administração nem são buscadas para quem não vai vê-las. Esconder
  // a aba mas mandar a lista da equipe junto no HTML seria esconder com a mão.
  const [professionals, suggestedColor, businessHours, team, privacy, audit, invites, messages, session] =
    await Promise.all([
      listProfessionals(),
      suggestColor(),
      getBusinessHours(),
      podeEquipe ? listTeam() : [],
      podePrivacidade ? getPrivacySummary() : null,
      podePrivacidade ? listAudit(50) : [],
      podeEquipe ? listInvites() : [],
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
      podeEquipe={podeEquipe}
      podePlano={podePlano}
      podePrivacidade={podePrivacidade}
      // Renderizado aqui, no servidor, e entregue pronto para a aba: o cartão
      // busca dados do Asaas e não pode virar componente de cliente.
      billing={podePlano ? <BillingCard tenantId={clinic.id} /> : null}
      whatsapp={{
        status: session?.status ?? 'DISCONNECTED',
        phoneNumber: session?.phoneNumber ?? null,
      }}
    />
  );
}
