import { getTenantClient, prisma, type TenantPrismaClient } from '@clinicaiq/db';
import { can } from '@/lib/permissions';
import { rankCandidates, readDistribution, type DistributionSettings } from './distribution-rules';
import { OPEN_LEAD, type Actor } from './leads';

/**
 * Quem atende o quê no CRM: o responsável do negócio e o da conversa andam
 * juntos, e a distribuição escolhe alguém quando ninguém foi escolhido.
 *
 * Regra de ouro: a conversa e o negócio aberto dela têm o mesmo responsável.
 * Trocar um troca o outro — senão a aba "Minhas" e o funil discordariam sobre
 * de quem é o cliente. Conversa de paciente sem negócio tem só o dela.
 */

/** Como o responsável mudou — vai para o histórico do negócio. */
export type AssignVia = 'manual' | 'distribution' | 'transfer' | 'take' | 'automation';

/** Quem da equipe usa o CRM agora: ativo, com perfil que entra e com acesso (ou cortesia). */
export async function crmMemberIds(tenantId: string): Promise<Set<string>> {
  const [sub, users] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId }, select: { complimentary: true } }),
    prisma.user.findMany({ where: { tenantId, active: true }, select: { id: true, role: true, crmSeat: true } }),
  ]);
  const todos = Boolean(sub?.complimentary);
  return new Set(users.filter((u) => can(u.role, 'crm') && (todos || u.crmSeat)).map((u) => u.id));
}

/**
 * O próximo a receber, pelas regras da clínica. Marca a hora em que recebeu na
 * mesma gravação que confere que ninguém passou na frente: duas mensagens
 * chegando juntas não caem na mesma pessoa no rodízio.
 */
export async function pickAssignee(tenantId: string, settings?: DistributionSettings, now: Date = new Date()): Promise<string | null> {
  const regras = settings ?? readDistribution((await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }))?.settings);
  const membros = await crmMemberIds(tenantId);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const pessoas = await prisma.user.findMany({
      where: { tenantId, active: true, crmReceivesLeads: true, id: { in: [...membros] } },
      select: { id: true, crmAvailable: true, crmLastAssignedAt: true, createdAt: true },
    });
    if (pessoas.length === 0) return null;
    const abertos =
      regras.mode === 'load'
        ? await prisma.lead.groupBy({
            by: ['assignedToId'],
            where: { tenantId, ...OPEN_LEAD, assignedToId: { in: pessoas.map((p) => p.id) } },
            _count: { _all: true },
          })
        : [];
    const porPessoa = new Map(abertos.map((r) => [r.assignedToId, r._count._all]));
    const ordem = rankCandidates(
      pessoas.map((p) => ({
        id: p.id,
        available: p.crmAvailable,
        lastAssignedAt: p.crmLastAssignedAt,
        openLeads: porPessoa.get(p.id) ?? 0,
        createdAt: p.createdAt,
      })),
      regras,
    );
    const escolhido = pessoas.find((p) => p.id === ordem[0]);
    if (!escolhido) return null;
    const { count } = await prisma.user.updateMany({
      where: { id: escolhido.id, tenantId, crmLastAssignedAt: escolhido.crmLastAssignedAt },
      data: { crmLastAssignedAt: now },
    });
    if (count) return escolhido.id;
  }
  // Disputa até o fim: melhor repetir alguém do que deixar sem ninguém.
  const qualquer = await prisma.user.findFirst({
    where: { tenantId, active: true, crmReceivesLeads: true, id: { in: [...membros] } },
    orderBy: { crmLastAssignedAt: 'asc' },
    select: { id: true },
  });
  return qualquer?.id ?? null;
}

/** Troca o responsável do negócio e, junto, o das conversas dele. */
export async function assignLead(
  db: TenantPrismaClient,
  actor: Actor,
  leadId: string,
  userId: string | null,
  via: AssignVia = 'manual',
): Promise<{ ok: true; changed: boolean } | { ok: false; message: string }> {
  const { tenantId } = actor;
  const lead = await db.lead.findFirst({ where: { id: leadId, deletedAt: null }, select: { id: true, assignedToId: true } });
  if (!lead) return { ok: false, message: 'Lead não encontrado.' };
  if (userId && !(await db.user.findFirst({ where: { id: userId, active: true }, select: { id: true } }))) {
    return { ok: false, message: 'Essa pessoa não está mais na equipe.' };
  }
  await db.conversation.updateMany({ where: { leadId: lead.id }, data: { assignedToId: userId } });
  if (lead.assignedToId === userId) return { ok: true, changed: false };
  await db.$transaction(async (tx) => {
    await tx.lead.updateMany({ where: { id: lead.id, tenantId }, data: { assignedToId: userId, updatedById: actor.userId } });
    await tx.leadActivity.create({
      data: { tenantId, leadId: lead.id, type: 'ASSIGNED', actorId: actor.userId, data: { from: lead.assignedToId, to: userId, via } },
    });
  });
  return { ok: true, changed: true };
}

/**
 * Troca quem atende a conversa. Com negócio aberto, o negócio vai junto
 * (transferir a conversa é transferir o cliente, como no Kommo).
 */
export async function assignConversation(
  db: TenantPrismaClient,
  actor: Actor,
  conversationId: string,
  userId: string | null,
  via: AssignVia = 'transfer',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const conv = await db.conversation.findFirst({
    where: { id: conversationId },
    select: { id: true, leadId: true, lead: { select: { wonAt: true, lostAt: true, deletedAt: true } } },
  });
  if (!conv) return { ok: false, message: 'Conversa não encontrada.' };
  if (userId && !(await db.user.findFirst({ where: { id: userId, active: true }, select: { id: true } }))) {
    return { ok: false, message: 'Essa pessoa não está mais na equipe.' };
  }
  const aberto = conv.lead && !conv.lead.wonAt && !conv.lead.lostAt && !conv.lead.deletedAt;
  if (conv.leadId && aberto) {
    const r = await assignLead(db, actor, conv.leadId, userId, via);
    if (!r.ok) return r;
  }
  await db.conversation.updateMany({ where: { id: conv.id }, data: { assignedToId: userId } });
  return { ok: true };
}

/**
 * Depois de cada mensagem do contato: a conversa precisa de alguém.
 *
 * 1. Já tem responsável que continua no CRM: fica (o negócio aberto sem
 *    responsável ganha o mesmo).
 * 2. O negócio aberto tem responsável: a conversa vai para ele — é o "cliente
 *    volta para quem já atendia".
 * 3. Senão, com a distribuição ligada, a vez de alguém.
 *
 * Devolve quem ficou responsável (ou null).
 */
export async function distributeConversation(tenantId: string, conversationId: string, now: Date = new Date()): Promise<string | null> {
  const db = getTenantClient(tenantId);
  const conv = await db.conversation.findFirst({
    where: { id: conversationId, status: { not: 'DECLINED' } },
    select: {
      id: true,
      assignedToId: true,
      leadId: true,
      lead: { select: { id: true, assignedToId: true, wonAt: true, lostAt: true, deletedAt: true } },
    },
  });
  if (!conv) return null;
  const lead = conv.lead && !conv.lead.wonAt && !conv.lead.lostAt && !conv.lead.deletedAt ? conv.lead : null;
  const membros = await crmMemberIds(tenantId);
  const automatico: Actor = { tenantId, userId: null };

  if (conv.assignedToId && membros.has(conv.assignedToId)) {
    if (lead && !lead.assignedToId) await assignLead(db, automatico, lead.id, conv.assignedToId, 'distribution');
    return conv.assignedToId;
  }
  if (lead?.assignedToId && membros.has(lead.assignedToId)) {
    await db.conversation.updateMany({ where: { id: conv.id }, data: { assignedToId: lead.assignedToId } });
    return lead.assignedToId;
  }

  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const regras = readDistribution(t?.settings);
  if (!regras.enabled) return null;
  const quem = await pickAssignee(tenantId, regras, now);
  if (!quem) return null;
  await assignConversation(db, automatico, conv.id, quem, 'distribution');
  return quem;
}
