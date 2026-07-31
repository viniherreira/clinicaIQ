/**
 * Read-only forensics for "the message says sent but never arrives".
 *
 * Runs as its OWN process, separate from the gateway — that is the point. It
 * reads the Signal sessions back through the very same `usePostgresAuthState`
 * the socket uses, so a row that decrypts here is proof the data survived the
 * write, the encryption and the process boundary. A store that only "works"
 * inside the live process would fail exactly here.
 *
 *   pnpm --filter @clinicaiq/whatsapp-gateway exec node --import tsx/esm \
 *     --env-file=.env.local src/diagnose.ts
 *
 * Writes nothing. Prints no phone numbers in full and no key material.
 */
import { prisma } from './db.js';
import { usePostgresAuthState } from './auth-state.js';

/** Phone numbers are PII: enough to identify a row, not enough to leak a list. */
const mask = (digits: string) =>
  digits.length <= 6 ? digits : `${digits.slice(0, 4)}…${digits.slice(-4)}`;

const pct = (n: number, of: number) => (of === 0 ? '—' : `${Math.round((n / of) * 100)}%`);

/**
 * What a healthy stored Signal session looks like. Baileys types `session` as
 * `Uint8Array`, but libsignal actually hands the store a serialized
 * `SessionRecord` — a plain object `{ _sessions, version }`. Both forms are
 * legitimate; only an empty record or a missing row means the session was never
 * established. (An earlier version of this script asserted `Buffer.isBuffer`
 * and reported every healthy session as corrupt.)
 */
function intact(value: unknown): boolean {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return value.length > 0;
  if (value && typeof value === 'object') {
    const rec = (value as { _sessions?: Record<string, unknown> })._sessions;
    return Boolean(rec && Object.keys(rec).length > 0);
  }
  return false;
}

function describe(v: unknown): string {
  if (v === undefined) return 'ausente';
  if (v === null) return 'null';
  if (Buffer.isBuffer(v)) return `Buffer(${v.length})`;
  if (v && typeof v === 'object') {
    const rec = (v as { _sessions?: object })._sessions;
    if (rec) return `SessionRecord(${Object.keys(rec).length} ratchets)`;
    return `objeto{${Object.keys(v as object).slice(0, 4).join(',')}}`;
  }
  return typeof v;
}

async function main(): Promise<void> {
  const sessions = await prisma.whatsAppSession.findMany({
    select: { tenantId: true, status: true, phoneNumber: true, connectedAt: true },
  });

  if (sessions.length === 0) {
    console.log('Nenhuma clínica pareada. Nada a diagnosticar.');
    return;
  }

  for (const s of sessions) {
    console.log(`\n${'═'.repeat(72)}`);
    console.log(`TENANT ${s.tenantId}`);
    console.log(
      `linha ${s.phoneNumber ? mask(s.phoneNumber) : '(nenhuma)'} · status ${s.status} · pareada em ${
        s.connectedAt?.toISOString() ?? '—'
      }`,
    );

    // ── 3a. What the auth store actually holds ───────────────────────────────
    const rows = await prisma.whatsAppAuthKey.findMany({
      where: { tenantId: s.tenantId },
      select: { key: true, value: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const byType = new Map<string, typeof rows>();
    for (const r of rows) {
      const type = r.key.includes('::') ? r.key.split('::')[0] : r.key;
      const list = byType.get(type) ?? [];
      list.push(r);
      byType.set(type, list);
    }

    console.log(`\n── keys store (${rows.length} linhas em whatsapp_auth_keys)`);
    if (rows.length === 0) {
      console.log('  VAZIO — nenhuma credencial gravada.');
    }
    for (const [type, list] of [...byType].sort((a, b) => b[1].length - a[1].length)) {
      const newest = list.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
      console.log(
        `  ${type.padEnd(20)} ${String(list.length).padStart(4)} linha(s)` +
          ` · última escrita ${newest.updatedAt.toISOString()}`,
      );
    }

    // ── 3b. Read the Signal sessions back through the real auth state ────────
    // This is the separate-process `keys.get` — it exercises decrypt +
    // BufferJSON.reviver exactly as the socket does.
    const sessionIds = (byType.get('session') ?? []).map((r) => r.key.slice('session::'.length));

    console.log(`\n── keys.get('session', …) num processo separado`);
    if (sessionIds.length === 0) {
      console.log('  NENHUMA sessão Signal gravada.');
    } else {
      const { state } = await usePostgresAuthState(s.tenantId);
      const loaded = await state.keys.get('session', sessionIds);

      let ok = 0;
      const broken: string[] = [];
      for (const id of sessionIds) {
        const value = loaded[id];
        if (intact(value)) ok += 1;
        else broken.push(`${id} → ${describe(value)}`);
      }
      console.log(`  recuperadas e íntegras: ${ok}/${sessionIds.length} (${pct(ok, sessionIds.length)})`);
      if (broken.length > 0) {
        console.log('  QUEBRADAS:');
        for (const b of broken.slice(0, 10)) console.log(`    ${b}`);
      }

      const sample = sessionIds.slice(0, 8);
      console.log(`  amostra de destinatários com sessão gravada:`);
      for (const id of sample) {
        const digits = id.split(/[.@:]/)[0];
        const row = (byType.get('session') ?? []).find(
          (r) => r.key === `session::${id}`,
        );
        console.log(
          `    ${mask(digits).padEnd(16)} criada ${row?.createdAt.toISOString() ?? '?'}` +
            ` · ${describe(loaded[id])}`,
        );
      }
    }

    // ── 4. Delivery split: first contact vs existing conversation ───────────
    const msgs = await prisma.whatsAppMessage.findMany({
      where: { tenantId: s.tenantId },
      select: {
        patientId: true,
        direction: true,
        status: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        createdAt: true,
        errorMessage: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // A patient counts as "existing conversation" if we ever received anything
    // from them — that is precisely the condition the symptom points at.
    const everReplied = new Set(
      msgs.filter((m) => m.direction === 'INBOUND').map((m) => m.patientId),
    );

    // Drop the Meta Cloud API era: those went out through a dead sandbox token
    // and were rejected before any delivery attempt, so they say nothing about
    // whether WhatsApp forwards our messages. Identified by Meta's own OAuth
    // error rather than by date — the auth-key table resets on every re-pairing,
    // so timestamps there can't mark the boundary.
    const isMetaEra = (m: { errorMessage: string | null }) =>
      /OAuthException|Authentication Error/i.test(m.errorMessage ?? '');
    const all = msgs.filter((m) => m.direction === 'OUTBOUND');
    const outbound = all.filter((m) => !isMetaEra(m));
    const group = (existing: boolean) =>
      outbound.filter((m) => everReplied.has(m.patientId) === existing);

    console.log(
      `\n── entrega por histórico (${outbound.length} enviadas via QR` +
        `${all.length - outbound.length > 0 ? `, ${all.length - outbound.length} da era Meta API descartadas` : ''})`,
    );
    console.log('  grupo                 enviadas  entregues   taxa   travadas-em-ack2');
    for (const [label, list] of [
      ['conversa_existente', group(true)],
      ['primeiro_contato', group(false)],
    ] as const) {
      const delivered = list.filter((m) => m.deliveredAt !== null || m.readAt !== null).length;
      // Reached WhatsApp's servers but never the device: the exact fingerprint
      // of a platform-side filter.
      const stuck = list.filter(
        (m) => m.status === 'SENT' && m.deliveredAt === null && m.readAt === null,
      ).length;
      console.log(
        `  ${label.padEnd(20)} ${String(list.length).padStart(8)}` +
          ` ${String(delivered).padStart(10)} ${pct(delivered, list.length).padStart(6)}` +
          ` ${String(stuck).padStart(18)}`,
      );
    }

    const failed = outbound.filter((m) => m.status === 'FAILED');
    if (failed.length > 0) {
      console.log(`\n  ${failed.length} marcada(s) FAILED. Motivos:`);
      const reasons = new Map<string, number>();
      for (const f of failed) {
        // Meta's OAuth errors embed a unique trace id, so group by the prefix or
        // every single one prints as its own "reason".
        const r = (f.errorMessage ?? '(sem motivo)').slice(0, 45);
        reasons.set(r, (reasons.get(r) ?? 0) + 1);
      }
      for (const [r, n] of [...reasons].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(n).padStart(3)}× ${r}`);
      }
    }
  }

  console.log(`\n${'═'.repeat(72)}`);
}

main()
  .catch((e) => {
    console.error('diagnose falhou:', e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
