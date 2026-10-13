import { requireCrm } from '@/crm/guard';
import { activeCloudAccount } from '@/crm/cloud';
import { TemplatesManager } from './_components/templates-manager';

export const metadata = { title: 'Modelos · ClinicaIQ' };

/**
 * Modelos de mensagem da API oficial. Fora das 24 horas depois da última
 * mensagem do contato, só modelo aprovado pela Meta pode ser enviado — é o que
 * as transmissões, as automações e a confirmação de consulta usam.
 */
export default async function ModelosPage() {
  const ctx = await requireCrm('crm_config');
  const [cloud, templates] = await Promise.all([
    activeCloudAccount(ctx.tenantId),
    ctx.db.messageTemplate.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true, status: true, body: true, rejectedReason: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <p className="mb-5 text-sm text-muted-foreground">
        Escreva a mensagem, envie para a Meta aprovar e acompanhe aqui. Depois de aprovado, o modelo aparece nas transmissões e
        nas automações por etapa.
      </p>
      <TemplatesManager templates={templates} connected={Boolean(cloud)} />
    </div>
  );
}
