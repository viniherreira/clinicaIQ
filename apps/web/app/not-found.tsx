import Link from 'next/link';
import { LogoMark } from '@/components/logo';

export const metadata = { title: 'Página não encontrada · ClinicaIQ' };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <LogoMark size="lg" />
      <p className="mt-6 text-5xl font-bold tracking-tight text-primary">404</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        A página que você procura não existe ou foi movida.
      </p>
      <Link href="/dashboard" className="btn-primary btn-md mt-6">
        Voltar para o início
      </Link>
    </div>
  );
}
