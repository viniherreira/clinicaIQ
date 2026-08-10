import { SignUp } from '@clerk/nextjs';
import { currentUser } from '@clerk/nextjs/server';
import { clerkAppearance } from '@/lib/clerk-appearance';
import { InviteBlocked } from '../_components/invite-blocked';

export const metadata = { title: 'Criar conta' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // O Clerk pendura o convite na URL como `__clerk_ticket`.
  const bruto = params.__clerk_ticket;
  const ticket = typeof bruto === 'string' ? bruto : null;

  if (ticket) {
    const eu = await currentUser();
    if (eu) {
      const quem =
        eu.primaryEmailAddress?.emailAddress ||
        eu.emailAddresses[0]?.emailAddress ||
        `${eu.firstName ?? ''} ${eu.lastName ?? ''}`.trim() ||
        'outra conta';
      return <InviteBlocked ticket={ticket} quem={quem} />;
    }
  }

  return <SignUp appearance={clerkAppearance} />;
}
