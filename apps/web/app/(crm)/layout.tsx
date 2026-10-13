import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { CrmTheme, CRM_THEME_SCRIPT } from '@/components/crm-theme';
import { CrmTrialBanner } from '@/components/crm-trial-banner';
import { CRM_NOT_CONTRACTED_PATH } from '@/crm/guard';
import { can } from '@/lib/permissions';

/**
 * O espaço do CRM: mesma moldura do sistema, com o menu do CRM.
 *
 * Barrar aqui é para a pessoa não ver um menu que não vai funcionar. A trava de
 * verdade está em cada página e action (`requireCrm` / `guardCrmAction`):
 * layout não protege server action.
 */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      space="crm"
      guard={({ role, crm, seat }) => {
        if (!crm) redirect(CRM_NOT_CONTRACTED_PATH);
        if (!can(role, 'crm')) redirect('/sem-acesso?modulo=crm');
        if (!seat) redirect(CRM_NOT_CONTRACTED_PATH);
      }}
    >
      {/* Escuro antes de pintar; o CrmTheme mantém e desfaz ao sair. */}
      <script dangerouslySetInnerHTML={{ __html: CRM_THEME_SCRIPT }} />
      <CrmTheme />
      <CrmTrialBanner />
      {children}
    </AppShell>
  );
}
