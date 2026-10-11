import { AppShell } from '@/components/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell space="clinic">{children}</AppShell>;
}
