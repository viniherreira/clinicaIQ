'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Clock, SendHorizontal } from 'lucide-react';
import { approvedTemplatesAction, sendTemplateAction, type TemplateOption } from '@/app/(crm)/crm/conversas/actions';

/** O corpo do modelo com as variáveis preenchidas, para a pessoa ver o que vai sair. */
const preview = (body: string, values: string[]) => body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => values[Number(n) - 1] || `{{${n}}}`);

/**
 * Fora da janela de 24 horas (API oficial), o lugar da caixa de texto: escolher
 * um modelo aprovado, preencher as variáveis e mandar.
 */
export function TemplatePicker({
  target,
  contactName,
  onSent,
  canManage = false,
}: {
  target: { conversationId: string } | { leadId: string };
  contactName: string | null;
  onSent: (conversationId: string) => void;
  canManage?: boolean;
}) {
  const id = useId();
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [escolhido, setEscolhido] = useState('');
  const [valores, setValores] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void approvedTemplatesAction().then((r) => setTemplates(r.ok ? r.templates : []));
  }, []);

  const t = templates?.find((x) => x.id === escolhido) ?? null;
  const primeiroNome = (contactName ?? '').trim().split(/\s+/)[0] ?? '';

  return (
    <div className="border-t border-border bg-surface p-3">
      <p className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Passaram 24 horas desde a última mensagem da pessoa. Pela regra da Meta, só dá para mandar um modelo aprovado — quando ela
        responder, a conversa volta ao normal.
      </p>
      {templates === null ? (
        <p className="text-xs text-muted-foreground">Carregando modelos…</p>
      ) : templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum modelo aprovado ainda.{' '}
          {canManage ? (
            <Link href="/crm/whatsapp" className="font-medium text-primary underline underline-offset-2">
              Criar um modelo
            </Link>
          ) : (
            'Peça ao responsável pelo CRM para criar um.'
          )}
        </p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!t) return;
            setEnviando(true);
            setErro('');
            const r = await sendTemplateAction(target, t.id, valores.slice(0, t.variables));
            setEnviando(false);
            if (!r.ok) return setErro(r.message);
            setEscolhido('');
            setValores([]);
            onSent(r.conversationId);
          }}
        >
          <label htmlFor={`${id}-modelo`} className="sr-only">
            Modelo
          </label>
          <select
            id={`${id}-modelo`}
            value={escolhido}
            onChange={(e) => {
              setEscolhido(e.target.value);
              const novo = templates.find((x) => x.id === e.target.value);
              setValores(novo ? Array.from({ length: novo.variables }, (_, i) => (i === 0 ? primeiroNome : '')) : []);
            }}
            className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="">Escolha um modelo aprovado…</option>
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {t && (
            <>
              {Array.from({ length: t.variables }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <label htmlFor={`${id}-v${i}`} className="w-12 shrink-0 font-mono text-xs">{`{{${i + 1}}}`}</label>
                  <input
                    id={`${id}-v${i}`}
                    value={valores[i] ?? ''}
                    onChange={(e) => setValores((xs) => Object.assign([...xs], { [i]: e.target.value }))}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                  />
                </div>
              ))}
              <p className="whitespace-pre-wrap rounded-lg bg-surface-alt px-3 py-2 text-sm" aria-live="polite">
                {preview(t.body, valores)}
              </p>
            </>
          )}
          {erro && (
            <p role="alert" className="text-xs text-destructive">
              {erro}
            </p>
          )}
          <button type="submit" disabled={!t || enviando} className="btn-primary btn-sm">
            <SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> {enviando ? 'Enviando…' : 'Enviar modelo'}
          </button>
        </form>
      )}
    </div>
  );
}
