import { requireCrm } from '@/crm/guard';
import { getTenantModules } from '@/lib/access';
import { graphVersion, metaSignupConfigured } from '@/crm/cloud';
import { WhatsAppChannel } from './_components/whatsapp-channel';

export const metadata = { title: 'WhatsApp do CRM · DreamClin' };

/** O canal das conversas do CRM (API oficial da Meta) e os modelos aprovados. */
export default async function CrmWhatsAppPage() {
  const ctx = await requireCrm('crm_config');
  const [account, templates, modules] = await Promise.all([
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
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">WhatsApp do CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">Por onde as conversas do CRM entram e saem, e os modelos aprovados pela Meta.</p>
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
    </div>
  );
}
