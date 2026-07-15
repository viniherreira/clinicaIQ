'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { addEvolution, deleteEvolution } from '../actions';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface EvolutionItem {
  id: string;
  description: string;
  teeth: number[];
  createdAt: Date | string;
  professional: { name: string; color: string | null } | null;
}

interface Props {
  patientId: string;
  evolutions: EvolutionItem[];
  professionals: { id: string; name: string }[];
}

export function EvolutionsSection({ patientId, evolutions, professionals }: Props) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [teethText, setTeethText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function parseTeeth(text: string): number[] {
    return [...new Set(
      text
        .split(/[\s,;]+/)
        .map((t) => parseInt(t, 10))
        .filter((n) => Number.isFinite(n) && n >= 11 && n <= 85),
    )];
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addEvolution(patientId, {
        description,
        professionalId: professionalId || undefined,
        teeth: parseTeeth(teethText),
      });
      if (!res.ok) {
        setError(res.message ?? 'Não foi possível salvar.');
        return;
      }
      setDescription('');
      setTeethText('');
      router.refresh();
    });
  }

  function remove(id: string) {
    setConfirmDelete(null);
    startTransition(async () => {
      await deleteEvolution(id, patientId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* New entry */}
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="text-sm font-semibold">Nova evolução</h2>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div>
          <label htmlFor="evo-desc" className="sr-only">Descrição da evolução</label>
          <textarea
            id="evo-desc"
            rows={3}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            placeholder="O que foi feito nesta sessão? Ex: Restauração em resina no 36, anestesia infiltrativa, paciente sem intercorrências..."
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={professionalId || '__none__'} onValueChange={(v) => setProfessionalId(v === '__none__' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Profissional responsável">
              <SelectValue placeholder="Profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem profissional</SelectItem>
              {professionals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <input
            type="text"
            value={teethText}
            onChange={(e) => setTeethText(e.target.value)}
            placeholder="Dentes (ex: 36, 37)"
            aria-label="Dentes envolvidos"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-40"
          />
          <button type="submit" disabled={isPending || description.trim().length < 3} className="btn-primary btn-md sm:ml-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {isPending ? 'Salvando…' : 'Adicionar'}
          </button>
        </div>
      </form>

      {/* Timeline */}
      {evolutions.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma evolução registrada ainda. As evoluções contam a história clínica do paciente.
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Histórico de evoluções">
          {evolutions.map((e) => (
            <li key={e.id} className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {e.professional && (
                    <>
                      <span
                        className="h-4 w-1 rounded-full"
                        style={{ backgroundColor: e.professional.color ?? '#94a3b8' }}
                        aria-hidden="true"
                      />
                      <span className="font-medium text-foreground">{e.professional.name}</span>
                      <span aria-hidden="true">·</span>
                    </>
                  )}
                  <span>{new Date(e.createdAt).toLocaleString('pt-BR')}</span>
                  {e.teeth.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Dente{e.teeth.length > 1 ? 's' : ''} {e.teeth.join(', ')}</span>
                    </>
                  )}
                </div>
                {confirmDelete === e.id ? (
                  <span className="flex items-center gap-2 text-xs">
                    Excluir?
                    <button type="button" onClick={() => setConfirmDelete(null)} className="rounded border border-border px-2 py-0.5 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Não</button>
                    <button type="button" onClick={() => remove(e.id)} className="rounded bg-destructive px-2 py-0.5 font-medium text-white hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Sim</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(e.id)}
                    aria-label="Excluir evolução"
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{e.description}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
