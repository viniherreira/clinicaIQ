'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, FileText, UserCheck, UserPlus } from 'lucide-react';
import { findPatientMatchAction, linkExistingPatientAction, type ConvertIntent } from '../actions';

/**
 * A ponte com a clínica. Lead que já é paciente: agendar e orçar direto.
 * Lead que ainda não é: antes de cadastrar, procura paciente com o mesmo
 * telefone — vincular é melhor do que criar uma ficha repetida.
 */
export function ConvertActions({
  leadId,
  patient,
}: {
  leadId: string;
  patient: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [achado, setAchado] = useState<{ intent: ConvertIntent; match: { id: string; name: string; controlNumber: number } } | null>(null);
  const [erro, setErro] = useState('');

  if (patient) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/agenda?novo=1&paciente=${patient.id}`} className="btn-primary btn-sm inline-flex items-center justify-center gap-1.5">
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Agendar avaliação
        </Link>
        <Link href={`/orcamentos/novo?patientId=${patient.id}`} className="btn-outline btn-sm inline-flex items-center justify-center gap-1.5">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Novo orçamento
        </Link>
      </div>
    );
  }

  function iniciar(intent: ConvertIntent) {
    setErro('');
    start(async () => {
      const r = await findPatientMatchAction(leadId);
      if (!r.ok) return setErro(r.message);
      if (r.match) return setAchado({ intent, match: r.match });
      router.push(`/crm/leads/${leadId}/converter${intent === 'agendar' ? '?depois=agendar' : ''}`);
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={pending} onClick={() => iniciar('agendar')} className="btn-primary btn-sm inline-flex items-center justify-center gap-1.5">
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Agendar avaliação
        </button>
        <button type="button" disabled={pending} onClick={() => iniciar('ficha')} className="btn-outline btn-sm inline-flex items-center justify-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Converter em paciente
        </button>
      </div>

      {achado && (
        <div role="alert" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p>
            <span className="font-medium">{achado.match.name}</span> (ficha nº {String(achado.match.controlNumber).padStart(4, '0')}) já é
            paciente com esse telefone.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await linkExistingPatientAction(leadId, achado.match.id, achado.intent);
                  if (!r.ok) return setErro(r.message);
                  setAchado(null);
                  router.push(r.href);
                  router.refresh();
                })
              }
              className="btn-primary btn-sm inline-flex items-center gap-1.5"
            >
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> Vincular a este paciente
            </button>
            <Link
              href={`/crm/leads/${leadId}/converter${achado.intent === 'agendar' ? '?depois=agendar' : ''}`}
              className="btn-ghost btn-sm"
            >
              Cadastrar outro paciente
            </Link>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
