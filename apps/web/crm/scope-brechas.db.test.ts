import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: () => undefined }));

/** Quem está logado no CRM. Preenchido depois de criar a equipe. */
let acesso: { tenantId: string; userId: string; role: 'RECEPTIONIST' } | null = null;
vi.mock('@/lib/guard', () => ({ currentAccess: async () => acesso }));
vi.mock('@/lib/access', async (original) => ({
  ...(await original<typeof import('@/lib/access')>()),
  getTenantModules: async () => ({ clinic: true, crm: true, crmWholeTeam: true }),
  writeBlocked: async () => null,
}));

/**
 * O Atendente "só os dele" vê o que é dele e o que está sem responsável. Três
 * portas não passavam pelo escopo (achado F-11 da auditoria): abrir a mídia de
 * uma mensagem, reenviar uma mensagem que falhou e a busca de "Ligar a…".
 */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('escopo "só os dele" (banco)', async () => {
  const { prisma, getTenantClient, encrypt } = await import('@clinicaiq/db');
  const { conversationHash } = await import('./phone');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead } = await import('./leads');
  const { GET: abrirMidia } = await import('@/app/api/crm/media/[id]/route');
  const { retryChatAction, searchLinkTargetsAction } = await import('@/app/(crm)/crm/conversas/actions');

  const key = process.env.ENCRYPTION_MASTER_KEY!;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({
    data: { clerkOrgId: `escopo_${suffix}`, name: 'Escopo teste', slug: `escopo-${suffix}` },
  });
  const pessoa = (nome: string, crmRole: string) =>
    prisma.user.create({
      data: { tenantId: tenant.id, name: nome, email: `${nome.toLowerCase()}-${suffix}@teste.local`, role: 'RECEPTIONIST', crmRole },
    });
  const eu = await pessoa('Eu', 'AGENT_OWN');
  const outra = await pessoa('Outra', 'AGENT');

  const conversaDaOutra = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      phoneHash: conversationHash('5511987650003', tenant.id),
      phoneEncrypted: encrypt('5511987650003', key, tenant.id),
      contactName: 'Contato da Outra',
      assignedToId: outra.id,
    },
  });
  const mensagem = (dados: { origin: 'CRM' | 'CONTACT'; status: 'FAILED' | 'SENT'; mediaRef?: string }) =>
    prisma.chatMessage.create({
      data: {
        tenantId: tenant.id,
        conversationId: conversaDaOutra.id,
        direction: dados.origin === 'CRM' ? 'OUTBOUND' : 'INBOUND',
        origin: dados.origin,
        status: dados.status,
        kind: dados.mediaRef ? 'IMAGE' : 'TEXT',
        externalId: `ext-${Math.random().toString(36).slice(2)}`,
        mediaRef: dados.mediaRef ?? null,
        mimeType: dados.mediaRef ? 'image/png' : null,
      },
    });
  const foto = await mensagem({ origin: 'CONTACT', status: 'SENT', mediaRef: `local:${tenant.id}/crm/x/foto.png` });
  const falhou = await mensagem({ origin: 'CRM', status: 'FAILED' });

  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);
  const lead = await createLead(db, { tenantId: tenant.id, userId: outra.id }, { name: 'Zuleica Escopo', phone: '11987650004' });
  if (!lead.ok) throw new Error(lead.message);
  await prisma.lead.update({ where: { id: lead.leadId }, data: { assignedToId: outra.id } });

  acesso = { tenantId: tenant.id, userId: eu.id, role: 'RECEPTIONIST' };

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.leadTask.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.user.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  });

  it('não abre a mídia de conversa de outra pessoa', async () => {
    const r = await abrirMidia(new Request('http://localhost/api/crm/media/x'), { params: Promise.resolve({ id: foto.id }) });
    expect(r.status).toBe(404);
  });

  it('não reenvia mensagem de conversa de outra pessoa', async () => {
    const r = await retryChatAction(falhou.id);
    expect(r.ok).toBe(false);
    const depois = await prisma.chatMessage.findUnique({ where: { id: falhou.id }, select: { status: true } });
    expect(depois?.status).toBe('FAILED');
  });

  it('a busca de "Ligar a…" não mostra negócio de outra pessoa', async () => {
    const r = await searchLinkTargetsAction('Zuleica');
    expect(r.ok).toBe(true);
    expect(r.ok && r.targets.some((t) => t.kind === 'lead')).toBe(false);
  });
});
