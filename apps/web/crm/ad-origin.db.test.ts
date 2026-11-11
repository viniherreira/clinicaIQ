import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('origem do anúncio (banco)', async () => {
  const { prisma, getTenantClient } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { ingestChat } = await import('./chat-ingest');
  const { afterInbound } = await import('./inbound');
  const { createLead } = await import('./leads');
  const { loadThread } = await import('./conversations');

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `ad_${suffix}`, name: 'Anúncio', slug: `ad-${suffix}` } });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);

  const anuncio = (url: string) => ({
    sourceId: '1202',
    sourceType: 'ad',
    sourceUrl: url,
    headline: 'Prótese de Mama',
    body: 'Apenas este mês…',
    mediaType: 'image' as const,
    imageUrl: 'https://scontent.xx.fbcdn.net/v/t45.abc',
    videoUrl: null,
    thumbnailUrl: null,
    ctwaClid: 'CLID',
  });

  let seq = 0;
  async function chega(phone: string, text: string, ad?: ReturnType<typeof anuncio>) {
    const r = await ingestChat(tenant.id, {
      externalId: `AD${suffix}${seq++}`,
      direction: 'INBOUND',
      origin: 'CONTACT',
      phone,
      contactName: 'Li Sena',
      kind: 'TEXT',
      text,
      ad,
      at: new Date(),
    });
    if (!r.recorded) throw new Error('não gravou');
    await afterInbound(tenant.id, r.conversationId, r.messageId, { skipBot: true });
    return r.conversationId;
  }
  async function leadDa(conversationId: string) {
    const c = await db.conversation.findFirst({ where: { id: conversationId }, select: { leadId: true } });
    const lead = await db.lead.findFirst({ where: { id: c!.leadId! }, include: { tags: { include: { tag: true } }, activities: true } });
    return {
      source: lead!.source,
      tags: lead!.tags.map((t) => t.tag.name).sort(),
      notas: lead!.activities.filter((a) => a.type === 'NOTE').map((a) => (a.data as { text: string }).text),
    };
  }

  afterAll(async () => {
    const t = { tenantId: tenant.id };
    await prisma.chatMessage.deleteMany({ where: t });
    await prisma.conversation.deleteMany({ where: t });
    await prisma.automationRun.deleteMany({ where: t });
    await prisma.leadTagOnLead.deleteMany({ where: t });
    await prisma.leadTag.deleteMany({ where: t });
    await prisma.leadTask.deleteMany({ where: t });
    await prisma.leadActivity.deleteMany({ where: t });
    await prisma.lead.deleteMany({ where: t });
    await prisma.lostReason.deleteMany({ where: t });
    await prisma.pipelineStage.deleteMany({ where: t });
    await prisma.pipeline.deleteMany({ where: t });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('número novo por anúncio do Facebook: lead nasce com origem Facebook, tag e nota do anúncio', async () => {
    const id = await chega('11 95555-0001', 'Diminuir as mamas um sonho meu', anuncio('https://fb.me/4YAcPbZJ2'));
    expect(await leadDa(id)).toEqual({
      source: 'FACEBOOK',
      // "Prótese" no anúncio também vira tag de procedimento (tags automáticas).
      tags: ['facebook', 'prótese'],
      notas: ['Veio do anúncio “Prótese de Mama” (Facebook).', 'Tags automáticas: a pessoa falou em “protese”.'],
    });
    const tag = await db.leadTag.findFirst({ where: { name: 'facebook' } });
    expect(tag?.color).toBe('blue');
  });

  it('a conversa mostra o card do anúncio', async () => {
    const id = await chega('11 95555-0002', 'Quero saber o valor', anuncio('https://www.instagram.com/p/C1abc/'));
    const thread = await loadThread(db, tenant.id, id);
    expect(thread?.messages.at(-1)?.ad).toEqual({
      platform: 'Instagram',
      headline: 'Prótese de Mama',
      body: 'Apenas este mês…',
      url: 'https://www.instagram.com/p/C1abc/',
      imageUrl: 'https://scontent.xx.fbcdn.net/v/t45.abc',
    });
    expect(await leadDa(id)).toMatchObject({ source: 'INSTAGRAM', tags: ['instagram', 'prótese'] });
  });

  it('a tag da clínica com o mesmo nome é reaproveitada, sem criar outra', async () => {
    await chega('11 95555-0003', 'Oi', anuncio('https://instagram.com/reel/XYZ'));
    expect(await db.leadTag.count({ where: { name: { equals: 'instagram', mode: 'insensitive' } } })).toBe(1);
  });

  it('"vim pelo site" na primeira mensagem: origem Site e tag site', async () => {
    const id = await chega('11 95555-0004', 'Olá! Vim pelo site e quero agendar uma avaliação');
    expect(await leadDa(id)).toEqual({ source: 'SITE', tags: ['site'], notas: [] });
  });

  it('mensagem comum fica com a origem WhatsApp e a tag whatsapp', async () => {
    const id = await chega('11 95555-0005', 'Boa tarde, quero agendar');
    expect(await leadDa(id)).toEqual({ source: 'WHATSAPP', tags: ['whatsapp'], notas: [] });
  });

  it('quem já tinha negócio aberto e chega por anúncio: o negócio ganha a origem e a tag', async () => {
    const r = await createLead(db, { tenantId: tenant.id, userId: null }, { name: 'Bia', phone: '11 95555-0006', source: 'WHATSAPP' });
    if (!r.ok) throw new Error(r.message);
    const id = await chega('11 95555-0006', 'Vi o anúncio', anuncio('https://fb.me/abc'));
    const c = await db.conversation.findFirst({ where: { id }, select: { leadId: true } });
    expect(c?.leadId).toBe(r.leadId);
    expect(await leadDa(id)).toMatchObject({ source: 'FACEBOOK', tags: ['facebook', 'prótese'] });
  });
});
