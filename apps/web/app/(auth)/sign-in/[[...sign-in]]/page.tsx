import { SignIn } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';

export const metadata = { title: 'Entrar' };

export default function SignInPage() {
  return <SignIn appearance={clerkAppearance} />;
}
