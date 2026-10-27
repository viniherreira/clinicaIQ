import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { CRM_ONLY_CLINIC_PATHS } from '@/components/module-switcher';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Layout não recebe o endereço: o middleware o põe no cabeçalho.
  const path = (await headers()).get('x-pathname') ?? '';
  return (
    <AppShell
      space="clinic"
      guard={({ clinic }) => {
        // Clínica só com o CRM: a agenda não existe para ela. Sobram as
        // Configurações (dados, equipe, plano) — o resto leva para o CRM.
        if (!clinic && !CRM_ONLY_CLINIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) redirect('/crm');
      }}
    >
      {children}
    </AppShell>
  );
}
