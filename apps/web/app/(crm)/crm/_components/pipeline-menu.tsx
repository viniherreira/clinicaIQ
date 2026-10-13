'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ChevronDown, Pencil, Plus } from 'lucide-react';
import type { BoardPipeline } from '@/crm/types';
import { createPipelineAction } from '../configuracoes/actions';

/** Guarda o último funil aberto (o servidor lê ao abrir /crm sem ?funil). */
export function rememberPipeline(id: string) {
  document.cookie = `crm-funil=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * O nome do funil no canto do quadro, como no Kommo: abre a lista de funis
 * para trocar e, para quem configura, "Novo funil" e "Editar funil".
 */
export function PipelineMenu({
  pipelines,
  current,
  canConfig,
}: {
  pipelines: BoardPipeline[];
  current: BoardPipeline;
  canConfig: boolean;
}) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();
  const item =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-alt';

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="inline-flex max-w-[16rem] items-center gap-1 rounded-md px-1.5 py-1 text-sm font-bold uppercase tracking-wide hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring">
          <span className="sr-only">Funil: </span>
          <span className="truncate">{current.name}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={6} className="z-[60] min-w-60 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl">
            <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">Funis</DropdownMenu.Label>
            {pipelines.map((p) => (
              <DropdownMenu.Item
                key={p.id}
                className={item}
                onSelect={() => {
                  rememberPipeline(p.id);
                  router.push(`/crm?funil=${p.id}`);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === current.id && <Check className="h-4 w-4 text-link" aria-label="atual" />}
              </DropdownMenu.Item>
            ))}
            {canConfig && (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item asChild className={item}>
                  <Link href={`/crm?funil=${current.id}&editar=1`}>
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Editar este funil
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={item}
                  onSelect={() => {
                    setNome('');
                    setErro('');
                    setNovo(true);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Novo funil
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={novo} onOpenChange={setNovo}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl focus:outline-none">
            <Dialog.Title className="text-base font-semibold">Novo funil</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Ele nasce com Novo, Em conversa, Em negociação, Fechou e Perdeu. Depois é só editar as etapas.
            </Dialog.Description>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await createPipelineAction(nome);
                  if (!r.ok) return setErro(r.message);
                  setNovo(false);
                  rememberPipeline(r.id);
                  router.push(`/crm?funil=${r.id}&editar=1`);
                });
              }}
            >
              <label htmlFor="novo-funil-nome" className="block text-sm font-medium">Nome do funil</label>
              <input
                id="novo-funil-nome"
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={40}
                placeholder="Ex.: Harmonização, Implantes"
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? 'novo-funil-erro' : undefined}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              {erro && (
                <p id="novo-funil-erro" role="alert" className="text-sm text-destructive">
                  {erro}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Dialog.Close className="btn-ghost btn-sm">Cancelar</Dialog.Close>
                <button type="submit" disabled={pending} className="btn-primary btn-sm">
                  {pending ? 'Criando…' : 'Criar funil'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
