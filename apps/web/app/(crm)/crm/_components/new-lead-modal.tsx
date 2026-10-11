'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, UserPlus, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SOURCE_LABEL } from '@/crm/format';
import type { BoardPerson } from '@/crm/types';
import { createLeadAction, type NewLeadForm } from '../actions';

const NENHUM = '__nenhum__';
const inputCls =
  'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[invalid=true]:border-destructive';
const labelCls = 'block text-sm font-medium text-foreground';

export function NewLeadModal({
  open,
  onClose,
  onCreated,
  team,
  procedures,
  meId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
  team: BoardPerson[];
  procedures: { id: string; name: string }[];
  meId: string;
}) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    title: '',
    source: 'MANUAL',
    interestProcedureId: NENHUM,
    estimatedValue: '',
    assignedToId: meId,
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState('');
  const [duplicado, setDuplicado] = useState<{ leadId: string; name: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', phone: '', title: '', source: 'MANUAL', interestProcedureId: NENHUM, estimatedValue: '', assignedToId: meId });
    setErros({});
    setMensagem('');
    setDuplicado(null);
  }, [open, meId]);

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErros((e) => ({ ...e, [k]: '' }));
    if (k === 'phone') setDuplicado(null);
  };

  function enviar(force = false) {
    const valor = form.estimatedValue.replace(/\./g, '').replace(',', '.').trim();
    const input: NewLeadForm = {
      name: form.name,
      phone: form.phone,
      title: form.title || null,
      source: form.source as NewLeadForm['source'],
      interestProcedureId: form.interestProcedureId === NENHUM ? null : form.interestProcedureId,
      estimatedValue: valor ? Number(valor) : null,
      assignedToId: form.assignedToId === NENHUM ? null : form.assignedToId,
      force,
    };
    start(async () => {
      const r = await createLeadAction(input);
      if (r.ok) {
        onCreated(
          r.linkedPatient
            ? `Lead criado e ligado à ficha de ${r.linkedPatient}, que já é paciente.`
            : `Lead ${form.name.trim()} criado em Novo.`,
        );
        onClose();
      } else if ('duplicate' in r) {
        setDuplicado(r.duplicate);
      } else {
        setErros(r.fieldErrors ?? {});
        setMensagem(r.message);
      }
    });
  }

  const campo = (k: string) => ({
    'aria-invalid': erros[k] ? true : undefined,
    'aria-describedby': erros[k] ? `novo-lead-${k}-erro` : undefined,
  });
  const erro = (k: string) =>
    erros[k] ? (
      <p id={`novo-lead-${k}-erro`} className="text-xs text-destructive">
        {erros[k]}
      </p>
    ) : null;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl focus:outline-none">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              </span>
              <Dialog.Title className="text-base font-semibold">Novo lead</Dialog.Title>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Cadastre um interessado. Ele entra na etapa Novo do funil.</Dialog.Description>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(false);
            }}
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              {mensagem && (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                  {mensagem}
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="novo-lead-name" className={labelCls}>
                    Nome <span className="text-destructive">*</span>
                  </label>
                  <input id="novo-lead-name" value={form.name} onChange={(e) => set('name')(e.target.value)} className={inputCls} autoComplete="off" {...campo('name')} />
                  {erro('name')}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="novo-lead-phone" className={labelCls}>
                    Telefone <span className="text-destructive">*</span>
                  </label>
                  <input id="novo-lead-phone" inputMode="tel" placeholder="(11) 98765-4321" value={form.phone} onChange={(e) => set('phone')(e.target.value)} className={inputCls} autoComplete="off" {...campo('phone')} />
                  {erro('phone')}
                </div>
              </div>

              {duplicado && (
                <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    Já existe um lead aberto com esse telefone: {duplicado.name}.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/crm/leads/${duplicado.leadId}`} className="btn-outline btn-sm">
                      Abrir o lead existente
                    </Link>
                    <button type="button" onClick={() => enviar(true)} className="btn-ghost btn-sm" disabled={pending}>
                      Criar outro negócio mesmo assim
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="novo-lead-title" className={labelCls}>
                  Negócio <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
                </label>
                <input id="novo-lead-title" placeholder="Implante, clareamento…" value={form.title} onChange={(e) => set('title')(e.target.value)} className={inputCls} {...campo('title')} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span id="novo-lead-interest-label" className={labelCls}>Interesse</span>
                  <Select value={form.interestProcedureId} onValueChange={set('interestProcedureId')}>
                    <SelectTrigger aria-labelledby="novo-lead-interest-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NENHUM}>Não definido</SelectItem>
                      {procedures.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="novo-lead-value" className={labelCls}>Valor estimado (R$)</label>
                  <input id="novo-lead-value" inputMode="decimal" placeholder="0" value={form.estimatedValue} onChange={(e) => set('estimatedValue')(e.target.value.replace(/[^\d.,]/g, ''))} className={inputCls} {...campo('estimatedValue')} />
                  {erro('estimatedValue')}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <span id="novo-lead-source-label" className={labelCls}>Origem</span>
                  <Select value={form.source} onValueChange={set('source')}>
                    <SelectTrigger aria-labelledby="novo-lead-source-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SOURCE_LABEL).map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <span id="novo-lead-assignee-label" className={labelCls}>Responsável</span>
                  <Select value={form.assignedToId} onValueChange={set('assignedToId')}>
                    <SelectTrigger aria-labelledby="novo-lead-assignee-label">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NENHUM}>Sem responsável</SelectItem>
                      {team.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border bg-surface-alt/50 px-5 py-4">
              <button type="button" onClick={onClose} className="btn-outline btn-md">
                Cancelar
              </button>
              <button type="submit" disabled={pending} className="btn-primary btn-md">
                {pending ? 'Salvando…' : 'Criar lead'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
