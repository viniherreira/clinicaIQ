import { SignUp } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';

export const metadata = { title: 'Criar conta' };

export default function SignUpPage() {
  return <SignUp appearance={clerkAppearance} />;
}
