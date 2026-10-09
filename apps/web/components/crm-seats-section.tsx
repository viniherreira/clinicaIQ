import Link from 'next/link';
import { prisma } from '@clinicaiq/db';
import { currentAccess } from '@/lib/guard';
import { loadCrmAddon } from '@/crm/addon';
import { CRM_ELIGIBLE_ROLES } from '@/crm/billing';
import { formatCents } from '@/crm/format';
import { CrmSeatToggle } from './crm-addon-controls';

const PAPEL: Record<string, string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', RECEPTIONIST: 'Recepção' };

/**
 * "Acesso ao CRM" na aba Equipe: quem da equipe entra no CRM. É por pessoa
 * que o CRM é cobrado, então a chave diz quanto custa (ou que está incluído).
 */
export async function CrmSeatsSection() {
  const acesso = await currentAccess();
  if (!acesso) return null;
  const a = await loadCrmAddon(acesso.tenantId);

  if (a.status === 'off') {
    return (
      <section aria-labelledby="crm-acesso" className="rounded-xl border border-dashed border-border p-4 text-sm">
        <h2 id="crm-acesso" className="font-semibold">Acesso ao CRM</h2>
        <p className="mt-1 text-muted-foreground">
          O CRM está desligado. Ligue em <Link href="#plano" className="text-primary hover:underline">Plano</Link> para escolher quem da equipe usa.
        </p>
      </section>
    );
  }

  const pessoas = await prisma.user.findMany({
    where: { tenantId: acesso.tenantId, active: true, role: { in: [...CRM_ELIGIBLE_ROLES] } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, role: true, crmSeat: true },
  });
  const custo =
    a.status === 'trial' ? 'grátis no teste' : a.status === 'complimentary' ? 'incluído na cortesia' : `${formatCents(a.seatPriceCents)}/mês`;

  return (
    <section aria-labelledby="crm-acesso" className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h2 id="crm-acesso" className="text-sm font-semibold">Acesso ao CRM</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Quem tem a chave ligada entra no CRM{a.status === 'paid' ? ' e conta na mensalidade' : ''}. Profissionais não usam o CRM.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {pessoas.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{PAPEL[p.role] ?? p.role}</p>
            </div>
            <CrmSeatToggle userId={p.id} name={p.name} on={p.crmSeat} hint={custo} />
          </li>
        ))}
      </ul>
    </section>
  );
}
