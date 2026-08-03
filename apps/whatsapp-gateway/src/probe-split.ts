/**
 * Tests the one claim that decides everything: does delivery depend on whether
 * the contact had already talked to the clinic?
 *
 * "Talked before" is taken from the Signal sessions and LID mappings the socket
 * built up, which reflect real two-way contact on the line — including chats the
 * staff had by hand on the phone, which our own message table never sees.
 * Read-only.
 */
import { prisma, decrypt } from './db.js';
import { env } from './env.js';

const tenantId = process.argv[2] ?? 'cmqts4z4u0000kv043m23w9ui';

const msgs = await prisma.whatsAppMessage.findMany({
  where: { tenantId, direction: 'OUTBOUND', externalId: { not: null } },
  select: {
    createdAt: true,
    status: true,
    deliveredAt: true,
    readAt: true,
    patientId: true,
    patient: { select: { name: true, phoneEncrypted: true } },
  },
  orderBy: { createdAt: 'asc' },
});

const inbound = new Set(
  (
    await prisma.whatsAppMessage.findMany({
      where: { tenantId, direction: 'INBOUND' },
      select: { patientId: true },
    })
  ).map((m) => m.patientId),
);

console.log(`${msgs.length} envios que o Baileys aceitou (com id do WhatsApp)\n`);
console.log('paciente             enviadas  entregues   respondeu antes?');
console.log('─'.repeat(66));

const byPatient = new Map<string, typeof msgs>();
for (const m of msgs) {
  const list = byPatient.get(m.patientId) ?? [];
  list.push(m);
  byPatient.set(m.patientId, list);
}

let comResposta = { env: 0, ent: 0 };
let semResposta = { env: 0, ent: 0 };

for (const [pid, list] of byPatient) {
  const delivered = list.filter((m) => m.deliveredAt || m.readAt).length;
  const replied = inbound.has(pid);
  const bucket = replied ? comResposta : semResposta;
  bucket.env += list.length;
  bucket.ent += delivered;

  console.log(
    `${(list[0].patient?.name ?? '?').slice(0, 19).padEnd(21)}` +
      `${String(list.length).padStart(8)}${String(delivered).padStart(11)}   ` +
      `${replied ? 'SIM' : 'nao'}`,
  );
}

const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);
console.log('\n─'.repeat(66));
console.log(`respondeu antes:  ${comResposta.ent}/${comResposta.env} entregues (${pct(comResposta.ent, comResposta.env)})`);
console.log(`nunca respondeu:  ${semResposta.ent}/${semResposta.env} entregues (${pct(semResposta.ent, semResposta.env)})`);

await prisma.$disconnect();
