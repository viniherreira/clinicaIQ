/**
 * Asks WhatsApp about every number the app has reported as "não tem WhatsApp",
 * plus a control group of numbers that did receive. Answers whether that error
 * is telling the truth or whether the lookup itself is unreliable.
 *
 *   node --import tsx/esm --env-file=.env.local src/probe-lookup.ts <gatewayUrl>
 *
 * Read-only. Prints masked numbers only.
 */
import { prisma, decrypt } from './db.js';
import { env } from './env.js';

const BASE = process.argv[2]?.replace(/\/$/, '') ?? 'http://localhost:8080';
// The token must be the *remote* one. .env.local holds a dev placeholder, and
// using it silently yields 401s that look like "the number doesn't exist".
const TOKEN = process.argv[4] || env.GATEWAY_TOKEN;
const mask = (d: string) => (d.length <= 6 ? d : `${d.slice(0, 4)}…${d.slice(-4)}`);

async function lookup(tenantId: string, digits: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}/debug/lookup/${tenantId}/${digits}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json()) as {
      ok?: boolean;
      error?: string;
      results?: Record<string, unknown>;
      resolved?: string | null;
    };
    if (!body.ok) return `gateway: ${body.error ?? JSON.stringify(body.results)} (HTTP ${res.status})`;

    const parts: string[] = [];
    for (const [candidate, r] of Object.entries(body.results ?? {})) {
      const hit = Array.isArray(r) ? r.find((x) => x?.exists) : null;
      parts.push(`${candidate.length === 13 ? 'com9' : 'sem9'}=${hit ? 'existe' : 'vazio'}`);
    }
    return `${parts.join(' ')} → resolvido: ${body.resolved ? 'sim' : 'NAO'}`;
  } catch (e) {
    return `erro: ${e instanceof Error ? e.message : '?'}`;
  }
}

async function main() {
  const tenantId = process.argv[3] ?? 'cmqts4z4u0000kv043m23w9ui';

  const msgs = await prisma.whatsAppMessage.findMany({
    where: { tenantId, direction: 'OUTBOUND' },
    select: {
      status: true,
      errorMessage: true,
      deliveredAt: true,
      readAt: true,
      createdAt: true,
      patient: { select: { id: true, name: true, phoneEncrypted: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // One row per patient: the most recent thing that happened to them.
  const seen = new Map<string, (typeof msgs)[number]>();
  for (const m of msgs) {
    if (m.patient && !seen.has(m.patient.id)) seen.set(m.patient.id, m);
  }

  console.log(`gateway: ${BASE}`);
  console.log(`${seen.size} paciente(s) com histórico de envio\n`);
  console.log('paciente            último resultado    o que o WhatsApp responde');
  console.log('─'.repeat(88));

  for (const m of seen.values()) {
    const p = m.patient!;
    let digits: string;
    try {
      digits = decrypt(p.phoneEncrypted, env.ENCRYPTION_MASTER_KEY, tenantId).replace(/\D/g, '');
    } catch {
      console.log(`${p.name.slice(0, 18).padEnd(20)} (telefone nao decifra)`);
      continue;
    }
    const full = digits.startsWith('55') ? digits : `55${digits}`;

    const outcome =
      m.deliveredAt || m.readAt
        ? 'ENTREGUE'
        : m.status === 'FAILED'
          ? `FAILED: ${(m.errorMessage ?? '').slice(0, 22)}`
          : m.status;

    const answer = await lookup(tenantId, full);
    console.log(
      `${p.name.slice(0, 18).padEnd(20)}${outcome.slice(0, 20).padEnd(20)}${mask(full)}  ${answer}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
