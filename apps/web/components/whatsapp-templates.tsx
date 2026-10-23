'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { NewTemplateInput, TemplateRow } from '@/lib/whatsapp-templates';

type Result = { ok: true } | { ok: false; message: string };

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: 'Aprovado', cls: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' },
  PENDING: { label: 'Em análise', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' },
  REJECTED: { label: 'Recusado', cls: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
  PAUSED: { label: 'Pausado', cls: 'bg-surface-alt text-muted-foreground' },
  DISABLED: { label: 'Desativado', cls: 'bg-surface-alt text-muted-foreground' },
};
const CATEGORY_LABEL: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidade', AUTHENTICATION: 'Autenticação' };
const PURPOSE_LABEL: Record<string, string> = {
  APPOINTMENT_CREATED: 'Confirmação ao marcar',
  APPOINTMENT_REMINDER: 'Lembrete antes da consulta',
};
const BUTTON_MAX = 3;
const BUTTON_CHARS = 25;

const inputCls =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Modelos de mensagem da API oficial: os da agenda (que o sistema manda sozinho
 * para a Meta quando a clínica muda o texto) e os livres, que a clínica cria
 * aqui para o CRM, as transmissões e as automações. A mesma tela na gestão
 * (Configurações) e no CRM (Automações › Modelos); cada lado passa as ações dele.
 */
export function WhatsAppTemplates({
  templates,
  connected,
  connectHref,
  agendaHref,
  onSync,
  onCreate,
}: {
  templates: TemplateRow[];
  connected: boolean;
  /** Onde conectar a API oficial. */
  connectHref: string;
  /** Onde a clínica muda o texto e os botões dos avisos da agenda (null = sem link). */
  agendaHref: string | null;
  onSync: () => Promise<Result>;
  onCreate: (input: NewTemplateInput) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);
  const agir = (fn: () => Promise<Result>, ok: string, depois?: () => void) =>
    start(async () => {
      setErro('');
      setAviso('');
      const r = await fn();
      if (!r.ok) return setErro(r.message);
      setAviso(ok);
      depois?.();
      router.refresh();
    });

  const daAgenda = templates.filter((t) => t.purpose);
  const emUso = daAgenda.filter((t) => t.inUse);
  const anteriores = daAgenda.filter((t) => !t.inUse);
  const livres = templates.filter((t) => !t.purpose);

  return (
    <div className="space-y-4">
      {!connected && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <h2 className="font-semibold">Falta conectar a API oficial do WhatsApp</h2>
          <p className="mt-1 text-muted-foreground">
            A Meta aprova os modelos para o número da clínica. Dá para escrever o modelo agora; o envio para aprovação funciona
            depois de conectar o número em{' '}
            <Link href={connectHref} className="font-medium text-link underline-offset-2 hover:underline">
              WhatsApp
            </Link>
            .
          </p>
        </section>
      )}

      <section aria-labelledby="modelos-titulo" className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="modelos-titulo" className="mr-auto text-base font-semibold">
            Modelos do WhatsApp
          </h2>
          <button
            type="button"
            disabled={pending || !connected}
            onClick={() => agir(onSync, 'Modelos atualizados com a Meta.')}
            className="btn-outline btn-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} aria-hidden="true" /> Atualizar com a Meta
          </button>
          <button type="button" onClick={() => setNovo((v) => !v)} aria-expanded={novo} className="btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Novo modelo
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Fora das 24 horas depois da última mensagem do paciente, a API oficial só manda modelo aprovado pela Meta. A análise
          costuma levar minutos, às vezes até 24 horas.
        </p>

        {novo && (
          <NewTemplate
            pending={pending}
            onSubmit={(input) =>
              agir(() => onCreate(input), `Modelo ${input.name} enviado para a Meta aprovar.`, () => setNovo(false))
            }
          />
        )}

        {erro && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {erro}
          </p>
        )}
        <p role="status" aria-live="polite" className="mt-3 text-sm text-success empty:hidden">
          {aviso}
        </p>
      </section>

      <section aria-labelledby="modelos-agenda" className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <h3 id="modelos-agenda" className="text-sm font-semibold">
          Avisos da agenda
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Saem sozinhos quando marca e antes da consulta. Para mudar o texto ou os botões
          {agendaHref ? (
            <>
              , edite em{' '}
              <Link href={agendaHref} className="font-medium text-link underline-offset-2 hover:underline">
                WhatsApp e mensagens
              </Link>
            </>
          ) : (
            ', edite em Configurações › WhatsApp e mensagens'
          )}
          : o sistema manda a versão nova para a Meta e continua usando a aprovada até a nova ser liberada.
        </p>
        {daAgenda.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum ainda. Assim que a API oficial estiver conectada, os avisos vão para a Meta aprovar.
          </p>
        ) : (
          <>
            <TemplateList templates={emUso.length ? emUso : daAgenda.slice(0, 2)} />
            {emUso.length > 0 && anteriores.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Outras versões ({anteriores.length})
                </summary>
                <TemplateList templates={anteriores} />
              </details>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="modelos-livres" className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <h3 id="modelos-livres" className="text-sm font-semibold">
          Seus modelos
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Para retomar contato, retorno, pós-atendimento e promoções. Depois de aprovados, aparecem nas conversas do CRM, nas
          transmissões e nas automações por etapa.
        </p>
        {livres.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum ainda. Toque em Novo modelo para criar o primeiro.</p>
        ) : (
          <TemplateList templates={livres} />
        )}
      </section>
    </div>
  );
}

function TemplateList({ templates }: { templates: TemplateRow[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {templates.map((t) => {
        const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.PENDING;
        return (
          <li key={t.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{t.purpose ? PURPOSE_LABEL[t.purpose] : t.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{t.purpose ? t.name : CATEGORY_LABEL[t.category] ?? t.category}</span>
              {t.inUse && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Em uso</span>
              )}
              <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
            </div>
            <Bubble body={t.body} buttons={t.buttons} />
            {t.rejectedReason && <p className="mt-1.5 text-xs text-destructive">Motivo da Meta: {t.rejectedReason}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/** A mensagem como o paciente vê, com os botões embaixo. */
function Bubble({ body, buttons }: { body: string; buttons: string[] }) {
  return (
    <div className="mt-2 max-w-md overflow-hidden rounded-lg rounded-tl-none bg-bubble-out text-sm shadow-sm">
      <p className="whitespace-pre-wrap px-3 py-2">{body}</p>
      {buttons.length > 0 && (
        <div className="divide-y divide-border border-t border-border text-center text-sm font-medium text-primary">
          {buttons.map((b) => (
            <p key={b} className="py-1.5">
              {b}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTemplate({ pending, onSubmit }: { pending: boolean; onSubmit: (i: NewTemplateInput) => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>('UTILITY');
  const [body, setBody] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [buttons, setButtons] = useState<string[]>([]);
  const vars = Math.max(0, ...[...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])));

  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-dashed border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, category, body, examples: Array.from({ length: vars }, (_, i) => examples[i] ?? ''), buttons });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-nome`} className="block text-xs font-medium text-muted-foreground">
            Nome (minúsculas e _)
          </label>
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
          <label htmlFor={`${id}-cat`} className="block text-xs font-medium text-muted-foreground">
            Categoria
          </label>
          <select
            id={`${id}-cat`}
            value={category}
            onChange={(e) => setCategory(e.target.value as 'MARKETING' | 'UTILITY')}
            className={`${inputCls} mt-1`}
          >
            <option value="UTILITY">Utilidade (lembrete, retorno, atendimento)</option>
            <option value="MARKETING">Marketing (promoção, campanha)</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-corpo`} className="block text-xs font-medium text-muted-foreground">
          Texto: use {'{{1}}'}, {'{{2}}'}… para o que muda em cada envio (nome do paciente, data…)
        </label>
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
              <label htmlFor={`${id}-ex-${i}`} className="w-12 shrink-0 font-mono text-xs">
                <span className="sr-only">Exemplo para </span>
                {`{{${i + 1}}}`}
              </label>
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
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">
          Botões de resposta (opcional, até {BUTTON_MAX}): o paciente toca em vez de digitar
        </legend>
        {buttons.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <label htmlFor={`${id}-bt-${i}`} className="sr-only">
              Botão {i + 1}
            </label>
            <input
              id={`${id}-bt-${i}`}
              value={b}
              maxLength={BUTTON_CHARS}
              onChange={(e) => setButtons((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={['Quero agendar', 'Falar com a recepção', 'Não, obrigado'][i]}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setButtons((xs) => xs.filter((_, j) => j !== i))}
              className="btn-ghost btn-sm"
              aria-label={`Tirar o botão ${i + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
        {buttons.length < BUTTON_MAX && (
          <button type="button" onClick={() => setButtons((xs) => [...xs, ''])} className="btn-outline btn-sm">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Adicionar botão
          </button>
        )}
      </fieldset>
      {body.trim() && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Como o paciente vê</p>
          <Bubble
            body={body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n: string) => examples[Number(n) - 1] || `{{${n}}}`)}
            buttons={buttons.map((b) => b.trim()).filter(Boolean)}
          />
        </div>
      )}
      <button type="submit" disabled={pending || !name || !body.trim()} className="btn-primary btn-sm">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Enviar para a Meta aprovar
      </button>
    </form>
  );
}
