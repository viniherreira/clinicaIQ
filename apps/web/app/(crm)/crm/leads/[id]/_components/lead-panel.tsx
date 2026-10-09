'use client';

import { useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Eye, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { colorClasses } from '@/crm/colors';
import { formatCents, formatWallDateTime, SOURCE_LABEL, timeAgo } from '@/crm/format';
import type { LeadDetail } from '@/crm/lead-detail';
import type { BoardPerson, BoardStage, BoardTag, LostReasonOption } from '@/crm/types';
import { moveLeadAction } from '../../../actions';
import { LostReasonModal } from '../../../_components/lost-reason-modal';
import { createTagAction, revealPhoneAction, setLeadTagsAction, updateLeadAction } from '../actions';

/**
 * A metade esquerda da ficha: quem é, em que etapa está e o que fazer.
 * Cada dado se edita no próprio lugar — clicar, mudar, Enter (ou sair do
 * campo) salva, Esc desiste.
 */
export function LeadPanel({
  lead,
  stages,
  closedStages,
  allTags,
  team,
  procedures,
  lostReasons,
  actions,
}: {
  lead: LeadDetail;
  stages: BoardStage[];
  closedStages: { won: string; lost: string };
  allTags: BoardTag[];
  team: BoardPerson[];
  procedures: { id: string; name: string }[];
  lostReasons: LostReasonOption[];
  /** Botões de conversão/agendamento, montados pela página. */
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState('');
  const [perder, setPerder] = useState(false);
  const fechado = Boolean(lead.wonAt || lead.lostAt);
  const indice = stages.findIndex((s) => s.id === lead.stageId);

  function salvar(patch: Parameters<typeof updateLeadAction>[1], msg: string) {
    start(async () => {
      const r = await updateLeadAction(lead.id, patch);
      setAviso(r.ok ? msg : r.message);
      if (r.ok) router.refresh();
    });
  }

  function mover(stageId: string, lostReasonId?: string, msg?: string) {
    start(async () => {
      const r = await moveLeadAction({ leadId: lead.id, stageId, lostReasonId });
      setAviso(r.ok ? msg ?? `Movido para ${stages.find((s) => s.id === stageId)?.name ?? 'a etapa escolhida'}.` : r.message);
      if (r.ok) router.refresh();
    });
  }

  return (
    <aside aria-label="Dados do lead" className="space-y-5 border-b border-border bg-surface p-5 lg:border-b-0 lg:border-r">
      <div>
        <InlineText
          label="Negócio"
          value={lead.title ?? ''}
          placeholder="Dar um nome ao negócio"
          display={<h1 className="text-lg font-semibold leading-tight">{lead.title || lead.name}</h1>}
          onSave={(v) => salvar({ title: v || null }, 'Nome do negócio salvo.')}
        />
        {lead.title && <p className="mt-0.5 text-sm text-muted-foreground">{lead.name}</p>}
        <TagEditor leadId={lead.id} tags={lead.tags} allTags={allTags} onDone={(m) => setAviso(m)} />
      </div>

      {/* Situação e etapa */}
      {fechado ? (
        <div
          className={`rounded-lg border p-3 text-sm ${lead.wonAt ? 'border-green-500/40 bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200' : 'border-red-500/40 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'}`}
        >
          <p className="font-medium">{lead.wonAt ? 'Negócio fechado' : `Perdido${lead.lostReason ? `: ${lead.lostReason}` : ''}`}</p>
          <button type="button" onClick={() => mover(stages[0].id, undefined, 'Lead reaberto.')} disabled={pending} className="btn-outline btn-sm mt-2 inline-flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reabrir
          </button>
        </div>
      ) : (
        <div>
          <div className="flex gap-1" aria-hidden="true">
            {stages.map((s, i) => (
              <span key={s.id} className={`h-1.5 flex-1 rounded-full ${i <= indice ? colorClasses(s.color).dot : 'bg-border'}`} />
            ))}
          </div>
          <label htmlFor="lead-etapa" className="mt-3 block text-xs font-medium text-muted-foreground">
            Etapa <span className="font-normal">· {timeAgo(new Date(lead.stageEnteredAt))}</span>
          </label>
          <select
            id="lead-etapa"
            value={lead.stageId}
            disabled={pending}
            onChange={(e) => mover(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={pending} onClick={() => mover(closedStages.won, undefined, 'Negócio fechado.')} className="btn-outline btn-sm inline-flex items-center justify-center gap-1.5 text-green-700 dark:text-green-300">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Ganho
            </button>
            <button type="button" disabled={pending} onClick={() => setPerder(true)} className="btn-outline btn-sm inline-flex items-center justify-center gap-1.5 text-destructive">
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Perdido
            </button>
          </div>
        </div>
      )}

      {actions}

      <dl className="space-y-3 text-sm">
        <Field label="Responsável">
          <InlineSelect
            label="Responsável"
            value={lead.assignedToId ?? ''}
            options={[{ value: '', label: 'Sem responsável' }, ...team.map((p) => ({ value: p.id, label: p.name }))]}
            onSave={(v) => salvar({ assignedToId: v || null }, 'Responsável alterado.')}
          />
        </Field>
        <Field label="Valor estimado">
          <InlineText
            label="Valor estimado"
            value={lead.valueCents != null ? String(lead.valueCents / 100) : ''}
            placeholder="Informar valor"
            inputMode="decimal"
            display={lead.valueCents != null ? formatCents(lead.valueCents) : undefined}
            onSave={(v) => {
              const n = v ? Number(v.replace(/\./g, '').replace(',', '.')) : null;
              if (n !== null && Number.isNaN(n)) return setAviso('Valor inválido.');
              salvar({ estimatedValue: n }, 'Valor salvo.');
            }}
          />
        </Field>
        {lead.nextAppointment && (
          <Field label="Próxima avaliação">
            {formatWallDateTime(new Date(lead.nextAppointment.startTime))} · {lead.nextAppointment.professionalName}
          </Field>
        )}
        {lead.openQuote && (
          <Field label="Orçamento em aberto">
            <Link href={`/orcamentos/${lead.openQuote.id}`} className="text-primary underline-offset-2 hover:underline">
              Nº {lead.openQuote.number} · {formatCents(lead.openQuote.totalCents)}
            </Link>
          </Field>
        )}
        <Field label="Interesse">
          <InlineSelect
            label="Interesse"
            value={lead.interestProcedureId ?? ''}
            options={[{ value: '', label: 'Não definido' }, ...procedures.map((p) => ({ value: p.id, label: p.name }))]}
            onSave={(v) => salvar({ interestProcedureId: v || null }, 'Interesse salvo.')}
          />
        </Field>
        <Field label="Telefone">
          <PhoneField leadId={lead.id} masked={lead.phoneMasked} />
        </Field>
        <Field label="E-mail">
          <InlineText label="E-mail" value={lead.email ?? ''} placeholder="Informar e-mail" inputMode="email" onSave={(v) => salvar({ email: v || null }, 'E-mail salvo.')} />
        </Field>
        <Field label="Origem">
          <InlineSelect
            label="Origem"
            value={lead.source}
            options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))}
            onSave={(v) => salvar({ source: v as 'MANUAL' }, 'Origem salva.')}
          />
        </Field>
        <Field label="Paciente">
          {lead.patient ? (
            <Link href={`/pacientes/${lead.patient.id}`} className="text-primary underline-offset-2 hover:underline">
              {lead.patient.name} · ficha nº {String(lead.patient.controlNumber).padStart(4, '0')}
            </Link>
          ) : (
            <span className="text-muted-foreground">Ainda não é paciente</span>
          )}
        </Field>
      </dl>

      {lead.otherDeals.length > 0 && (
        <section aria-labelledby="outros-negocios">
          <h2 id="outros-negocios" className="text-xs font-medium text-muted-foreground">Outros negócios desta pessoa</h2>
          <ul className="mt-1.5 space-y-1">
            {lead.otherDeals.map((o) => (
              <li key={o.id}>
                <Link href={`/crm/leads/${o.id}`} className="flex justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-alt">
                  <span className="truncate">{o.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{o.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LostReasonModal
        open={perder}
        leadName={lead.name}
        reasons={lostReasons}
        pending={pending}
        onCancel={() => setPerder(false)}
        onConfirm={(reasonId) => {
          setPerder(false);
          mover(closedStages.lost, reasonId, 'Marcado como perdido.');
        }}
      />
      <p role="status" aria-live="polite" className="sr-only">{aviso}</p>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

const editBtn =
  'group inline-flex max-w-full items-center gap-1.5 rounded-md text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function InlineText({
  label,
  value,
  placeholder,
  display,
  inputMode,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  display?: React.ReactNode;
  inputMode?: 'text' | 'decimal' | 'email';
  onSave: (v: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(value);
  const cancelou = useRef(false);

  if (!editando) {
    return (
      <button type="button" className={editBtn} onClick={() => { setTexto(value); setEditando(true); }} aria-label={`Editar ${label.toLowerCase()}`}>
        {display ?? (value ? <span className="truncate">{value}</span> : <span className="text-muted-foreground">{placeholder}</span>)}
        <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" aria-hidden="true" />
      </button>
    );
  }
  const terminar = () => {
    setEditando(false);
    if (cancelou.current) { cancelou.current = false; return; }
    if (texto.trim() !== value) onSave(texto.trim());
  };
  return (
    <input
      // Foco no campo que a própria pessoa acabou de abrir.
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      aria-label={label}
      inputMode={inputMode}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={terminar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { cancelou.current = true; (e.target as HTMLInputElement).blur(); }
      }}
      className="h-8 w-full rounded-md border border-primary bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
    />
  );
}

function InlineSelect({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onSave(e.target.value)}
      className="-ml-1 h-8 w-full rounded-md border border-transparent bg-transparent px-1 text-sm hover:border-border focus-visible:border-border focus-visible:outline-2 focus-visible:outline-ring"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function PhoneField({ leadId, masked }: { leadId: string; masked: string }) {
  const [completo, setCompleto] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (completo) return <span className="tabular-nums">{completo}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums">{masked}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await revealPhoneAction(leadId);
          if (r.ok) setCompleto(r.phone);
        })}
        className="inline-flex items-center gap-1 rounded text-xs text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Mostrar
      </button>
    </span>
  );
}

function TagEditor({
  leadId,
  tags,
  allTags,
  onDone,
}: {
  leadId: string;
  tags: BoardTag[];
  allTags: BoardTag[];
  onDone: (msg: string) => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [pending, start] = useTransition();
  const id = useId();
  const atuais = new Set(tags.map((t) => t.id));
  const sugestoes = allTags.filter((t) => !atuais.has(t.id) && t.name.includes(busca.trim().toLowerCase()));
  const exato = allTags.some((t) => t.name === busca.trim().toLowerCase());

  const salvar = (ids: string[], msg: string) =>
    start(async () => {
      const r = await setLeadTagsAction(leadId, ids);
      onDone(r.ok ? msg : r.message);
      if (r.ok) router.refresh();
    });

  return (
    <div className="mt-2">
      <ul className="flex flex-wrap items-center gap-1" aria-label="Tags">
        {tags.map((t) => (
          <li key={t.id} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${colorClasses(t.color).chip}`}>
            {t.name}
            <button
              type="button"
              disabled={pending}
              onClick={() => salvar([...atuais].filter((x) => x !== t.id), `Tag ${t.name} retirada.`)}
              aria-label={`Retirar tag ${t.name}`}
              className="rounded opacity-60 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={`${id}-tags`}
            aria-label="Adicionar tag"
            className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Plus className="h-3 w-3" aria-hidden="true" /> tag
          </button>
        </li>
      </ul>
      {aberto && (
        <div id={`${id}-tags`} className="mt-2 rounded-lg border border-border bg-surface p-2">
          <label htmlFor={`${id}-busca`} className="sr-only">Buscar ou criar tag</label>
          <input
            id={`${id}-busca`}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAberto(false)}
            placeholder="Buscar ou criar tag"
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          />
          <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
            {sugestoes.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => { salvar([...atuais, t.id], `Tag ${t.name} adicionada.`); setBusca(''); }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className={`h-2 w-2 rounded-full ${colorClasses(t.color).dot}`} aria-hidden="true" /> {t.name}
                </button>
              </li>
            ))}
            {busca.trim() && !exato && (
              <li>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => {
                    const r = await createTagAction(busca);
                    if (!r.ok) return onDone(r.message);
                    const s = await setLeadTagsAction(leadId, [...atuais, r.tag.id]);
                    onDone(s.ok ? `Tag ${r.tag.name} criada e adicionada.` : s.message);
                    setBusca('');
                    router.refresh();
                  })}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-primary hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Criar “{busca.trim().toLowerCase()}”
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
