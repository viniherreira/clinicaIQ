import { requireCrm } from '@/crm/guard';
import { getTenantModules } from '@/lib/access';
import { activeCloudAccount } from '@/crm/cloud';
import { listTemplateRows } from '@/lib/whatsapp-templates';
import { WhatsAppTemplates } from '@/components/whatsapp-templates';
import { createTemplateAction, syncTemplatesAction } from '../../whatsapp/actions';

export const metadata = { title: 'Modelos · DreamClin' };

/**
 * Modelos de mensagem da API oficial. Fora das 24 horas depois da última
 * mensagem do contato, só modelo aprovado pela Meta pode ser enviado — é o que
 * as transmissões, as automações e os avisos da agenda usam. A mesma lista da
 * gestão (Configurações › Modelos do WhatsApp).
 */
export default async function ModelosPage() {
  const ctx = await requireCrm('crm_config');
  const [cloud, templates, modules] = await Promise.all([
    activeCloudAccount(ctx.tenantId),
    listTemplateRows(ctx.tenantId),
    getTenantModules(ctx.tenantId),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <WhatsAppTemplates
        templates={templates}
        connected={Boolean(cloud)}
        connectHref="/crm/whatsapp"
        agendaHref="/configuracoes#comunicacao"
        agenda={modules.clinic}
        onSync={syncTemplatesAction}
        onCreate={createTemplateAction}
      />
    </div>
  );
}
