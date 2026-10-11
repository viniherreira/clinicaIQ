import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { capabilityDeniedMessage, type Capability } from '@/lib/permissions';

export const metadata = { title: 'Sem acesso · ClinicaIQ' };

const MODULOS: Record<string, Capability> = {
  agenda: 'agenda',
  pacientes: 'pacientes',
  prontuario: 'prontuario',
  financeiro: 'financeiro',
  configuracoes: 'configuracoes',
  campanhas: 'campanhas',
  equipe: 'equipe',
  planos: 'planos',
  privacidade: 'privacidade',
  crm: 'crm',
  crm_config: 'crm_config',
};

/**
 * Onde para quem tentou abrir um módulo que o perfil dela não alcança.
 *
 * Existe para o bloqueio ter cara de decisão, não de defeito: quem cai no
 * dashboard sem explicação acha que o clique não funcionou e tenta de novo.
 */
export default async function SemAcessoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const bruto = typeof params.modulo === 'string' ? params.modulo : '';
  const capability = MODULOS[bruto];

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt">
          <ShieldOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>

        <h1 className="mt-5 text-lg font-semibold">Esta parte não é do seu perfil</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {capability
            ? capabilityDeniedMessage(capability)
            : 'Seu perfil não tem acesso a esta parte do sistema. Fale com o responsável pela clínica.'}
        </p>

        <Link href="/dashboard" className="btn-primary btn-md mt-6 inline-flex">
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}
