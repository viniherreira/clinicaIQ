/**
 * The last outbound attempts, newest first, with what the recipient's routing
 * looks like right now. Read-only — sends nothing.
 */
import { prisma, decrypt } from './db.js';
import { env } from './env.js';

const tenantId = process.argv[2] ?? 'cmqts4z4u0000kv043m23w9ui';
const mask = (d: string) => (d.length <= 6 ? d : `${d.slice(0, 4)}…${d.slice(-4)}`);

const msgs = await prisma.whatsAppMessage.findMany({
  where: { tenantId, direction: 'OUTBOUND' },
  select: {
    createdAt: true,
    status: true,
    externalId: true,
    errorMessage: true,
    deliveredAt: true,
    readAt: true,
    patient: { select: { name: true, phoneEncrypted: true } },
  },
  orderBy: { createdAt: 'desc' },
  take: 14,
});

console.log('quando            paciente             estado         rota gravada agora');
console.log('─'.repeat(94));

for (const m of msgs) {
  const p = m.patient;
  let digits = '';
  try {
    if (p) digits = decrypt(p.phoneEncrypted, env.ENCRYPTION_MASTER_KEY, tenantId).replace(/\D/g, '');
  } catch {
    /* keep going */
  }
  const full = digits.startsWith('55') ? digits : `55${digits}`;

  const keys = await prisma.whatsAppAuthKey.findMany({
    where: { tenantId, key: { contains: full } },
    select: { key: true },
  });
  const kinds = keys.map((k) => k.key.split('::')[0]);

  const state =
    m.readAt || m.deliveredAt
      ? 'ENTREGUE'
      : m.status === 'FAILED'
        ? `FAILED(${(m.errorMessage ?? '').slice(0, 12)})`
        : m.status === 'SENT'
          ? 'travada-ack2'
          : m.status;

  console.log(
    `${m.createdAt.toISOString().slice(5, 16).replace('T', ' ')}  ` +
      `${(p?.name ?? '?').slice(0, 19).padEnd(21)}${state.padEnd(15)}` +
      `${mask(full)} ${kinds.length ? kinds.join(',') : '(sem rota gravada)'}`,
  );
}

await prisma.$disconnect();
