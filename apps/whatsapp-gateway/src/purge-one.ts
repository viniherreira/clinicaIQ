/** Clears one contact's cached routing. `node … src/purge-one.ts 55DDNNNNNNNNN` */
import { prisma } from './db.js';
import { purgeContactRouting } from './auth-state.js';

const tenantId = process.argv[3] ?? 'cmqts4z4u0000kv043m23w9ui';
const digits = (process.argv[2] ?? '').replace(/\D/g, '');
if (!digits) throw new Error('informe o telefone');

const purged = await purgeContactRouting(tenantId, digits);
console.log(`${purged.length} chave(s) apagada(s):`);
for (const k of purged) console.log(`  ${k}`);
await prisma.$disconnect();
