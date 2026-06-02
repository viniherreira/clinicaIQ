'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCategory, updateCategory, deleteCategory } from '../actions';
import { PROCEDURE_COLORS } from './constants';

interface Category {
  id: string;
  name: string;
  color: string | null;
  isDefault: boolean;
  _count: { procedures: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  categories: Category[];
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Cor da categoria">
      <button
        type="button" onClick={() => onChange('')} aria-pressed={value === ''} aria-label="Sem cor"
        className={`flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${value === '' ? 'border-foreground ring-2 ring-foreground' : 'border-border'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </button>
      {PROCEDURE_COLORS.map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)} aria-pressed={value === c} aria-label={`Cor ${c}`}
          className={`h-6 w-6 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${value === c ? 'ring-2 ring-offset-1 ring-foreground' : ''}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function CategoryRow({ category, onChanged }: { category: Category; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateCategory(category.id, name, color);
      setEditing(false);
      onChanged();
    });
  }
  function remove() {
    startTransition(async () => {
      await deleteCategory(category.id);
      onChanged();
    });
  }

  if (editing) {
    return (
      <li className="space-y-2 rounded-md border border-border p-3">
        <input
          value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome da categoria"
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <ColorSwatches value={color} onChange={setColor} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setEditing(false); setName(category.name); setColor(category.color ?? ''); }} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Cancelar</button>
          <button type="button" disabled={isPending || name.trim().length < 2} onClick={save} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Salvar</button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
      <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ backgroundColor: category.color ?? 'transparent' }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{category.name}</p>
        <p className="text-xs text-muted-foreground">{category._count.procedures} procedimento(s){category.isDefault ? ' · padrão' : ''}</p>
      </div>
      {confirmDelete ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Excluir?</span>
          <button type="button" disabled={isPending} onClick={remove} className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-white hover:bg-destructive/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Sim</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Não</button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setEditing(true)} aria-label={`Editar ${category.name}`} className="rounded-md p-1.5 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>
          <button type="button" onClick={() => setConfirmDelete(true)} aria-label={`Excluir ${category.name}`} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
          </button>
        </div>
      )}
    </li>
  );
}

export function CategoryManager({ open, onClose, categories }: Props) {
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function refresh() {
    router.refresh();
  }

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('name', newName);
    fd.set('color', newColor);
    startTransition(async () => {
      const res = await createCategory(null, fd);
      if (res.success) {
        setNewName('');
        setNewColor('');
        refresh();
      } else {
        setError(res.errors.name?.[0] ?? 'Erro ao criar categoria');
      }
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="cat-title" className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-5 py-4">
          <h2 id="cat-title" className="text-base font-semibold">Gerenciar categorias</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1.5 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <form onSubmit={add} className="space-y-2 rounded-lg border border-border p-3">
            <label htmlFor="new-cat" className="block text-sm font-medium">Nova categoria</label>
            <div className="flex gap-2">
              <input
                id="new-cat" value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da categoria"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-invalid={error ? true : undefined} aria-describedby={error ? 'new-cat-error' : undefined}
              />
              <button type="submit" disabled={isPending || newName.trim().length < 2} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Adicionar
              </button>
            </div>
            <ColorSwatches value={newColor} onChange={setNewColor} />
            {error && <p id="new-cat-error" role="alert" className="text-xs text-destructive">{error}</p>}
          </form>

          <ul className="space-y-2">
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} onChanged={refresh} />
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
