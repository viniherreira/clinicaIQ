/**
 * Lines up outbound sends against Signal-session creation, per recipient.
 *
 * The question this answers: when the gateway sends to someone it has never
 * messaged, does a `session::` row appear? If sends keep happening and no new
 * session rows follow, the keys store is at fault. If a session row exists for
 * a recipient whose message still never arrived, the store is fine and the
 * failure is downstream. Read-only.
 */
import { prisma } from './db.js';

const mask = (d: string) => (d.length <= 6 ? d : `${d.slice(0, 4)}…${d.slice(-4)}`);
const hm = (d: Date) => d.toISOString().slice(5, 16).replace('T', ' ');

async function main() {
  const tenants = await prisma.whatsAppSession.findMany({
    where: { status: 'CONNECTED' },
    select: { tenantId: true, phoneNumber: true },
  });

  for (const t of tenants) {
    const keys = await prisma.whatsAppAuthKey.findMany({
      where: { tenantId: t.tenantId, key: { startsWith: 'session::' } },
      select: { key: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const msgs = await prisma.whatsAppMessage.findMany({
      where: {
        tenantId: t.tenantId,
        direction: 'OUTBOUND',
        // `NOT { contains }` alone would also drop every row with a NULL
        // errorMessage — SQL three-valued logic — which is exactly the
        // successful sends we care about most.
        OR: [{ errorMessage: null }, { errorMessage: { not: { contains: 'OAuth' } } }],
      },
      select: {
        createdAt: true,
        status: true,
        deliveredAt: true,
        readAt: true,
        externalId: true,
        patient: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`TENANT ${t.tenantId} · linha ${t.phoneNumber ? mask(t.phoneNumber) : '?'}`);

    console.log(`\nsessões Signal criadas (${keys.length}):`);
    for (const k of keys) {
      console.log(`  ${hm(k.createdAt)}  ${k.key.slice('session::'.length)}`);
    }

    console.log(`\nenvios (${msgs.length}), mais recentes por último:`);
    for (const m of msgs.slice(-25)) {
      const state =
        m.readAt || m.deliveredAt ? 'ENTREGUE' : m.status === 'SENT' ? 'travada-ack2' : m.status;
      console.log(
        `  ${hm(m.createdAt)}  ${(m.patient?.name ?? '?').slice(0, 18).padEnd(19)}` +
          ` ${state.padEnd(13)} ${m.externalId ? m.externalId.slice(0, 14) : '(sem id)'}`,
      );
    }

    const lastSession = keys.at(-1)?.createdAt;
    const sendsAfter = lastSession ? msgs.filter((m) => m.createdAt > lastSession) : [];
    console.log(
      `\n→ envios depois da última sessão criada: ${sendsAfter.length}` +
        (sendsAfter.length > 0
          ? `  (${sendsAfter.filter((m) => m.deliveredAt || m.readAt).length} entregues)`
          : ''),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
