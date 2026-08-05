/**
 * Exercises the whole Asaas path against the sandbox: customer, subscription,
 * charge, PIX code — then cleans up after itself.
 *
 *   pnpm --filter @clinicaiq/web exec tsx --env-file=.env.local scripts/asaas-smoke.ts
 *
 * Refuses to run outside the sandbox: this creates and cancels real
 * subscriptions, which is not something to discover in production.
 */
import {
  cancelSubscription,
  createSubscription,
  ensureCustomer,
  getPixCode,
  isSandbox,
  listPayments,
  toChargeStatus,
} from '../lib/asaas';

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

async function main() {
  if (!isSandbox()) {
    throw new Error('ASAAS_ENV=production — este teste cria cobranças. Abortado.');
  }
  console.log('ambiente: SANDBOX\n');

  const tenantId = `smoke-${Date.now()}`;

  console.log('1. criando cliente…');
  const customerId = await ensureCustomer({
    tenantId,
    name: 'Clínica Teste ClinicaIQ',
    cpfCnpj: '24971563792', // CPF válido de teste, aceito pelo sandbox
    email: 'teste@clinicaiq.com.br',
  });
  console.log(`   customer: ${customerId}`);

  console.log('2. confirmando que não duplica…');
  const again = await ensureCustomer({ tenantId, name: 'Clínica Teste ClinicaIQ' });
  console.log(`   ${again === customerId ? 'OK — reaproveitou o mesmo cliente' : `FALHOU — criou ${again}`}`);

  console.log('3. criando assinatura mensal…');
  const sub = await createSubscription({
    customerId,
    tenantId,
    priceCents: 19_700,
    planName: 'Profissional',
  });
  console.log(`   subscription: ${sub.id} · ${brl(sub.value * 100)} · vence ${sub.nextDueDate}`);

  console.log('4. buscando a cobrança gerada…');
  const payments = await listPayments(sub.id);
  console.log(`   ${payments.length} cobrança(s)`);
  for (const p of payments) {
    console.log(`   ${p.id} · ${brl(p.value * 100)} · ${p.status} → ${toChargeStatus(p.status)}`);
    console.log(`   fatura: ${p.invoiceUrl ?? '(sem link)'}`);
  }

  if (payments[0]) {
    console.log('5. buscando o código PIX…');
    const pix = await getPixCode(payments[0].id);
    console.log(`   ${pix ? `${pix.slice(0, 40)}… (${pix.length} chars)` : '(sem PIX ainda)'}`);
  }

  console.log('6. cancelando a assinatura de teste…');
  await cancelSubscription(sub.id);
  console.log('   cancelada.\n');
  console.log('TUDO OK — o caminho de cobrança funciona.');
}

main().catch((e) => {
  console.error(`\nFALHOU: ${e?.message ?? e}`);
  process.exitCode = 1;
});
