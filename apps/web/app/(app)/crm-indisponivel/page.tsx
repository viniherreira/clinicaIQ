import Link from 'next/link';
import { KanbanSquare, Lock } from 'lucide-react';
import { prisma } from '@clinicaiq/db';
import { currentAccess } from '@/lib/guard';
import { can } from '@/lib/permissions';
import { loadCrmAddon } from '@/crm/addon';
import { formatCents } from '@/crm/format';
import { CrmTurnOnButton } from '@/components/crm-turn-on-button';

export const metadata = { title: 'CRM · ClinicaIQ' };

/**
 * Onde para quem abre /crm sem poder entrar. Dois casos:
 * - a clínica não ligou o CRM: quem cuida do plano pode experimentar ou ativar;
 * - o CRM está ligado, mas a pessoa não tem acesso: pede a quem cuida da equipe.
 */
export default async function CrmIndisponivelPage() {
  const acesso = await currentAccess();
  const addon = acesso ? await loadCrmAddon(acesso.tenantId) : null;
  const ligado = addon && addon.status !== 'off';

  if (acesso && ligado) {
    const eu = await prisma.user.findUnique({ where: { id: acesso.userId }, select: { crmSeat: true } });
    if (!eu?.crmSeat) {
      return (
        <Cartao icone={<Lock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />} titulo="Você ainda não tem acesso ao CRM">
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            O CRM está ligado na clínica, mas o acesso é liberado por pessoa.
            {can(acesso.role, 'equipe')
              ? ' Como você cuida da equipe, pode liberar o seu em Configurações → Equipe.'
              : ' Peça ao responsável da clínica para liberar o seu em Configurações → Equipe.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {can(acesso.role, 'equipe') && (
              <Link href="/configuracoes#equipe" className="btn-primary btn-md inline-flex">Abrir a Equipe</Link>
            )}
            <Link href="/dashboard" className="btn-outline btn-md inline-flex">Voltar para o início</Link>
          </div>
        </Cartao>
      );
    }
  }

  const podeContratar = can(acesso?.role, 'planos');
  const preco = formatCents(addon?.seatPriceCents ?? 3900);

  return (
    <Cartao icone={<KanbanSquare className="h-6 w-6 text-muted-foreground" aria-hidden="true" />} titulo="Conheça o CRM do ClinicaIQ">
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Acompanhe cada interessado do primeiro contato até o orçamento aprovado, com o funil andando sozinho
        conforme a recepção usa a agenda. {preco} por usuário por mês, somado à mensalidade.
        {podeContratar ? '' : ' Fale com o responsável pela clínica para ativar.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {podeContratar && (
          <CrmTurnOnButton label={addon?.trialAvailable ? 'Experimentar 14 dias grátis' : 'Ativar o CRM'} />
        )}
        <Link href="/dashboard" className="btn-outline btn-md inline-flex">Voltar para o início</Link>
      </div>
    </Cartao>
  );
}

function Cartao({ icone, titulo, children }: { icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt">{icone}</div>
        <h1 className="mt-5 text-lg font-semibold">{titulo}</h1>
        {children}
      </div>
    </div>
  );
}
