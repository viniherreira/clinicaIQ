import { AuthProvider } from '@/components/auth-provider';

/** A configuração da clínica usa o Clerk no navegador (sair da conta). */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
