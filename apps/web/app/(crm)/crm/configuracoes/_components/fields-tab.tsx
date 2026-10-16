'use client';

import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { FIELD_TYPES, hasOptions, type FieldDef, type FieldType } from '@/crm/custom-fields';
import { moveFieldAction, saveFieldAction } from '../actions';

type Result = { ok: true } | { ok: false; message: string };

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40';
const tipo = (t: FieldType) => FIELD_TYPES.find((x) => x.type === t)?.label ?? t;

const novo = (): FieldDef => ({ id: '', name: '', type: 'TEXT', options: [], showOnCard: false, active: true });

/**
 * Campos personalizados do lead (como no Kommo): convênio, como conheceu,
 * data de nascimento… Aparecem na ficha, no Novo lead, nos filtros, na lista
 * e, se marcado, no card do funil.
 */
export function FieldsTab({ fields, pending, agir }: { fields: FieldDef[]; pending: boolean; agir: (fn: () => Promise<Result>, ok: string) => void }) {
  const [editando, setEditando] = useState<FieldDef | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Informações a mais sobre cada lead, do jeito da sua clínica: convênio, como conheceu, data de nascimento… Campos de lista e de
          sim/não também viram filtro no funil e na lista.
        </p>
        {!editando && (
          <button type="button" onClick={() => setEditando(novo())} className="btn-primary btn-md">
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo campo
          </button>
        )}
      </div>

      {editando && (
        <FieldForm
          key={editando.id || 'novo'}
          field={editando}
          pending={pending}
          onCancel={() => setEditando(null)}
          onSave={(input) => {
            agir(async () => {
              const r = await saveFieldAction(input);
              if (r.ok) setEditando(null);
              return r;
            }, input.id ? 'Campo salvo.' : 'Campo criado.');
          }}
        />
      )}

      <ul className="divide-y divide-border rounded-xl border border-border">
        {fields.map((f, i) => (
          <li key={f.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${f.active ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {f.name}
                <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-normal text-muted-foreground">{tipo(f.type)}</span>
                {f.showOnCard && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-normal text-link">no card</span>}
                {!f.active && <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-normal">desativado</span>}
              </p>
              {f.options.length > 0 && <p className="mt-0.5 truncate text-xs text-muted-foreground">{f.options.join(' · ')}</p>}
            </div>
            <button type="button" disabled={pending || i === 0} onClick={() => agir(() => moveFieldAction(f.id, -1), 'Ordem salva.')} aria-label={`Subir ${f.name}`} className={iconBtn}>
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" disabled={pending || i === fields.length - 1} onClick={() => agir(() => moveFieldAction(f.id, 1), 'Ordem salva.')} aria-label={`Descer ${f.name}`} className={iconBtn}>
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setEditando(f)} className="btn-outline btn-sm">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar<span className="sr-only"> o campo {f.name}</span>
            </button>
          </li>
        ))}
        {fields.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum campo ainda.</li>}
      </ul>
    </div>
  );
}

function FieldForm({
  field,
  pending,
  onCancel,
  onSave,
}: {
  field: FieldDef;
  pending: boolean;
  onCancel: () => void;
  onSave: (f: { id?: string; name: string; type: FieldType; options: string[]; showOnCard: boolean; active: boolean }) => void;
}) {
  const id = useId();
  const [name, setName] = useState(field.name);
  const [type, setType] = useState<FieldType>(field.type);
  const [opcoes, setOpcoes] = useState(field.options.join('\n'));
  const [showOnCard, setShowOnCard] = useState(field.showOnCard);
  const [active, setActive] = useState(field.active);

  return (
    <form
      aria-label={field.id ? `Editar o campo ${field.name}` : 'Novo campo'}
      className="space-y-3 rounded-xl border border-link/60 bg-background/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ id: field.id || undefined, name, type, options: opcoes.split('\n'), showOnCard, active });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">Nome do campo</label>
          <input id={`${id}-nome`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex.: Convênio" className={`${inputCls} mt-1`} />
        </div>
        <div>
          <label htmlFor={`${id}-tipo`} className="block text-xs font-medium text-muted-foreground">Tipo</label>
          <select
            id={`${id}-tipo`}
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
            disabled={Boolean(field.id)}
            aria-describedby={field.id ? `${id}-tipo-d` : undefined}
            className={`${inputCls} mt-1 disabled:opacity-60`}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.label}</option>
            ))}
          </select>
          {field.id && <p id={`${id}-tipo-d`} className="mt-1 text-xs text-muted-foreground">O tipo não muda depois de criado.</p>}
        </div>
      </div>
      {hasOptions(type) && (
        <div>
          <label htmlFor={`${id}-opcoes`} className="block text-xs font-medium text-muted-foreground">Opções (uma por linha)</label>
          <textarea id={`${id}-opcoes`} value={opcoes} onChange={(e) => setOpcoes(e.target.value)} rows={5} placeholder={'Amil\nUnimed\nParticular'} className={`${inputCls} mt-1 h-auto py-2`} />
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showOnCard} onChange={(e) => setShowOnCard(e.target.checked)} className="h-4 w-4 accent-primary" />
          Mostrar no card do funil
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-primary" />
          Ativo
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary btn-md">{pending ? 'Salvando…' : 'Salvar campo'}</button>
        <button type="button" onClick={onCancel} className="btn-ghost btn-md">Cancelar</button>
      </div>
    </form>
  );
}
