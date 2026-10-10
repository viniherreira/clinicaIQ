import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

for (const f of ['../../../packages/db/.env', '../../web/.env.local']) {
  const path = resolve(__dirname, f);
  if (existsSync(path)) process.loadEnvFile(path);
}
const ready = Boolean(process.env.DATABASE_URL && process.env.ENCRYPTION_MASTER_KEY);

/** O socket simulado: o teste decide o que o WhatsApp responde. */
const send = vi.fn();
vi.mock('./session-manager.js', () => ({ send: (...a: unknown[]) => send(...a) }));

describe.skipIf(!ready)('envio pelo CRM (banco)', async () => {
  const { prisma, encrypt } = await import('./db.js');
  const { sendChat } = await import('./chat-send.js');
  const key = process.env.ENCRYPTION_MASTER_KEY!;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `send_${suffix}`, name: 'Envio', slug: `send-${suffix}` } });
  const conv = await prisma.conversation.create({
    data: { tenantId: tenant.id, phoneHash: `h_${suffix}`, phoneEncrypted: encrypt('5511987654321', key, tenant.id), status: 'ACTIVE' },
  });

  let seq = 0;
  const pending = (createdAt = new Date()) =>
    prisma.chatMessage.create({
      data: {
        tenantId: tenant.id,
        conversationId: conv.id,
        direction: 'OUTBOUND',
        origin: 'CRM',
        textEncrypted: encrypt('Tenho terça às 15h', key, tenant.id),
        externalId: `3EB0SEND${suffix}${seq++}`,
        status: 'PENDING',
        createdAt,
      },
    });

  beforeEach(() => send.mockReset());

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.conversation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('manda decifrado, com o id já escolhido, e marca como aceita', async () => {
    send.mockResolvedValue({ success: true, messageId: 'x' });
    const m = await pending();
    expect(await sendChat(tenant.id, m.id)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith(tenant.id, '5511987654321', { text: 'Tenho terça às 15h', messageId: m.externalId, origin: 'CRM' });
    const row = await prisma.chatMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.acceptedAt).not.toBeNull();
    expect(row.claimedUntil).toBeNull();
    // Aceita não sai de novo.
    expect(await sendChat(tenant.id, m.id)).toEqual({ ok: false, error: 'not-pending' });
  });

  it('dois pedidos ao mesmo tempo: só um manda', async () => {
    send.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { success: true };
    });
    const m = await pending();
    const results = await Promise.all([sendChat(tenant.id, m.id), sendChat(tenant.id, m.id)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('linha fora do ar: espera sem gastar tentativa', async () => {
    send.mockResolvedValue({ success: false, error: 'not-connected' });
    const m = await pending();
    await sendChat(tenant.id, m.id);
    const row = await prisma.chatMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row).toMatchObject({ status: 'PENDING', attempts: 0, claimedUntil: null });
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('número sem WhatsApp falha de vez, com o motivo', async () => {
    send.mockResolvedValue({ success: false, error: 'numero-sem-whatsapp' });
    const m = await pending();
    await sendChat(tenant.id, m.id);
    const row = await prisma.chatMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.status).toBe('FAILED');
    expect(row.errorMessage).toMatch(/WhatsApp não encontrado/);
  });

  it('passou de 1 hora: desiste sem mandar', async () => {
    const m = await pending(new Date(Date.now() - 2 * 60 * 60_000));
    expect(await sendChat(tenant.id, m.id)).toEqual({ ok: false, error: 'expired' });
    expect(send).not.toHaveBeenCalled();
    expect((await prisma.chatMessage.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('FAILED');
  });
});
