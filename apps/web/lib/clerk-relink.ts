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
 *
 * E só quando o usuário antigo **não existe mais** neste Clerk
 * (`oldUserExists`). Sem isso, qualquer conta nova com o mesmo e-mail tomava o
 * lugar de uma conta que continua valendo — por exemplo, alguém que perdeu o
 * acesso ao e-mail e o recuperou, ou um e-mail reaproveitado pelo provedor —
 * e o dono original perdia o login sem aviso. Na dúvida (erro ao consultar), a
 * resposta deve ser "existe", e nada é religado.
 */
export async function relinkByVerifiedEmail(
  clerkUserId: string,
  emails: string[],
  oldUserExists: (oldClerkUserId: string) => Promise<boolean>,
): Promise<string | null> {
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
  if (l.clerkUserId && (await oldUserExists(l.clerkUserId))) return null;
  await prisma.user.update({ where: { id: l.id }, data: { clerkUserId, previousClerkUserId: l.clerkUserId } });
  await prisma.auditLog.create({
    data: { tenantId: l.tenantId, userId: l.id, action: 'LOGIN_RELINKED', entity: 'User', entityId: l.id },
  });
  return l.tenantId;
}
