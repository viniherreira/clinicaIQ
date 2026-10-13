'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { DEFAULT_RECEIPT_METHODS, MAX_RECEIPT_METHODS } from '@/lib/payment-methods';
import { updateReceiptMethods } from '../rules-actions';

/** As formas de recebimento que aparecem ao lançar um pagamento (ficha do paciente e orçamento). */
export function PaymentMethodsPanel({ methods }: { methods: string[] }) {
  const id = useId();
  const router = useRouter();
  const [lista, setLista] = useState(methods);
  const [nova, setNova] = useState('');
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const mexe = (l: string[]) => {
    setLista(l);
    setAviso(null);
  };
  const troca = (i: number, j: number) => {
    const l = [...lista];
    [l[i], l[j]] = [l[j], l[i]];
    mexe(l);
  };
  const adiciona = () => {
    const t = nova.trim();
    if (!t || lista.some((m) => m.toLowerCase() === t.toLowerCase())) return;
    mexe([...lista, t]);
    setNova('');
  };

  return (
    <section aria-labelledby={`${id}-t`} className="rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 id={`${id}-t`} className="text-base font-semibold">Formas de recebimento</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          O que aparece em “Forma” ao lançar um pagamento na ficha do paciente ou no orçamento. Pagamentos antigos não mudam.
        </p>
      </div>
      <div className="space-y-4 p-5">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {lista.map((m, i) => (
            <li key={m} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1">{m}</span>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => troca(i, i - 1)}
                aria-label={`Subir ${m}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={i === lista.length - 1}
                onClick={() => troca(i, i + 1)}
                aria-label={`Descer ${m}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={lista.length === 1}
                onClick={() => mexe(lista.filter((x) => x !== m))}
                aria-label={`Tirar ${m}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-destructive disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        {lista.length < MAX_RECEIPT_METHODS && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1 space-y-1.5 sm:max-w-sm">
              <label htmlFor={`${id}-nova`} className="text-sm font-medium">Nova forma</label>
              <input
                id={`${id}-nova`}
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    adiciona();
                  }
                }}
                maxLength={40}
                placeholder="Ex.: Convênio Odonto, Crediário"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </div>
            <button type="button" onClick={adiciona} disabled={!nova.trim()} className="btn-outline btn-md">
              <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateReceiptMethods(lista);
                setAviso(r.ok ? { ok: true, texto: 'Formas salvas.' } : { ok: false, texto: r.message });
                if (r.ok) router.refresh();
              })
            }
            className="btn-primary btn-md"
          >
            {pending ? 'Salvando…' : 'Salvar formas'}
          </button>
          <button type="button" onClick={() => mexe(DEFAULT_RECEIPT_METHODS)} className="btn-ghost btn-md">
            Voltar ao padrão
          </button>
          <span role="status" aria-live="polite" className={`text-sm ${aviso?.ok === false ? 'text-destructive' : 'text-success'}`}>
            {aviso?.texto}
          </span>
        </div>
      </div>
    </section>
  );
}
