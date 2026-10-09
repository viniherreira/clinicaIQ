/**
 * Liga (ou desliga) o módulo CRM de uma clínica, até a cobrança do CRM
 * existir (etapa 5). Mesmo espírito da cortesia: uma decisão nossa, por
 * clínica, registrada no histórico de auditoria.
 *
 *   pnpm --filter @clinicaiq/db exec tsx prisma/crm-enable.ts <slug-ou-id-da-clinica>
 *   pnpm --filter @clinicaiq/db exec tsx prisma/crm-enable.ts <slug-ou-id-da-clinica> --off
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [alvo, flag] = process.argv.slice(2);
  if (!alvo) {
    console.error('Uso: tsx prisma/crm-enable.ts <slug-ou-id-da-clinica> [--off]');
    process.exit(1);
  }
  const ligar = flag !== '--off';

  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ id: alvo }, { slug: alvo }] },
    select: { id: true, name: true, subscription: { select: { id: true } } },
  });
  if (!tenant) throw new Error(`Clínica não encontrada: ${alvo}`);
  if (!tenant.subscription) throw new Error(`A clínica ${tenant.name} não tem assinatura.`);

  await prisma.$transaction([
    prisma.subscription.update({ where: { tenantId: tenant.id }, data: { crmEnabled: ligar } }),
    prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: ligar ? 'CRM_ENABLED' : 'CRM_DISABLED',
        entity: 'Subscription',
        entityId: tenant.subscription.id,
      },
    }),
  ]);
  console.log(`CRM ${ligar ? 'ligado' : 'desligado'} para ${tenant.name}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
