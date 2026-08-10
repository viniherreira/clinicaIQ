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

  await prisma.$transaction([
    prisma.user.create({
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
        action: `INVITE_ACCEPTED_${convite.role}`,
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

  const meu = await prisma.user.findFirst({
    where: { clerkUserId: userId },
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
