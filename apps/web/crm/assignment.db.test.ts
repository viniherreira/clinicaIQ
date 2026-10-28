import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** Responsável, distribuição e "só os dele" contra o banco de desenvolvimento, numa clínica descartável. */
const envFile = resolve(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
process.env.ENCRYPTION_MASTER_KEY ??= 'unit-test-master-key-not-a-real-secret';

describe.skipIf(!process.env.DATABASE_URL)('equipe e distribuição (banco)', async () => {
  const { prisma, getTenantClient, encrypt } = await import('@clinicaiq/db');
  const { ensureDefaultPipeline } = await import('./pipeline');
  const { createLead, updateLead } = await import('./leads');
  const { conversationHash } = await import('./phone');
  const conv = await import('./conversations');
  const a = await import('./assignment');
  const team = await import('./team');
  const { leadWhere } = await import('./board-data');
  const { parseFilters } = await import('./filters');
  const { chatKey } = await import('@/lib/phone');
  const key = process.env.ENCRYPTION_MASTER_KEY!;

  const s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tenant = await prisma.tenant.create({ data: { clerkOrgId: `eq_${s}`, name: 'Equipe', slug: `eq-${s}` } });
  await prisma.subscription.create({
    data: { tenantId: tenant.id, tier: 'PROFISSIONAL', status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000), crmEnabled: true },
  });
  const mk = (name: string, role: 'OWNER' | 'ADMIN' | 'RECEPTIONIST' | 'PROFESSIONAL', extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { tenantId: tenant.id, name, email: `${name}-${s}@teste.local`, role, crmSeat: true, ...extra } });
  const dona = await mk('dona', 'OWNER', { crmReceivesLeads: false });
  const ana = await mk('ana', 'RECEPTIONIST');
  const bia = await mk('bia', 'RECEPTIONIST');
  const caio = await mk('caio', 'PROFESSIONAL');
  const semChave = await mk('sem-chave', 'RECEPTIONIST', { crmSeat: false });
  const db = getTenantClient(tenant.id);
  await ensureDefaultPipeline(db, tenant.id);

  const distribuir = (enabled = true, mode: 'rotation' | 'load' = 'rotation', onlyAvailable = true) =>
    team.saveDistribution(tenant.id, { enabled, mode, onlyAvailable });

  let seq = 0;
  async function chegou(phone: string, name: string) {
    const k = chatKey(phone);
    return (
      await prisma.conversation.create({
        data: {
          tenantId: tenant.id,
          phoneHash: conversationHash(k, tenant.id),
          phoneEncrypted: encrypt(k, key, tenant.id),
          contactName: name,
          unreadCount: 1,
          awaitingReply: true,
          status: 'ACTIVE',
          lastMessageAt: new Date(Date.now() + ++seq * 1000),
        },
      })
    ).id;
  }

  beforeEach(async () => {
    await prisma.user.updateMany({ where: { tenantId: tenant.id }, data: { crmLastAssignedAt: null, crmAvailable: true } });
    await prisma.user.updateMany({ where: { id: { in: [ana.id, bia.id, caio.id] } }, data: { crmReceivesLeads: true } });
  });

  afterAll(async () => {
    await prisma.chatMessage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.leadActivity.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.leadTask.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.conversation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.lead.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.automationRun.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.lostReason.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.pipelineStage.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.pipeline.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.subscription.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it('quem usa o CRM: com chave, de qualquer perfil (o profissional também)', async () => {
    const membros = await a.crmMemberIds(tenant.id);
    expect(membros.has(caio.id)).toBe(true);
    expect(membros.has(semChave.id)).toBe(false);
  });

  it('rodízio: um para cada, sem quem não recebe nem quem está ausente', async () => {
    await prisma.user.update({ where: { id: bia.id }, data: { crmAvailable: false } });
    const regras = { enabled: true, mode: 'rotation' as const, onlyAvailable: true };
    const vez = [];
    for (let i = 0; i < 4; i++) vez.push(await a.pickAssignee(tenant.id, regras, new Date(Date.now() + i * 1000)));
    expect(new Set(vez)).toEqual(new Set([ana.id, caio.id]));
    expect(vez.filter((x) => x === ana.id)).toHaveLength(2);
    expect(vez).not.toContain(dona.id);
  });

  it('menos ocupado: vai para quem tem menos negócios abertos', async () => {
    for (const nome of ['L1', 'L2']) await createLead(db, { tenantId: tenant.id, userId: ana.id }, { name: nome, phone: `11 9${Math.floor(10000000 + Math.random() * 8e7)}` });
    await createLead(db, { tenantId: tenant.id, userId: caio.id }, { name: 'L3', phone: `11 9${Math.floor(10000000 + Math.random() * 8e7)}` });
    expect(await a.pickAssignee(tenant.id, { enabled: true, mode: 'load', onlyAvailable: true })).toBe(bia.id);
  });

  it('número novo: o lead automático e a conversa ganham a mesma pessoa; desligada, ninguém', async () => {
    await distribuir(false);
    const c1 = await chegou('5511987652001', 'Zeca');
    await conv.acceptConversation(db, { tenantId: tenant.id, userId: null }, c1);
    expect(await a.distributeConversation(tenant.id, c1)).toBeNull();

    await distribuir(true);
    const quem = await a.distributeConversation(tenant.id, c1);
    expect([ana.id, bia.id, caio.id]).toContain(quem);
    const depois = await prisma.conversation.findUnique({ where: { id: c1 }, include: { lead: true } });
    expect(depois?.assignedToId).toBe(quem);
    expect(depois?.lead?.assignedToId).toBe(quem);
    const evento = await prisma.leadActivity.findFirst({ where: { leadId: depois!.leadId!, type: 'ASSIGNED' } });
    expect(evento?.data).toMatchObject({ to: quem, via: 'distribution' });

    // Escreveu de novo: continua com quem já atendia, sem gastar a vez de ninguém.
    expect(await a.distributeConversation(tenant.id, c1)).toBe(quem);
  });

  it('transferir a conversa leva o negócio junto; trocar o responsável do negócio leva a conversa', async () => {
    const c2 = await chegou('5511987652002', 'Rui');
    const r = await conv.acceptConversation(db, { tenantId: tenant.id, userId: ana.id }, c2);
    if (!r.ok) throw new Error(r.message);
    expect((await prisma.conversation.findUnique({ where: { id: c2 } }))?.assignedToId).toBe(ana.id);

    await a.assignConversation(db, { tenantId: tenant.id, userId: ana.id }, c2, bia.id, 'transfer');
    expect((await prisma.lead.findUnique({ where: { id: r.leadId } }))?.assignedToId).toBe(bia.id);

    await updateLead(db, { tenantId: tenant.id, userId: dona.id }, r.leadId, { assignedToId: caio.id });
    expect((await prisma.conversation.findUnique({ where: { id: c2 } }))?.assignedToId).toBe(caio.id);
  });

  it('"só os dele": vê os seus e os sem responsável, nas conversas e no funil', async () => {
    const minha = await chegou('5511987652003', 'Minha');
    const deOutra = await chegou('5511987652004', 'Outra');
    const semDono = await chegou('5511987652005', 'Fila');
    await prisma.conversation.update({ where: { id: minha }, data: { assignedToId: ana.id } });
    await prisma.conversation.update({ where: { id: deOutra }, data: { assignedToId: bia.id } });

    const v = { tenantId: tenant.id, userId: ana.id, ownOnly: true };
    const ids = (await conv.listConversations(db, v, 'all')).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([minha, semDono]));
    expect(ids).not.toContain(deOutra);
    expect(await conv.loadThread(db, tenant.id, deOutra, v)).toBeNull();
    expect((await conv.listConversations(db, v, 'unassigned')).map((x) => x.id)).toContain(semDono);

    const leadDaBia = await createLead(db, { tenantId: tenant.id, userId: bia.id }, { name: 'Da Bia', phone: '11 98765-2006' });
    if (!leadDaBia.ok) throw new Error(leadDaBia.message);
    const visiveis = await db.lead.findMany({ where: leadWhere(v, parseFilters({})), select: { id: true } });
    expect(visiveis.map((l) => l.id)).not.toContain(leadDaBia.leadId);
    const todos = await db.lead.findMany({ where: leadWhere({ ...v, ownOnly: false }, parseFilters({})), select: { id: true } });
    expect(todos.map((l) => l.id)).toContain(leadDaBia.leadId);
  });

  it('cargo: o dono é sempre Gestor e ninguém tira o próprio cargo de Gestor', async () => {
    expect((await team.updateMember(tenant.id, ana.id, dona.id, { crmRole: 'AGENT' })).ok).toBe(false);
    expect(await team.updateMember(tenant.id, dona.id, ana.id, { crmRole: 'AGENT_OWN' })).toEqual({ ok: true });
    expect((await prisma.user.findUnique({ where: { id: ana.id } }))?.crmRole).toBe('AGENT_OWN');
    await team.updateMember(tenant.id, dona.id, bia.id, { crmRole: 'MANAGER' });
    expect((await team.updateMember(tenant.id, bia.id, bia.id, { crmRole: 'AGENT' })).ok).toBe(false);
    const t = await team.loadTeam(tenant.id);
    expect(t.members.find((m) => m.id === dona.id)).toMatchObject({ crmRole: 'MANAGER', locked: true });
    expect(t.members.find((m) => m.id === semChave.id)?.member).toBe(false);
  });

  it('passar a carteira: negócios, conversas e tarefas abertas vão para a outra pessoa', async () => {
    const l = await createLead(db, { tenantId: tenant.id, userId: caio.id }, { name: 'Carteira', phone: '11 98765-2007' });
    if (!l.ok) throw new Error(l.message);
    await prisma.leadTask.create({ data: { tenantId: tenant.id, leadId: l.leadId, text: 'Ligar', dueAt: new Date(), assignedToId: caio.id } });
    const r = await team.transferPortfolio(tenant.id, dona.id, caio.id, ana.id);
    expect(r).toMatchObject({ ok: true });
    expect(await prisma.lead.count({ where: { tenantId: tenant.id, assignedToId: caio.id, wonAt: null, lostAt: null, deletedAt: null } })).toBe(0);
    expect(await prisma.leadTask.count({ where: { leadId: l.leadId, assignedToId: ana.id, completedAt: null } })).toBe(1);
  });

  it('distribuir agora as conversas sem responsável', async () => {
    await distribuir(true);
    const fila = await chegou('5511987652008', 'Fila 2');
    const n = await team.distributeUnassigned(tenant.id, dona.id);
    expect(n).toBeGreaterThan(0);
    expect((await prisma.conversation.findUnique({ where: { id: fila } }))?.assignedToId).not.toBeNull();
  });
  it('permissões personalizadas: viram Personalizado; batendo com um cargo, gravam só o cargo', async () => {
    const { ROLE_RIGHTS } = await import('@/lib/crm-rights');
    const custom = { ...ROLE_RIGHTS.AGENT, leads: { ...ROLE_RIGHTS.AGENT.leads, export: 'all' as const } };
    expect(await team.updateMember(tenant.id, dona.id, bia.id, { rights: custom })).toEqual({ ok: true });
    let t = await team.loadTeam(tenant.id);
    expect(t.members.find((m) => m.id === bia.id)).toMatchObject({ custom: true, rights: { leads: { export: 'all' } } });
    expect(await team.updateMember(tenant.id, dona.id, bia.id, { rights: ROLE_RIGHTS.AGENT_OWN })).toEqual({ ok: true });
    const u = await prisma.user.findUnique({ where: { id: bia.id } });
    expect(u?.crmRole).toBe('AGENT_OWN');
    expect(u?.crmRights).toBeNull();
    t = await team.loadTeam(tenant.id);
    expect(t.members.find((m) => m.id === bia.id)?.custom).toBe(false);
    // Ninguém tira de si a configuração; o dono não tem permissões editáveis.
    await team.updateMember(tenant.id, dona.id, bia.id, { crmRole: 'MANAGER' });
    expect((await team.updateMember(tenant.id, bia.id, bia.id, { rights: ROLE_RIGHTS.AGENT })).ok).toBe(false);
    expect((await team.updateMember(tenant.id, bia.id, dona.id, { rights: ROLE_RIGHTS.AGENT })).ok).toBe(false);
  });

  it('preferências: número novo sem lead automático e volta ao negócio fechado', async () => {
    const { readCrmPrefs } = await import('./crm-prefs');
    await team.savePrefs(tenant.id, { autoLead: false, reuseClosedLead: true, senderName: true });
    const t = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { settings: true } });
    expect(readCrmPrefs(t?.settings)).toEqual({ autoLead: false, reuseClosedLead: true, senderName: true });
    // A distribuição continua lá (o JSON das configurações é mesclado, não trocado).
    expect((t?.settings as Record<string, unknown>).crmDistribution).toBeTruthy();

    const fechado = await createLead(db, { tenantId: tenant.id, userId: ana.id }, { name: 'Antigo', phone: '11 98765-2099' });
    if (!fechado.ok) throw new Error(fechado.message);
    await prisma.lead.update({ where: { id: fechado.leadId }, data: { wonAt: new Date() } });
    const c = await chegou('5511987652099', 'Antigo');
    expect(await conv.classifyConversation(db, tenant.id, c)).toBe('lead');
    expect((await prisma.conversation.findUnique({ where: { id: c } }))?.leadId).toBe(fechado.leadId);

    // A assinatura sai na primeira de quem responde, não na seguida.
    await prisma.conversation.update({ where: { id: c }, data: { lastInboundAt: new Date() } });
    const m1 = await conv.writeChatMessage(db, { tenantId: tenant.id, userId: ana.id }, c, 'Oi!', new Date(), { signAs: 'Ana' });
    const m2 = await conv.writeChatMessage(db, { tenantId: tenant.id, userId: ana.id }, c, 'Tudo bem?', new Date(Date.now() + 1000), { signAs: 'Ana' });
    if (!m1.ok || !m2.ok) throw new Error('não gravou');
    const { decrypt } = await import('@clinicaiq/db');
    const texto = async (id: string) => decrypt((await prisma.chatMessage.findUnique({ where: { id } }))!.textEncrypted!, key, tenant.id);
    expect(await texto(m1.messageId)).toBe('*Ana:*\nOi!');
    expect(await texto(m2.messageId)).toBe('Tudo bem?');
    await team.savePrefs(tenant.id, { autoLead: true, reuseClosedLead: false, senderName: false });
  });
});
