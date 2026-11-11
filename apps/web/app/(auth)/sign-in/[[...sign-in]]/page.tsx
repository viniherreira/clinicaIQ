import { SignIn } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';

// Fora do Google: quem procura "DreamClin" deve cair no site, não no login.
export const metadata = { title: 'Entrar', robots: { index: false, follow: true } };

export default function SignInPage() {
  return <SignIn appearance={clerkAppearance} />;
}
