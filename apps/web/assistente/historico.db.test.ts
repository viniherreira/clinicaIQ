import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('histórico do assistente (banco)', async () => {
  const { prisma } = await import('@clinicaiq/db');
  const h = await import('./historico');
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `iah_${sufixo}`, name: 'H', slug: `iah-${sufixo}` } });
  const ana = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Ana', email: `a-${sufixo}@t.local`, role: 'OWNER' } });
  const bia = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Bia', email: `b-${sufixo}@t.local`, role: 'RECEPTIONIST' } });

  const outra = await prisma.tenant.create({ data: { clerkOrgId: `iah2_${sufixo}`, name: 'H2', slug: `iah2-${sufixo}` } });
  const msg = (text: string) => ({ param: { role: 'user' as const, content: [{ type: 'text' as const, text }] }, tools: [], inputTokens: 0, outputTokens: 0 });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: outra.id } });
    await prisma.assistantMessage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.assistantConversation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('grava cifrado e devolve na ordem, só para o dono da conversa', async () => {
    const id = await h.criarConversa(tenant.id, ana.id, 'Últimos atendidos');
    await h.salvarMensagens(tenant.id, id, [
      { param: { role: 'user', content: [{ type: 'text', text: 'Maria Souza deve?' }] }, tools: [], inputTokens: 0, outputTokens: 0 },
      { param: { role: 'assistant', content: [{ type: 'text', text: 'Deve R$ 500,00.' }] }, tools: ['saldo_devedor'], inputTokens: 900, outputTokens: 40 },
    ]);
    await h.salvarMensagens(tenant.id, id, [
      { param: { role: 'user', content: [{ type: 'text', text: 'e a Bia?' }] }, tools: [], inputTokens: 0, outputTokens: 0 },
    ]);

    const bruto = await prisma.assistantMessage.findMany({ where: { conversationId: id }, orderBy: { seq: 'asc' } });
    expect(bruto.map((m) => m.seq)).toEqual([0, 1, 2]);
    expect(bruto[0].content).not.toContain('Maria');
    expect(bruto[1].tools).toEqual(['saldo_devedor']);

    const hist = await h.carregarHistorico(tenant.id, ana.id, id);
    expect(hist!.map((p) => p.role)).toEqual(['user', 'assistant', 'user']);
    expect(await h.carregarHistorico(tenant.id, bia.id, id)).toBeNull();
    expect((await h.listarConversas(tenant.id, ana.id)).map((c) => c.titulo)).toContain('Últimos atendidos');
    const crua = await prisma.assistantConversation.findUnique({ where: { id }, select: { title: true } });
    expect(crua!.title).not.toContain('Últimos');
    expect(await h.listarConversas(tenant.id, bia.id)).toEqual([]);
  });

  it('apaga o que passou de 30 dias', async () => {
    const velha = await h.criarConversa(tenant.id, ana.id, 'velha');
    await prisma.assistantConversation.update({ where: { id: velha }, data: { updatedAt: new Date(Date.now() - 31 * 86_400_000) } });
    const nova = await h.criarConversa(tenant.id, ana.id, 'nova');
    expect(await h.apagarAntigas(new Date())).toBeGreaterThanOrEqual(1);
    expect(await prisma.assistantConversation.findUnique({ where: { id: velha } })).toBeNull();
    expect(await prisma.assistantConversation.findUnique({ where: { id: nova } })).not.toBeNull();
  });

  it('não grava em conversa de outra clínica', async () => {
    const id = await h.criarConversa(tenant.id, ana.id, 'minha');
    await expect(h.salvarMensagens(outra.id, id, [msg('intruso')])).rejects.toThrow('conversa não encontrada');
    expect(await prisma.assistantMessage.count({ where: { conversationId: id } })).toBe(0);
  });

  it('gravações simultâneas na mesma conversa não perdem nem repetem seq', async () => {
    const id = await h.criarConversa(tenant.id, ana.id, 'concorrente');
    await Promise.all([
      h.salvarMensagens(tenant.id, id, [msg('a1'), msg('a2')]),
      h.salvarMensagens(tenant.id, id, [msg('b1'), msg('b2')]),
      h.salvarMensagens(tenant.id, id, [msg('c1')]),
    ]);
    const bruto = await prisma.assistantMessage.findMany({ where: { conversationId: id }, orderBy: { seq: 'asc' } });
    expect(bruto.map((m) => m.seq)).toEqual([0, 1, 2, 3, 4]);
  });
});
