'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { prisma } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(100),
  document: z
    .string()
    .optional()
    .transform((v) => v?.replace(/\D/g, '') || undefined)
    .refine((v) => !v || v.length === 14, { message: 'CNPJ inválido' }),
  phone: z
    .string()
    .optional()
    .transform((v) => v?.replace(/\D/g, '') || undefined),
});

function slugify(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

async function uniqueSlug(base: string) {
  let slug = base;
  let suffix = 0;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

export type OnboardingState =
  | { success: true; tenantId: string }
  | { success: false; errors: Record<string, string[]> };

/**
 * Quem foi convidado entra na clínica existente em vez de abrir uma nova.
 *
 * O e-mail é a chave, e dá para confiar nele porque quem verifica é o Clerk —
 * chegamos aqui já autenticados, com o endereço confirmado por ele. O
 * `publicMetadata` do convite viaja junto e é conferido primeiro, mas o convite
 * gravado no nosso banco é o que decide: se o metadata não vier, o convite
 * continua valendo.
 *
 * Devolve o tenant quando houve convite, ou `null` quando é gente nova abrindo
 * a própria clínica.
 */
async function acceptPendingInvite(
  clerkUserId: string,
  email: string | null,
  metadata: Record<string, unknown> | undefined,
): Promise<string | null> {
  const normalizado = email?.trim().toLowerCase() ?? '';
  const doMetadata = typeof metadata?.tenantId === 'string' ? metadata.tenantId : null;

  const convite = await prisma.invitation.findFirst({
    where: {
      status: 'PENDING',
      ...(normalizado
        ? { email: normalizado }
        : doMetadata
          ? { tenantId: doMetadata }
          : { id: '__sem_chave__' }),
      ...(doMetadata ? { tenantId: doMetadata } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, tenantId: true, role: true, email: true },
  });
  if (!convite) return null;

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const nome =
    `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() ||
    convite.email.split('@')[0];

  // Já trabalhou aqui e foi removida? Reativar a linha antiga em vez de abrir
  // outra mantém a linha do tempo inteira: as evoluções, os agendamentos e os
  // orçamentos que ela criou continuam apontando para o mesmo cadastro. Duas
  // linhas para a mesma pessoa partiriam esse histórico em dois, e ninguém
  // conseguiria remontá-lo depois.
  const anterior = await prisma.user.findFirst({
    where: {
      tenantId: convite.tenantId,
      active: false,
      email: { equals: convite.email, mode: 'insensitive' },
    },
    orderBy: { deactivatedAt: 'desc' },
    select: { id: true },
  });

  await prisma.$transaction([
    anterior
      ? prisma.user.update({
          where: { id: anterior.id },
          data: {
            clerkUserId,
            name: nome,
            role: convite.role,
            active: true,
            deactivatedAt: null,
            deactivatedById: null,
            deactivationReason: null,
          },
        })
      : prisma.user.create({
          data: {
            tenantId: convite.tenantId,
            clerkUserId,
            name: nome,
            email: convite.email,
            role: convite.role,
          },
        }),
    prisma.invitation.update({
      where: { id: convite.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        tenantId: convite.tenantId,
        action: anterior ? `INVITE_REACCEPTED_${convite.role}` : `INVITE_ACCEPTED_${convite.role}`,
        entity: 'Invitation',
        entityId: convite.email,
      },
    }),
  ]);

  await clerk.users.updateUserMetadata(clerkUserId, {
    publicMetadata: { tenantId: convite.tenantId, onboardingComplete: true },
  });

  return convite.tenantId;
}

/**
 * Já pertence a alguma clínica, ou tem convite pendente? Devolve o tenant.
 *
 * Chamado pela própria página de onboarding antes de renderizar o formulário, e
 * de novo pelo `completeOnboarding` — a segunda vez cobre quem chegou ao envio
 * por outro caminho.
 */
export async function joinFromInviteIfAny(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  // `active: true` não é detalhe: sem ele, quem foi removido da equipe ainda
  // era encontrado aqui, mandado para /dashboard, recusado pelo layout (que
  // exige acesso ativo), mandado de volta para cá — e o navegador desistia com
  // ERR_TOO_MANY_REDIRECTS em vez de dizer que o acesso acabou.
  const meu = await prisma.user.findFirst({
    where: { clerkUserId: userId, active: true },
    select: { tenantId: true, email: true },
  });
  if (meu) {
    // Já está dentro, mas pode existir um convite pendente para esta mesma
    // clínica — foi convidado e entrou por outro caminho, ou foi cadastrado à
    // mão depois. Fechar aqui evita a tela de Equipe dizer "aguardando
    // resposta" de alguém que já está trabalhando.
    await prisma.invitation.updateMany({
      where: { tenantId: meu.tenantId, email: meu.email.toLowerCase(), status: 'PENDING' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    return meu.tenantId;
  }

  const clerk = await clerkClient();
  const u = await clerk.users.getUser(userId);
  const emailPrincipal =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
    u.emailAddresses[0]?.emailAddress ??
    null;

  return acceptPendingInvite(
    userId,
    emailPrincipal,
    u.publicMetadata as Record<string, unknown> | undefined,
  );
}

/**
 * Esta conta já teve acesso a uma clínica e foi removida?
 *
 * Sem isto, quem é removido cai direto no formulário de "crie sua clínica" —
 * uma tela que não explica nada para quem só quer entender por que perdeu o
 * acesso, e que ainda por cima convida a abrir uma clínica vazia por engano.
 *
 * A busca é por `previousClerkUserId` porque a remoção libera o `clerkUserId`
 * para o e-mail poder ser reconvidado.
 */
export async function acessoEncerrado(): Promise<{ clinica: string; em: Date | null } | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const linha = await prisma.user.findFirst({
    where: { previousClerkUserId: userId, active: false },
    orderBy: { deactivatedAt: 'desc' },
    select: { deactivatedAt: true, tenant: { select: { name: true } } },
  });
  if (!linha) return null;

  return { clinica: linha.tenant.name, em: linha.deactivatedAt };
}

export async function completeOnboarding(
  _prev: OnboardingState | null,
  formData: FormData,
): Promise<OnboardingState> {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // Convidado entra na clínica que o chamou; só quem não tem convite abre uma
  // clínica nova. Vem antes de validar o formulário porque o convidado nunca
  // preencheu nome de clínica nenhum.
  const jaTem = await joinFromInviteIfAny();
  if (jaTem) return { success: true, tenantId: jaTem };

  const raw = {
    name: formData.get('name'),
    document: formData.get('document') || undefined,
    phone: formData.get('phone') || undefined,
  };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const { name, document, phone } = parsed.data;
  const slug = await uniqueSlug(slugify(name));

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);

  const tenant = await prisma.tenant.create({
    data: {
      clerkOrgId: `user_${userId}`,
      name,
      slug,
      document: document ?? null,
      phone: phone ?? null,
    },
  });

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      clerkUserId: userId,
      name:
        `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() ||
        'Proprietário',
      email: clerkUser.emailAddresses[0]?.emailAddress ?? '',
      role: 'OWNER',
    },
  });

  // Starts without access. The clinic picks a plan and pays before using the
  // system, so the subscription begins already past due rather than as a trial
  // that would have to be revoked later. `currentPeriodEnd` in the past is what
  // resolveAccess reads, so this holds even if no job ever runs.
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      tier: 'ESSENCIAL',
      status: 'SUSPENDED',
      currentPeriodEnd: new Date(),
      graceEndsAt: new Date(),
    },
  });

  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { tenantId: tenant.id, onboardingComplete: true },
  });

  return { success: true, tenantId: tenant.id };
}
