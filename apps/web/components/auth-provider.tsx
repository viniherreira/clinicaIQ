import { ClerkProvider } from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';

/**
 * O login (Clerk) só onde ele é usado: o sistema, as telas de entrar/criar
 * conta e a configuração da clínica. O site de vendas, as páginas legais, o
 * agendamento online e o link do orçamento ficam sem os ~400 KB de JavaScript
 * do Clerk, e por isso abrem mais rápido (o Google mede isso).
 *
 * Quem lê a sessão no servidor (`auth()`, `currentUser()`) não precisa disto:
 * basta o middleware.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <>{children}</>;
  return <ClerkProvider localization={ptBR}>{children}</ClerkProvider>;
}
