'use client';

import { useCallback, useEffect, useId, useState, useTransition } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { LABEL_COLORS, LABEL_COLOR_NAMES, labelClasses, type LabelColor } from '@/lib/label-colors';
import { deleteAppointmentLabel, listAppointmentLabels, saveAppointmentLabel } from '../../agenda/actions';

type Row = Awaited<ReturnType<typeof listAppointmentLabels>>[number];

/**
 * Rótulos da agenda: etiquetas coloridas para marcar horários (primeira vez,
 * atraso, débito, retorno…). Aparecem no bloco da agenda e na janela de
 * detalhes, onde a recepção escolhe.
 */
export function LabelsPanel() {
  const id = useId();
  const [rows, setRows] = useState<Row[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [editando, setEditando] = useState<{ id?: string; name: string; color: LabelColor } | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [pending, start] = useTransition();

  const carregar = useCallback(async () => {
    setRows(await listAppointmentLabels());
    setCarregado(true);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  function salvar() {
    if (!editando) return;
    start(async () => {
      setErro('');
      const r = await saveAppointmentLabel(editando);
      if (!r.ok) return setErro(r.message);
      setAviso(editando.id ? 'Rótulo atualizado.' : 'Rótulo criado.');
      setEditando(null);
      await carregar();
    });
  }

  function remover(row: Row) {
    const msg = row._count.appointments
      ? `Desligar o rótulo "${row.name}"? Ele some das opções, mas os horários que já têm continuam com ele.`
      : `Excluir o rótulo "${row.name}"?`;
    if (!confirm(msg)) return;
    start(async () => {
      const r = await deleteAppointmentLabel(row.id);
      if (!r.ok) return setErro(r.message);
      setAviso('Rótulo removido.');
      await carregar();
    });
  }

  const ativos = rows.filter((r) => r.active);

  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-titulo`} className="text-base font-semibold">
            Rótulos da agenda
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Etiquetas coloridas para marcar horários: primeira vez, atraso, débito, retorno…
          </p>
        </div>
        {!editando && (
          <button type="button" onClick={() => setEditando({ name: '', color: 'blue' })} className="btn-primary btn-sm inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Novo rótulo
          </button>
        )}
      </div>

      {editando && (
        <form
          className="mt-4 space-y-3 rounded-lg border border-border bg-surface-alt/50 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div>
            <label htmlFor={`${id}-nome`} className="block text-sm font-medium">
              Nome
            </label>
            <input
              id={`${id}-nome`}
              value={editando.name}
              maxLength={40}
              autoFocus
              onChange={(e) => setEditando({ ...editando, name: e.target.value })}
              className="mt-1 h-9 w-full max-w-sm rounded-lg border border-border bg-surface px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Cor</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {LABEL_COLORS.map((c) => (
                <label key={c} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`${id}-cor`}
                    value={c}
                    checked={editando.color === c}
                    onChange={() => setEditando({ ...editando, color: c })}
                    className="peer sr-only"
                  />
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-offset-2 peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring ${labelClasses(c).chip}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${labelClasses(c).dot}`} aria-hidden="true" />
                    {LABEL_COLOR_NAMES[c]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary btn-sm">
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditando(null);
                setErro('');
              }}
              className="btn-ghost btn-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        {!carregado ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : ativos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum rótulo ainda.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {ativos.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${labelClasses(r.color).chip}`}>{r.name}</span>
                <span className="flex-1 text-xs text-muted-foreground">
                  {r._count.appointments ? `${r._count.appointments} horário(s)` : 'Sem uso ainda'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditando({ id: r.id, name: r.name, color: r.color as LabelColor })}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={`Editar ${r.name}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => remover(r)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-red-950/40"
                  aria-label={`Remover ${r.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>
    </section>
  );
}
