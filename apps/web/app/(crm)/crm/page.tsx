import { requireCrm } from '@/crm/guard';

export const metadata = { title: 'Funil · ClinicaIQ' };

/** Provisória: o quadro do funil entra na tarefa 8 do plano. */
export default async function FunilPage() {
  await requireCrm('crm');

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Funil</h1>
      <p className="mt-2 text-sm text-muted-foreground">O quadro do funil está sendo construído.</p>
    </div>
  );
}
