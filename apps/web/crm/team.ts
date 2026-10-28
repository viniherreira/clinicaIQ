import { getTenantClient, prisma, Prisma as PrismaNS, type Prisma } from '@clinicaiq/db';
import { can } from '@/lib/permissions';
import { crmRoleLocked, effectiveCrmRole, isCrmRole, type CrmRole } from '@/lib/crm-roles';
import { effectiveRights, presetOf, readRights, ROLE_RIGHTS, type CrmRights } from '@/lib/crm-rights';
import { readCrmPrefs, type CrmPrefs } from './crm-prefs';
import { assignLead, crmMemberIds, pickAssignee } from './assignment';
import { readDistribution, type DistributionSettings } from './distribution-rules';
import { OPEN_LEAD, type Actor } from './leads';

/**
 * A equipe do CRM (CRM › Equipe e distribuição): quem usa, com que cargo, quem
 * recebe leads e como. O cadastro de quem entra na clínica continua em
 * Configurações › Equipe; aqui só se mexe no que é do CRM.
 */

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  /** Perfil na clínica (Proprietário, Recepção…). */
  role: string;
  crmRole: CrmRole;
  /** As permissões que valem (quadro do Kommo). */
  rights: CrmRights;
  /** As permissões não batem com nenhum cargo pronto. */
  custom: boolean;
  /** O dono é sempre Gestor. */
  locked: boolean;
  /** Tem acesso ao CRM agora (chave ligada ou cortesia). */
  member: boolean;
  seat: boolean;
  receivesLeads: boolean;
  available: boolean;
  openLeads: number;
  /** Conversas dela esperando resposta. */
  awaiting: number;
  lastAssignedAt: string | null;
}

export async function loadTeam(tenantId: string): Promise<{ members: TeamMember[]; distribution: DistributionSettings; unassigned: number }> {
  const [users, membros, tenant, leads, conversas, semDono] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId, active: true },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        crmRole: true,
        crmRights: true,
        crmSeat: true,
        crmReceivesLeads: true,
        crmAvailable: true,
        crmLastAssignedAt: true,
      },
    }),
    crmMemberIds(tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
    prisma.lead.groupBy({ by: ['assignedToId'], where: { tenantId, ...OPEN_LEAD }, _count: { _all: true } }),
    prisma.conversation.groupBy({
      by: ['assignedToId'],
      where: { tenantId, status: { not: 'DECLINED' }, awaitingReply: true },
      _count: { _all: true },
    }),
    prisma.conversation.count({ where: { tenantId, status: { not: 'DECLINED' }, assignedToId: null } }),
  ]);
  const abertos = new Map(leads.map((r) => [r.assignedToId, r._count._all]));
  const esperando = new Map(conversas.map((r) => [r.assignedToId, r._count._all]));
  return {
    members: users
      .filter((u) => can(u.role, 'crm'))
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        crmRole: effectiveCrmRole(u.role, u.crmRole),
        rights: effectiveRights(u.role, u.crmRole, u.crmRights),
        custom: presetOf(effectiveRights(u.role, u.crmRole, u.crmRights)) === null,
        locked: crmRoleLocked(u.role),
        member: membros.has(u.id),
        seat: u.crmSeat,
        receivesLeads: u.crmReceivesLeads,
        available: u.crmAvailable,
        openLeads: abertos.get(u.id) ?? 0,
        awaiting: esperando.get(u.id) ?? 0,
        lastAssignedAt: u.crmLastAssignedAt?.toISOString() ?? null,
      })),
    distribution: readDistribution(tenant?.settings),
    unassigned: semDono,
  };
}

export type MemberPatch = {
  crmRole?: CrmRole;
  /** Permissões do quadro. Batendo com um cargo, grava só o cargo; senão, "Personalizado". */
  rights?: CrmRights;
  receivesLeads?: boolean;
  available?: boolean;
};

/** Cargo, "recebe leads" e disponível de alguém da equipe. Quem chama é Gestor. */
export async function updateMember(
  tenantId: string,
  actorId: string,
  userId: string,
  patch: MemberPatch,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const alvo = await prisma.user.findFirst({ where: { id: userId, tenantId, active: true }, select: { id: true, role: true, crmRole: true } });
  if (!alvo) return { ok: false, message: 'Pessoa não encontrada na equipe.' };
  const data: Prisma.UserUpdateInput = {};
  if (patch.crmRole !== undefined) {
    if (!isCrmRole(patch.crmRole)) return { ok: false, message: 'Cargo inválido.' };
    if (crmRoleLocked(alvo.role) && patch.crmRole !== 'MANAGER') {
      return { ok: false, message: 'O proprietário é sempre Gestor do CRM.' };
    }
    // Quem está mudando o próprio cargo não pode se trancar fora da configuração.
    if (alvo.id === actorId && patch.crmRole !== 'MANAGER') {
      return { ok: false, message: 'Você não pode tirar o seu próprio cargo de Gestor. Peça a outro gestor.' };
    }
    data.crmRole = patch.crmRole;
    if (patch.rights === undefined) data.crmRights = PrismaNS.DbNull;
  }
  if (patch.rights !== undefined) {
    if (crmRoleLocked(alvo.role)) return { ok: false, message: 'O proprietário tem todas as permissões do CRM.' };
    const base = ROLE_RIGHTS[isCrmRole(patch.crmRole) ? patch.crmRole : effectiveCrmRole(alvo.role, alvo.crmRole)];
    const r = readRights(patch.rights, base);
    if (alvo.id === actorId && !r.config) {
      return { ok: false, message: 'Você não pode tirar de si mesmo a configuração do CRM. Peça a outro gestor.' };
    }
    const pronto = presetOf(r);
    if (pronto) {
      data.crmRole = pronto;
      data.crmRights = PrismaNS.DbNull;
    } else {
      data.crmRights = r as unknown as Prisma.InputJsonValue;
    }
  }
  if (typeof patch.receivesLeads === 'boolean') data.crmReceivesLeads = patch.receivesLeads;
  if (typeof patch.available === 'boolean') data.crmAvailable = patch.available;
  if (Object.keys(data).length === 0) return { ok: true };
  await prisma.$transaction([
    prisma.user.update({ where: { id: alvo.id }, data }),
    prisma.auditLog.create({
      data: {
        tenantId,
        userId: actorId,
        action: 'CRM_MEMBER_UPDATED',
        entity: 'User',
        entityId: alvo.id,
        metadata: { ...patch, antes: alvo.crmRole ?? null } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);
  return { ok: true };
}

export async function saveDistribution(tenantId: string, s: DistributionSettings): Promise<void> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const atual = t?.settings && typeof t.settings === 'object' ? (t.settings as Record<string, unknown>) : {};
  const limpo = readDistribution({ crmDistribution: s });
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ...atual, crmDistribution: { ...limpo } } } });
}

/**
 * Distribui agora as conversas sem responsável (as mais recentes primeiro) —
 * para quando a distribuição acaba de ser ligada, ou alguém saiu.
 */
export async function distributeUnassigned(tenantId: string, actorId: string, limit = 200): Promise<number> {
  const db = getTenantClient(tenantId);
  const regras = readDistribution((await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }))?.settings);
  const fila = await db.conversation.findMany({
    where: { status: { not: 'DECLINED' }, assignedToId: null },
    orderBy: { lastMessageAt: 'desc' },
    take: limit,
    select: { id: true, leadId: true, lead: { select: { assignedToId: true, wonAt: true, lostAt: true, deletedAt: true } } },
  });
  const actor: Actor = { tenantId, userId: actorId };
  let feitas = 0;
  for (const c of fila) {
    const aberto = c.lead && !c.lead.wonAt && !c.lead.lostAt && !c.lead.deletedAt;
    // O negócio já tem dono: a conversa vai para ele, sem gastar a vez de ninguém.
    const quem = (aberto && c.lead?.assignedToId) || (await pickAssignee(tenantId, regras));
    if (!quem) break;
    if (aberto && c.leadId) await assignLead(db, actor, c.leadId, quem, 'distribution');
    await db.conversation.updateMany({ where: { id: c.id, assignedToId: null }, data: { assignedToId: quem } });
    feitas++;
  }
  return feitas;
}

/**
 * Passa a carteira de alguém (negócios abertos e conversas) para outra pessoa
 * ou pela distribuição — férias, saída da equipe. Como o "transferir leads" do
 * Kommo ao desativar um usuário.
 */
export async function transferPortfolio(
  tenantId: string,
  actorId: string,
  fromUserId: string,
  to: string | 'distribute',
): Promise<{ ok: true; leads: number; conversations: number } | { ok: false; message: string }> {
  if (to === fromUserId) return { ok: false, message: 'Escolha outra pessoa.' };
  const db = getTenantClient(tenantId);
  const membros = await crmMemberIds(tenantId);
  if (to !== 'distribute' && !membros.has(to)) return { ok: false, message: 'Essa pessoa não usa o CRM.' };
  const regras = readDistribution((await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }))?.settings);
  const actor: Actor = { tenantId, userId: actorId };
  const destino = async () => (to === 'distribute' ? pickAssignee(tenantId, { ...regras, enabled: true }) : to);

  const leads = await db.lead.findMany({ where: { ...OPEN_LEAD, assignedToId: fromUserId }, select: { id: true }, take: 2000 });
  let nLeads = 0;
  for (const l of leads) {
    const quem = await destino();
    if (!quem || quem === fromUserId) continue;
    const r = await assignLead(db, actor, l.id, quem, 'transfer');
    if (r.ok) nLeads++;
  }
  // Conversas sem negócio aberto (pacientes) que estavam com a pessoa.
  const conversas = await db.conversation.findMany({ where: { assignedToId: fromUserId }, select: { id: true }, take: 2000 });
  let nConv = 0;
  for (const c of conversas) {
    const quem = await destino();
    if (!quem || quem === fromUserId) continue;
    await db.conversation.updateMany({ where: { id: c.id }, data: { assignedToId: quem } });
    nConv++;
  }
  // As tarefas abertas dos negócios passados vão junto, com o novo responsável.
  await prisma.$executeRaw`
    UPDATE "lead_tasks" t SET "assignedToId" = l."assignedToId"
    FROM "leads" l
    WHERE t."leadId" = l."id" AND t."tenantId" = ${tenantId} AND l."tenantId" = ${tenantId}
      AND t."assignedToId" = ${fromUserId} AND t."completedAt" IS NULL AND l."assignedToId" IS NOT NULL AND l."assignedToId" <> ${fromUserId}`;
  return { ok: true, leads: nLeads, conversations: nConv };
}

/** As preferências do CRM (Configurações › Geral e Conversas). */
export async function savePrefs(tenantId: string, p: CrmPrefs): Promise<void> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const atual = t?.settings && typeof t.settings === 'object' ? (t.settings as Record<string, unknown>) : {};
  const limpo = readCrmPrefs({ crm: p });
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ...atual, crm: { ...limpo } } } });
}
