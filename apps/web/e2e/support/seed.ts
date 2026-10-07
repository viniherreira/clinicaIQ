import { prisma, encrypt } from '@clinicaiq/db';
import { required } from './env';

/**
 * A clínica onde os testes rodam. Idempotente: cada execução reaproveita a
 * mesma clínica e só cria o que falta, então dá para rodar a suíte de novo sem
 * limpar o banco.
 *
 * Os testes criam os próprios pacientes e agendamentos com nome único, então o
 * que sobra de uma execução não atrapalha a próxima.
 */

export const E2E_TENANT_SLUG = 'e2e-clinica-de-teste';
export const E2E_PROFESSIONAL = 'Dra. Teste E2E';
export const E2E_PROCEDURE = 'Avaliação E2E';
/** Orçamento "enviado" para testar a página pública: a tela da clínica não
 *  tem mais o "copiar link" (commit 4d2e66d), então ele nasce direto no banco. */
export const E2E_PUBLIC_QUOTE_TOKEN = 'e2e-orcamento-publico';

/**
 * Trava contra rodar a semeadura no lugar errado. Ela grava no banco apontado
 * por DATABASE_URL e liga uma conta do Clerk a uma clínica — em produção isso
 * seria um estrago.
 */
function assertTestEnvironment(email: string) {
  if (process.env.CLERK_SECRET_KEY?.startsWith('sk_live_')) {
    throw new Error('CLERK_SECRET_KEY é de produção (sk_live_). Os testes só rodam no Clerk de desenvolvimento.');
  }
  if (!email.includes('+clerk_test')) {
    throw new Error(
      `E2E_CLERK_USER_EMAIL precisa conter "+clerk_test" (ex.: voce+clerk_test@exemplo.com). ` +
        'É o marcador de conta de teste do Clerk, e garante que nenhuma conta de verdade seja usada.',
    );
  }
}

/** Busca no Clerk o id da conta de teste. Só leitura: a conta é criada à mão. */
async function findClerkUserId(email: string): Promise<string> {
  const url = new URL('https://api.clerk.com/v1/users');
  url.searchParams.append('email_address', email);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${required('CLERK_SECRET_KEY')}` } });
  if (!res.ok) throw new Error(`Clerk respondeu ${res.status} ao procurar a conta de teste.`);
  const users = (await res.json()) as { id: string }[];
  if (!users[0]) {
    throw new Error(
      'A conta de teste não existe no Clerk de desenvolvimento. Crie-a no painel do Clerk (passo a passo em e2e/README.md).',
    );
  }
  return users[0].id;
}

export async function seedE2EClinic() {
  const email = required('E2E_CLERK_USER_EMAIL');
  assertTestEnvironment(email);
  const masterKey = required('ENCRYPTION_MASTER_KEY');

  const plan = await prisma.plan.findUnique({ where: { tier: 'CLINICA' } });
  if (!plan) {
    throw new Error('Os planos não estão no banco. Rode: pnpm --filter @clinicaiq/db exec tsx prisma/seed-plans.ts');
  }

  const clerkUserId = await findClerkUserId(email);

  const tenant = await prisma.tenant.upsert({
    where: { slug: E2E_TENANT_SLUG },
    update: {},
    create: { clerkOrgId: `user_${clerkUserId}`, name: 'Clínica de Teste E2E', slug: E2E_TENANT_SLUG },
  });

  // `clerkUserId` é único no banco inteiro. Se a conta de teste já estiver em
  // outra clínica, é melhor parar do que mover alguém de lugar.
  const existing = await prisma.user.findUnique({ where: { clerkUserId } });
  if (existing && existing.tenantId !== tenant.id) {
    throw new Error('A conta de teste já pertence a outra clínica neste banco. Use outra conta de teste.');
  }
  if (!existing) {
    await prisma.user.create({
      data: { tenantId: tenant.id, clerkUserId, name: 'Dono E2E', email, role: 'OWNER' },
    });
  }

  // Cortesia: acesso completo sem depender de datas nem do Asaas.
  const farFuture = new Date('2099-12-31T00:00:00Z');
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: { complimentary: true, status: 'ACTIVE', currentPeriodEnd: farFuture },
    create: {
      tenantId: tenant.id,
      tier: 'CLINICA',
      status: 'ACTIVE',
      currentPeriodEnd: farFuture,
      complimentary: true,
      complimentaryNote: 'Clínica dos testes E2E',
    },
  });

  let professional = await prisma.professional.findFirst({
    where: { tenantId: tenant.id, name: E2E_PROFESSIONAL },
  });
  if (!professional) {
    professional = await prisma.professional.create({
      data: { tenantId: tenant.id, name: E2E_PROFESSIONAL, color: '#3B82F6', active: true },
    });
  }
  // Agendamentos de execuções anteriores saem: um teste que parou no meio
  // deixaria o horário ocupado e o próximo bateria em "Conflito". É tudo dado
  // da profissional de teste, nesta clínica de teste.
  await prisma.whatsAppMessage.deleteMany({
    where: { tenantId: tenant.id, appointment: { professionalId: professional.id } },
  });
  await prisma.appointment.deleteMany({ where: { tenantId: tenant.id, professionalId: professional.id } });

  // Atende todos os dias, o dia inteiro: o teste agenda "amanhã" sem se
  // preocupar com fim de semana nem horário de almoço.
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    await prisma.professionalSchedule.upsert({
      where: { professionalId_dayOfWeek: { professionalId: professional.id, dayOfWeek } },
      update: {},
      create: { professionalId: professional.id, dayOfWeek, startTime: '07:00', endTime: '21:00' },
    });
  }

  const procedure = await prisma.procedure.findFirst({ where: { tenantId: tenant.id, name: E2E_PROCEDURE } });
  if (!procedure) {
    await prisma.procedure.create({
      data: { tenantId: tenant.id, name: E2E_PROCEDURE, basePrice: 150, durationMinutes: 30, active: true },
    });
  }

  await seedPublicQuote(tenant.id, masterKey);
}

async function seedPublicQuote(tenantId: string, masterKey: string) {
  // Volta para "enviado" a cada execução: o teste aceita, e da próxima vez
  // precisa encontrar o orçamento esperando resposta de novo.
  const existing = await prisma.quote.findUnique({ where: { publicToken: E2E_PUBLIC_QUOTE_TOKEN } });
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (existing) {
    await prisma.quote.update({
      where: { id: existing.id },
      data: { status: 'SENT', acceptedAt: null, rejectedAt: null, viewedAt: null, validUntil },
    });
    return;
  }

  const patient = await prisma.patient.upsert({
    where: { tenantId_controlNumber: { tenantId, controlNumber: 9001 } },
    update: {},
    create: {
      tenantId,
      controlNumber: 9001,
      name: 'Paciente Link Público E2E',
      phoneEncrypted: encrypt('11999990001', masterKey, tenantId),
      lgpdConsentAt: new Date(),
    },
  });

  await prisma.quote.create({
    data: {
      tenantId,
      patientId: patient.id,
      number: 9001,
      publicToken: E2E_PUBLIC_QUOTE_TOKEN,
      status: 'SENT',
      sentAt: new Date(),
      subtotal: 150,
      total: 150,
      validUntil,
      items: { create: [{ name: E2E_PROCEDURE, unitPrice: 150, quantity: 1, total: 150 }] },
    },
  });
}
