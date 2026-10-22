/**
 * The sellable plans: Essencial R$ 139, Profissional R$ 239, Clínica R$ 339, e
 * cada um com CRM por R$ 199, R$ 359 e R$ 519 (1, 3 e 5 usuários no CRM).
 * Idempotent — safe to run on every deploy.
 *
 *   pnpm --filter @clinicaiq/db exec tsx prisma/seed-plans.ts
 *
 * Prices live in the database rather than in code so raising one, or opening a
 * feature to a lower tier, is a row update instead of a release.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLANS = [
  {
    tier: 'ESSENCIAL' as const,
    name: 'Essencial',
    description: 'Para o consultório de um profissional. Agenda, prontuário, orçamentos e WhatsApp oficial.',
    monthlyPriceCents: 13_900,
    maxProfessionals: 1,
    whatsappEnabled: true,
    campaignsEnabled: false,
    assistantEnabled: false,
    advancedReports: false,
    crmSeatPriceCents: 3_900,
    // O plano com CRM: soma este valor, já com 1 usuário no CRM.
    crmPackagePriceCents: 6_000,
    crmIncludedSeats: 1,
    sortOrder: 1,
  },
  {
    tier: 'PROFISSIONAL' as const,
    name: 'Profissional',
    description: 'Para clínicas em crescimento. Até 3 profissionais e campanhas em massa.',
    monthlyPriceCents: 23_900,
    maxProfessionals: 3,
    whatsappEnabled: true,
    campaignsEnabled: true,
    assistantEnabled: false,
    advancedReports: false,
    crmSeatPriceCents: 3_900,
    // O plano com CRM: soma este valor, já com 3 usuários no CRM.
    crmPackagePriceCents: 12_000,
    crmIncludedSeats: 3,
    sortOrder: 2,
  },
  {
    tier: 'CLINICA' as const,
    name: 'Clínica',
    description: 'Para clínicas com muitos profissionais. Equipe ilimitada e relatórios completos.',
    monthlyPriceCents: 33_900,
    maxProfessionals: null,
    whatsappEnabled: true,
    campaignsEnabled: true,
    assistantEnabled: false,
    advancedReports: true,
    crmSeatPriceCents: 3_900,
    // O plano com CRM: soma este valor, já com 5 usuários no CRM.
    crmPackagePriceCents: 18_000,
    crmIncludedSeats: 5,
    sortOrder: 3,
  },
];

/** Trial given to clinics that were already using the system when billing shipped. */
const BACKFILL_TRIAL_DAYS = 30;

async function main() {
  for (const plan of PLANS) {
    const { tier, ...rest } = plan;
    await prisma.plan.upsert({ where: { tier }, create: plan, update: rest });
    console.log(`  ${plan.name.padEnd(14)} R$ ${(plan.monthlyPriceCents / 100).toFixed(2)}`);
  }
  console.log(`${PLANS.length} plano(s) sincronizado(s).`);

  // Access is denied when there is no subscription row, so shipping billing
  // without this would lock every existing clinic out of its own agenda the
  // moment the code deploys. They get a trial instead, with room to choose.
  const orphans = await prisma.tenant.findMany({
    where: { subscription: { is: null } },
    select: { id: true, name: true },
  });

  const trialEndsAt = new Date(Date.now() + BACKFILL_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  for (const tenant of orphans) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        tier: 'PROFISSIONAL',
        status: 'TRIALING',
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
      },
    });
    console.log(`  teste de ${BACKFILL_TRIAL_DAYS} dias → ${tenant.name}`);
  }
  console.log(
    orphans.length > 0
      ? `${orphans.length} clínica(s) sem plano receberam teste.`
      : 'Todas as clínicas já têm assinatura.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
