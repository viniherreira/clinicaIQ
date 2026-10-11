'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ShieldAlert, X } from 'lucide-react';
import { eraseLeadDataAction } from '../actions';

/**
 * "Apagar dados desta pessoa" (LGPD), no pé da ficha. Só dono e administração
 * veem. Pede a palavra APAGAR porque não tem volta.
 */
export function EraseLeadData({ leadId, leadName }: { leadId: string; leadName: string }) {
  const router = useRouter();
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [palavra, setPalavra] = useState('');
  const [erro, setErro] = useState('');
  const [pending, start] = useTransition();

  return (
    <section aria-labelledby={`${id}-titulo`} className="border-t border-border p-5">
      <h2 id={`${id}-titulo`} className="text-xs font-medium text-muted-foreground">
        Privacidade (LGPD)
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Se a pessoa pedir, apague os dados dela no CRM: nome, telefone, e-mail, notas, tarefas, conversas e arquivos.
      </p>
      <button
        type="button"
        onClick={() => {
          setPalavra('');
          setErro('');
          setAberto(true);
        }}
        className="btn-outline btn-sm mt-2 inline-flex items-center gap-1.5 text-destructive"
      >
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Apagar dados desta pessoa
      </button>

      <Dialog.Root open={aberto} onOpenChange={setAberto}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-5 shadow-2xl focus:outline-none">
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="text-base font-semibold">Apagar os dados de {leadName}?</Dialog.Title>
              <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
                <span className="sr-only">Fechar</span>
              </Dialog.Close>
            </div>
            <Dialog.Description asChild>
              <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                <p>
                  Some de vez, em <strong className="text-foreground">todos os negócios com este telefone</strong>: nome, telefone, e-mail,
                  observações, notas, tarefas, tags, as conversas do WhatsApp e os arquivos enviados.
                </p>
                <p>Negócios já fechados continuam nos números do Painel, sem identificar ninguém. A ficha de paciente, se houver, não muda.</p>
                <p className="font-medium text-destructive">Não dá para desfazer.</p>
              </div>
            </Dialog.Description>

            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await eraseLeadDataAction(leadId, palavra);
                  if (!r.ok) return setErro(r.message);
                  setAberto(false);
                  router.push('/crm');
                });
              }}
            >
              <div>
                <label htmlFor={`${id}-palavra`} className="block text-sm font-medium">
                  Para confirmar, digite APAGAR
                </label>
                <input
                  id={`${id}-palavra`}
                  value={palavra}
                  onChange={(e) => {
                    setPalavra(e.target.value);
                    setErro('');
                  }}
                  autoComplete="off"
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? `${id}-erro` : undefined}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                {erro && (
                  <p id={`${id}-erro`} role="alert" className="mt-1 text-xs text-destructive">
                    {erro}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Dialog.Close className="btn-ghost btn-md">Cancelar</Dialog.Close>
                <button
                  type="submit"
                  disabled={pending || palavra.trim().toUpperCase() !== 'APAGAR'}
                  className="btn-md inline-flex items-center rounded-lg bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                >
                  {pending ? 'Apagando…' : 'Apagar dados'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
