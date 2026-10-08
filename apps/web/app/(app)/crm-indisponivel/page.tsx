import Link from 'next/link';
import { KanbanSquare } from 'lucide-react';
import { currentAccess } from '@/lib/guard';
import { can } from '@/lib/permissions';

export const metadata = { title: 'CRM · ClinicaIQ' };

/**
 * Onde para quem abre /crm numa clínica que não contratou o módulo.
 *
 * Fica no espaço da clínica, e não no do CRM, de propósito: o layout do CRM
 * manda para cá justamente quando o CRM não está liberado.
 */
export default async function CrmIndisponivelPage() {
  const acesso = await currentAccess();
  const podeVerPlano = can(acesso?.role, 'planos');

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-alt">
          <KanbanSquare className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>

        <h1 className="mt-5 text-lg font-semibold">O CRM não faz parte do plano da clínica</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Com o CRM, a recepção acompanha cada interessado do primeiro contato até o
          orçamento aprovado, e o funil anda sozinho com a agenda.
          {podeVerPlano ? '' : ' Fale com o responsável pela clínica para ativar.'}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {podeVerPlano && (
            <Link href="/configuracoes#plano" className="btn-primary btn-md inline-flex">
              Ver o plano
            </Link>
          )}
          <Link href="/dashboard" className={`${podeVerPlano ? 'btn-outline' : 'btn-primary'} btn-md inline-flex`}>
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
