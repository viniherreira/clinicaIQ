'use client';

import { useId, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import type { FieldDef } from '@/crm/custom-fields';
import type { BoardPerson, BoardPipeline, BoardTag, LostReasonOption } from '@/crm/types';
import { bulkLeadsAction } from '../actions';

export interface BulkData {
  pipelines: BoardPipeline[];
  team: BoardPerson[];
  tags: BoardTag[];
  lostReasons: LostReasonOption[];
  fields: FieldDef[];
  canDelete: boolean;
}

type Tipo = 'move' | 'assign' | 'addTag' | 'removeTag' | 'task' | 'field' | 'lose' | 'delete';

const ACOES: { tipo: Tipo; label: string }[] = [
  { tipo: 'move', label: 'Mover para a etapa' },
  { tipo: 'assign', label: 'Trocar o responsável' },
  { tipo: 'addTag', label: 'Pôr tag' },
  { tipo: 'removeTag', label: 'Tirar tag' },
  { tipo: 'task', label: 'Criar tarefa' },
  { tipo: 'field', label: 'Preencher campo' },
  { tipo: 'lose', label: 'Marcar como perdido' },
  { tipo: 'delete', label: 'Excluir' },
];

const ctl =
  'h-9 rounded-lg border border-border bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Amanhã às 9h, no relógio do navegador (o servidor lê como hora da clínica). */
function amanha9h() {
  const d = new Date(Date.now() + 24 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`;
}

/**
 * A barra que aparece com leads marcados, como no Kommo: escolhe a ação,
 * completa o que ela pede e aplica em todos de uma vez.
 */
export function BulkBar({
  count,
  target,
  data,
  onDone,
  onClear,
}: {
  count: number;
  /** Marcados na tela, ou todos os da busca (os parâmetros da URL). */
  target: { ids: string[] } | { search: Record<string, string> };
  data: BulkData;
  onDone: (message: string) => void;
  onClear: () => void;
}) {
  const id = useId();
  const [tipo, setTipo] = useState<Tipo | ''>('');
  const [stageId, setStageId] = useState('');
  const [automacoes, setAutomacoes] = useState(false);
  const [userId, setUserId] = useState('');
  const [tagId, setTagId] = useState('');
  const [texto, setTexto] = useState('');
  const [quando, setQuando] = useState(amanha9h);
  const [quem, setQuem] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();
  const campo = data.fields.find((f) => f.id === fieldId);
  const acoes = ACOES.filter((a) => a.tipo !== 'delete' || data.canDelete);

  const aplicar = () => {
    setErro('');
    let action: Parameters<typeof bulkLeadsAction>[0]['action'];
    switch (tipo) {
      case 'move':
        if (!stageId) return setErro('Escolha a etapa.');
        action = { type: 'move', stageId, runAutomations: automacoes };
        break;
      case 'assign':
        action = { type: 'assign', userId: userId || null };
        break;
      case 'addTag':
      case 'removeTag':
        if (!tagId) return setErro('Escolha a tag.');
        action = { type: tipo, tagId };
        break;
      case 'task':
        if (!texto.trim()) return setErro('Escreva a tarefa.');
        action = { type: 'task', text: texto, dueLocal: quando, assignedToId: quem || null };
        break;
      case 'field':
        if (!campo) return setErro('Escolha o campo.');
        action = { type: 'field', fieldId: campo.id, value: valor };
        break;
      case 'lose':
        if (!motivo) return setErro('Escolha o motivo da perda.');
        action = { type: 'lose', lostReasonId: motivo };
        break;
      case 'delete':
        if (!window.confirm(`Excluir ${count} ${count === 1 ? 'lead' : 'leads'}? Eles saem do funil e da lista.`)) return;
        action = { type: 'delete' };
        break;
      default:
        return setErro('Escolha o que fazer.');
    }
    start(async () => {
      const r = await bulkLeadsAction({ target, action });
      if (!r.ok) return setErro(r.message);
      setTipo('');
      onDone(r.message);
    });
  };

  return (
    <section
      aria-label="Ações nos leads marcados"
      className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-link/50 bg-surface px-3 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
    >
      <p className="text-sm font-medium">
        {count.toLocaleString('pt-BR')} {count === 1 ? 'marcado' : 'marcados'}
      </p>
      <label htmlFor={`${id}-acao`} className="sr-only">Ação</label>
      <select id={`${id}-acao`} value={tipo} onChange={(e) => { setTipo(e.target.value as Tipo); setErro(''); }} className={ctl}>
        <option value="">O que fazer…</option>
        {acoes.map((a) => (
          <option key={a.tipo} value={a.tipo}>{a.label}</option>
        ))}
      </select>

      {tipo === 'move' && (
        <>
          <label htmlFor={`${id}-etapa`} className="sr-only">Etapa</label>
          <select id={`${id}-etapa`} value={stageId} onChange={(e) => setStageId(e.target.value)} className={ctl}>
            <option value="">Etapa…</option>
            {data.pipelines.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.columns.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={automacoes} onChange={(e) => setAutomacoes(e.target.checked)} className="h-4 w-4 accent-primary" />
            Rodar as automações das etapas
          </label>
        </>
      )}
      {tipo === 'assign' && (
        <>
          <label htmlFor={`${id}-resp`} className="sr-only">Responsável</label>
          <select id={`${id}-resp`} value={userId} onChange={(e) => setUserId(e.target.value)} className={ctl}>
            <option value="">Sem responsável</option>
            {data.team.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </>
      )}
      {(tipo === 'addTag' || tipo === 'removeTag') && (
        <>
          <label htmlFor={`${id}-tag`} className="sr-only">Tag</label>
          <select id={`${id}-tag`} value={tagId} onChange={(e) => setTagId(e.target.value)} className={ctl}>
            <option value="">Tag…</option>
            {data.tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </>
      )}
      {tipo === 'task' && (
        <>
          <label htmlFor={`${id}-texto`} className="sr-only">Tarefa</label>
          <input id={`${id}-texto`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: Ligar para oferecer horário" maxLength={300} className={`${ctl} min-w-[14rem]`} />
          <label htmlFor={`${id}-quando`} className="sr-only">Prazo</label>
          <input id={`${id}-quando`} type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className={ctl} />
          <label htmlFor={`${id}-quem`} className="sr-only">Quem faz</label>
          <select id={`${id}-quem`} value={quem} onChange={(e) => setQuem(e.target.value)} className={ctl}>
            <option value="">Responsável de cada lead</option>
            {data.team.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </>
      )}
      {tipo === 'field' && (
        <>
          <label htmlFor={`${id}-campo`} className="sr-only">Campo</label>
          <select id={`${id}-campo`} value={fieldId} onChange={(e) => { setFieldId(e.target.value); setValor(''); }} className={ctl}>
            <option value="">Campo…</option>
            {data.fields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {campo && (
            <>
              <label htmlFor={`${id}-valor`} className="sr-only">Valor de {campo.name}</label>
              {campo.type === 'SELECT' || campo.type === 'BOOLEAN' ? (
                <select id={`${id}-valor`} value={valor} onChange={(e) => setValor(e.target.value)} className={ctl}>
                  <option value="">Apagar o valor</option>
                  {(campo.type === 'BOOLEAN' ? ['Sim', 'Não'] : campo.options).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${id}-valor`}
                  type={campo.type === 'DATE' ? 'date' : 'text'}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder={campo.type === 'MULTISELECT' ? 'Opções separadas por vírgula' : 'Vazio apaga o valor'}
                  className={ctl}
                />
              )}
            </>
          )}
        </>
      )}
      {tipo === 'lose' && (
        <>
          <label htmlFor={`${id}-motivo`} className="sr-only">Motivo da perda</label>
          <select id={`${id}-motivo`} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={ctl}>
            <option value="">Motivo…</option>
            {data.lostReasons.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </>
      )}

      {tipo && (
        <button type="button" onClick={aplicar} disabled={pending} className={tipo === 'delete' ? 'btn-md btn-outline text-destructive' : 'btn-primary btn-md'}>
          {pending ? 'Aplicando…' : 'Aplicar'}
        </button>
      )}
      <button type="button" onClick={onClear} className="btn-ghost btn-sm ml-auto inline-flex items-center gap-1">
        <X className="h-4 w-4" aria-hidden="true" /> Desmarcar
      </button>
      {erro && (
        <p role="alert" className="w-full text-sm text-destructive">
          {erro}
        </p>
      )}
    </section>
  );
}
