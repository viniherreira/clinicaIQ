'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus, RefreshCw } from 'lucide-react';
import { createTemplateAction, syncTemplatesAction } from '../../../whatsapp/actions';

type Result = { ok: true } | { ok: false; message: string };

export interface Template {
  id: string;
  name: string;
  category: string;
  status: string;
  body: string;
  rejectedReason: string | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: 'Aprovado', cls: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' },
  PENDING: { label: 'Em análise', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' },
  REJECTED: { label: 'Recusado', cls: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
  PAUSED: { label: 'Pausado', cls: 'bg-surface-alt text-muted-foreground' },
  DISABLED: { label: 'Desativado', cls: 'bg-surface-alt text-muted-foreground' },
};
const CATEGORY_LABEL: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidade', AUTHENTICATION: 'Autenticação' };

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Modelos de mensagem da API oficial (Automações › Modelos): criar, mandar
 * para a Meta aprovar e acompanhar. Sem a API oficial ligada, só explica.
 */
export function TemplatesManager({ templates, connected }: { templates: Template[]; connected: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const agir = (fn: () => Promise<Result>, ok: string) =>
    start(async () => {
      setErro('');
      const r = await fn();
      if (!r.ok) return setErro(r.message);
      setAviso(ok);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {!connected && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <h2 className="font-semibold">Falta conectar a API oficial do WhatsApp</h2>
          <p className="mt-1 text-muted-foreground">
            A Meta aprova os modelos para o número da clínica. Dá para escrever o modelo agora; o envio para aprovação funciona
            depois de conectar o número em{' '}
            <Link href="/crm/whatsapp" className="font-medium text-link underline-offset-2 hover:underline">WhatsApp</Link>.
          </p>
        </section>
      )}
      <Templates templates={templates} pending={pending} agir={agir} />
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {aviso}
      </p>
    </div>
  );
}

// ─── Modelos ─────────────────────────────────────────────────────────────────

function Templates({
  templates,
  pending,
  agir,
}: {
  templates: Template[];
  pending: boolean;
  agir: (fn: () => Promise<Result>, ok: string) => void;
}) {
  const [novo, setNovo] = useState(false);
  return (
    <section aria-labelledby="wa-modelos" className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="wa-modelos" className="mr-auto text-sm font-semibold">Modelos de mensagem</h2>
        <button type="button" disabled={pending} onClick={() => agir(syncTemplatesAction, 'Modelos atualizados com a Meta.')} className="btn-outline btn-sm">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Sincronizar com a Meta
        </button>
        <button type="button" onClick={() => setNovo((v) => !v)} aria-expanded={novo} className="btn-primary btn-sm">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Novo modelo
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Fora das 24 horas, a API oficial só manda modelos aprovados. A Meta costuma analisar em minutos, às vezes em até 24 horas.
      </p>
      {novo && <NewTemplate pending={pending} onSubmit={(input) => agir(() => createTemplateAction(input), `Modelo ${input.name} enviado para a Meta.`)} />}
      {templates.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum modelo ainda. Crie um ou sincronize com a Meta.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {templates.map((t) => {
            const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.PENDING;
            return (
              <li key={t.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{CATEGORY_LABEL[t.category] ?? t.category}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">{t.body}</p>
                {t.rejectedReason && <p className="mt-1 text-xs text-destructive">Motivo: {t.rejectedReason}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function NewTemplate({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (i: { name: string; category: 'MARKETING' | 'UTILITY'; body: string; examples: string[] }) => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>('UTILITY');
  const [body, setBody] = useState('');
  const vars = Math.max(0, ...[...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])));
  const [examples, setExamples] = useState<string[]>([]);

  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, category, body, examples: Array.from({ length: vars }, (_, i) => examples[i] ?? '') });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">Nome (minúsculas e _)</label>
          <input
            id={`${id}-nome`}
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            placeholder="retomar_contato"
            maxLength={60}
            className={`${inputCls} mt-1 font-mono`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-cat`} className="block text-xs font-medium text-muted-foreground">Categoria</label>
          <select id={`${id}-cat`} value={category} onChange={(e) => setCategory(e.target.value as 'MARKETING' | 'UTILITY')} className={`${inputCls} mt-1`}>
            <option value="UTILITY">Utilidade (lembrete, retorno de atendimento)</option>
            <option value="MARKETING">Marketing (promoção, campanha)</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-corpo`} className="block text-xs font-medium text-muted-foreground">Texto: use {'{{1}}'}, {'{{2}}'}… para as variáveis</label>
        <textarea
          id={`${id}-corpo`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={1024}
          placeholder="Oi {{1}}, tudo bem? Ficou alguma dúvida sobre a sua avaliação? Responda esta mensagem que a gente te ajuda."
          className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>
      {vars > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">Exemplo de cada variável (a Meta pede para analisar)</legend>
          {Array.from({ length: vars }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <label htmlFor={`${id}-ex-${i}`} className="w-12 shrink-0 font-mono text-xs">{`{{${i + 1}}}`}</label>
              <input
                id={`${id}-ex-${i}`}
                value={examples[i] ?? ''}
                onChange={(e) => setExamples((xs) => Object.assign([...xs], { [i]: e.target.value }))}
                placeholder={i === 0 ? 'Ana' : ''}
                className={inputCls}
              />
            </div>
          ))}
        </fieldset>
      )}
      {body.trim() && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Prévia</p>
          <div className="mt-1 max-w-sm rounded-lg rounded-tl-none bg-bubble-out px-3 py-2 text-sm shadow-sm">
            <p className="whitespace-pre-wrap">
              {body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => examples[Number(n) - 1] || `{{${n}}}`)}
            </p>
          </div>
        </div>
      )}
      <button type="submit" disabled={pending || !name || !body.trim()} className="btn-primary btn-sm">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Enviar para aprovação
      </button>
    </form>
  );
}
