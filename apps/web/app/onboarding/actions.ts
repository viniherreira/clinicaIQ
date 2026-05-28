'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { prisma } from '@odontoflow/db';
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

export async function completeOnboarding(
  _prev: OnboardingState | null,
  formData: FormData,
): Promise<OnboardingState> {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const existing = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
  });
  if (existing) return { success: true, tenantId: existing.id };

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

  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { tenantId: tenant.id, onboardingComplete: true },
  });

  return { success: true, tenantId: tenant.id };
}
