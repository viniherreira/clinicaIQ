import 'server-only';

import { prisma } from '@clinicaiq/db';

/**
 * Liga de novo a pessoa à sua linha na clínica quando ela entra com outro
 * usuário do Clerk e o mesmo e-mail. Acontece na troca da instância de
 * desenvolvimento do Clerk para a de produção (os usuários são outros) — sem
 * isto, a equipe inteira cairia em "crie sua clínica".
 *
 * Só com e-mail **verificado** pelo Clerk (a pessoa provou que é dona dele) e
 * só quando há exatamente uma pessoa ativa com esse e-mail. O código antigo
 * fica em `previousClerkUserId` e a troca vai para a auditoria.
 */
export async function relinkByVerifiedEmail(clerkUserId: string, emails: string[]): Promise<string | null> {
  const limpos = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (limpos.length === 0) return null;
  const linhas = await prisma.user.findMany({
    where: {
      active: true,
      OR: [{ clerkUserId: null }, { clerkUserId: { not: clerkUserId } }],
      AND: [{ OR: limpos.map((e) => ({ email: { equals: e, mode: 'insensitive' as const } })) }],
    },
    select: { id: true, tenantId: true, clerkUserId: true },
    take: 2,
  });
  if (linhas.length !== 1) return null;
  const [l] = linhas;
  await prisma.user.update({ where: { id: l.id }, data: { clerkUserId, previousClerkUserId: l.clerkUserId } });
  await prisma.auditLog.create({
    data: { tenantId: l.tenantId, userId: l.id, action: 'LOGIN_RELINKED', entity: 'User', entityId: l.id },
  });
  return l.tenantId;
}
