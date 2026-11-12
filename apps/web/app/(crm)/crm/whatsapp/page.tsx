import { requireCrm } from '@/crm/guard';
import { getTenantModules } from '@/lib/access';
import { graphVersion, metaSignupConfigured } from '@/crm/cloud';
import { WhatsAppChannel } from './_components/whatsapp-channel';
import { AdsConnect } from '@/components/ads-connect';
import { adsConnection, adsLoginConfig } from '@/crm/ads-account';
import { readCrmPrefs } from '@/crm/crm-prefs';
import { prisma } from '@clinicaiq/db';

export const metadata = { title: 'Canais do CRM' };

/** O canal das conversas do CRM (API oficial da Meta) e os modelos aprovados. */
export default async function CrmWhatsAppPage() {
  const ctx = await requireCrm('crm_config');
  const [account, templates, modules, anuncios, tenant] = await Promise.all([
    ctx.db.whatsAppCloudAccount.findFirst({
      select: {
        displayPhone: true,
        verifiedName: true,
        coexistence: true,
        manual: true,
        active: true,
        status: true,
        lastError: true,
        connectedAt: true,
      },
    }),
    ctx.db.messageTemplate.findMany({
      // Os avisos da agenda (purpose) são cuidados no painel de mensagens da gestão.
      where: { purpose: null },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true, status: true, body: true, rejectedReason: true },
    }),
    getTenantModules(ctx.tenantId),
    adsConnection(ctx.tenantId),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { settings: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Canais do CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        O WhatsApp por onde as conversas entram e saem, os modelos aprovados pela Meta e o Gerenciador de Anúncios.
      </p>
      <WhatsAppChannel
        account={account ? { ...account, connectedAt: account.connectedAt.toISOString() } : null}
        templates={templates}
        agenda={modules.clinic}
        signup={
          metaSignupConfigured()
            ? { appId: process.env.META_APP_ID!, configId: process.env.META_ES_CONFIG_ID!, version: graphVersion() }
            : null
        }
      />
      <div className="mt-6">
        <AdsConnect
          connection={{ state: anuncios.state, accountId: anuncios.accountId, accountName: anuncios.accountName, connectedAt: anuncios.connectedAt }}
          login={adsLoginConfig()}
          metaEvents={readCrmPrefs(tenant?.settings).metaEvents}
        />
      </div>
    </div>
  );
}
