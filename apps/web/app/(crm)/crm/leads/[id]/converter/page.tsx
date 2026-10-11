import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCrm } from '@/crm/guard';
import { decryptPhone } from '@/crm/phone';
import { PatientForm } from '@/app/(app)/pacientes/_components/patient-form';
import { linkAfterCreateAction, type ConvertIntent } from '../actions';

export const metadata = { title: 'Converter em paciente · ClinicaIQ' };

/**
 * Cadastro de paciente a partir de um lead: o formulário de sempre, já com
 * nome, telefone e e-mail. O aceite da LGPD continua sendo pedido ali — é
 * agora que a pessoa vira paciente. Depois de salvar, o lead fica ligado à
 * ficha e, se veio de "Agendar avaliação", a agenda abre com ela escolhida.
 */
export default async function ConverterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ depois?: string }>;
}) {
  const ctx = await requireCrm('crm');
  const { id } = await params;
  const intent: ConvertIntent = (await searchParams).depois === 'agendar' ? 'agendar' : 'ficha';

  const lead = await ctx.db.lead.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, email: true, phoneEncrypted: true, patientId: true },
  });
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link href={`/crm/leads/${lead.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao lead
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">Converter em paciente</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {intent === 'agendar'
          ? 'Complete o cadastro. Ao salvar, a agenda abre com o paciente já escolhido.'
          : 'Complete o cadastro. Ao salvar, o lead fica ligado à ficha do paciente.'}
      </p>
      <div className="mt-6">
        <PatientForm
          patient={{ name: lead.name, phone: decryptPhone(lead.phoneEncrypted, ctx.tenantId), email: lead.email ?? undefined }}
          afterCreate={linkAfterCreateAction.bind(null, lead.id, intent)}
        />
      </div>
    </div>
  );
}
