'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { LeadDetail } from '@/crm/lead-detail';
import type { BoardPerson, BoardPipeline, BoardTag, LostReasonOption } from '@/crm/types';
import { LeadPanel } from '../../leads/[id]/_components/lead-panel';
import type { FieldDef } from '@/crm/custom-fields';
import { leadDetailAction } from '../actions';

export interface LeadSideBasics {
  pipelines: BoardPipeline[];
  tags: BoardTag[];
  team: BoardPerson[];
  procedures: { id: string; name: string }[];
  lostReasons: LostReasonOption[];
  fields?: FieldDef[];
}

/**
 * O lead da conversa aberta, à direita, como no Kommo: mudar a etapa, o
 * responsável, o valor ou as tags sem sair da conversa. É o mesmo painel da
 * ficha; só aparece em tela larga (nas menores, o atalho do cabeçalho leva à ficha).
 */
export function LeadSide({ leadId, basics, onChanged }: { leadId: string; basics: LeadSideBasics; onChanged: () => void }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const r = await leadDetailAction(leadId);
    if (!r.ok) return setErro(r.message);
    setErro('');
    setLead(r.lead);
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="hidden min-h-0 overflow-y-auto border-l border-border bg-surface xl:block">
      {lead ? (
        <LeadPanel
          lead={lead}
          pipelines={basics.pipelines}
          allTags={basics.tags}
          team={basics.team}
          procedures={basics.procedures}
          lostReasons={basics.lostReasons}
          fields={basics.fields}
          onSaved={() => {
            void carregar();
            onChanged();
          }}
          actions={
            <Link href={`/crm/leads/${lead.id}`} className="btn-outline btn-sm inline-flex w-full items-center justify-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Abrir a ficha completa
            </Link>
          }
        />
      ) : (
        <p className="p-5 text-sm text-muted-foreground">{erro || 'Carregando o lead…'}</p>
      )}
    </div>
  );
}
