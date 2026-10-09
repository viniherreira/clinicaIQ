'use client';

import { useEffect, useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { LostReasonOption } from '@/crm/types';

/**
 * Perder um lead sempre pede o motivo — é o que depois mostra por que a
 * clínica perde (preço? sem resposta?). Abre ao soltar o card em "Perdido" ou
 * ao escolher "Perdido" no menu do card.
 */
export function LostReasonModal({
  open,
  leadName,
  reasons,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  leadName: string;
  reasons: LostReasonOption[];
  pending: boolean;
  onConfirm: (reasonId: string) => void;
  onCancel: () => void;
}) {
  const [escolhido, setEscolhido] = useState('');
  const [erro, setErro] = useState('');
  const grupo = useId();

  useEffect(() => {
    if (open) {
      setEscolhido('');
      setErro('');
    }
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-5 shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">Por que perdemos este lead?</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">{leadName}</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </Dialog.Close>
          </div>

          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!escolhido) {
                setErro('Escolha um motivo.');
                return;
              }
              onConfirm(escolhido);
            }}
          >
            <fieldset aria-describedby={erro ? `${grupo}-erro` : undefined}>
              <legend className="sr-only">Motivo da perda</legend>
              <div className="space-y-1.5">
                {reasons.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-surface-alt has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name={grupo}
                      value={r.id}
                      checked={escolhido === r.id}
                      onChange={() => {
                        setEscolhido(r.id);
                        setErro('');
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    {r.name}
                  </label>
                ))}
              </div>
              {erro && (
                <p id={`${grupo}-erro`} role="alert" className="mt-2 text-xs text-destructive">
                  {erro}
                </p>
              )}
            </fieldset>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onCancel} className="btn-outline btn-md">
                Cancelar
              </button>
              <button type="submit" disabled={pending} className="btn-danger btn-md">
                {pending ? 'Salvando…' : 'Marcar como perdido'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
