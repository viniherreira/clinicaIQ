'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import {
  getAudience,
  createAndSendCampaign,
  type AudienceFilter,
  type AudienceResult,
} from '../actions';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const FILTERS: { id: AudienceFilter; label: string; hint: string }[] = [
  { id: 'todos', label: 'Todos os pacientes', hint: 'Toda a base ativa' },
  { id: 'aniversariantes', label: 'Aniversariantes do mês', hint: 'Fazem aniversário neste mês' },
  { id: 'inativos', label: 'Sumidos há 6 meses', hint: 'Sem atendimento há mais de 6 meses' },
  { id: 'procedimento', label: 'Fizeram um procedimento', hint: 'Escolha qual abaixo' },
];

const EXAMPLE =
  'Oi {nome}! 😁 Neste mês a Clínica está com clareamento a partir de R$ 399. ' +
  'Quer agendar uma avaliação? É só responder por aqui!';

export function NewCampaign({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const [filter, setFilter] = useState<AudienceFilter>('todos');
  const [procedureId, setProcedureId] = useState('');
  const [audience, setAudience] = useState<AudienceResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();

  // Reload the audience whenever the filter changes, selecting everyone by
  // default — the common case is "send to this whole group".
  useEffect(() => {
    startLoad(async () => {
      const result = await getAudience(filter, procedureId || undefined);
      setAudience(result);
      setSelected(new Set(result.patients.map((p) => p.id)));
    });
  }, [filter, procedureId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patients = audience?.patients ?? [];
  const visible = search.trim()
    ? patients.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : patients;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    startSend(async () => {
      const res = await createAndSendCampaign({
        name: name.trim(),
        message: message.trim(),
        patientIds: [...selected],
      });
      if (res.success) setDone(res.queued);
      else setError(res.error);
    });
  }

  const preview = message.replace(/\{nome\}/gi, patients[0]?.name.split(' ')[0] ?? 'Maria');

  /** First unmet requirement, so the disabled button can explain itself. */
  const missing =
    selected.size === 0
      ? 'Selecione ao menos um paciente (passo 2).'
      : name.trim().length < 2
        ? 'Falta o nome da campanha (passo 3, primeiro campo).'
        : message.trim().length < 10
          ? 'Escreva a mensagem (passo 3, pelo menos 10 caracteres).'
          : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {done !== null ? 'Campanha iniciada' : 'Nova campanha'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {done !== null ? (
          <div className="p-8 text-center">
            <p className="text-4xl">📤</p>
            <p className="mt-3 text-base font-semibold">
              {done} mensagem{done !== 1 ? 's' : ''} na fila
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              O envio acontece aos poucos, para proteger o número da clínica. Você pode fechar esta
              tela — acompanhe o progresso na lista de campanhas.
            </p>
            <button type="button" onClick={onClose} className="btn-primary btn-md mt-6">
              Entendi
            </button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {/* 1. Audience */}
              <section>
                <h3 className="text-sm font-semibold">1. Para quem enviar</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      aria-pressed={filter === f.id}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        filter === f.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-surface-alt'
                      }`}
                    >
                      <p className="text-sm font-medium">{f.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{f.hint}</p>
                    </button>
                  ))}
                </div>

                {filter === 'procedimento' && (
                  <div className="mt-2">
                    <Select value={procedureId || '__none__'} onValueChange={(v) => setProcedureId(v === '__none__' ? '' : v)}>
                      <SelectTrigger aria-label="Escolher procedimento">
                        <SelectValue placeholder="Escolha o procedimento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Escolha o procedimento</SelectItem>
                        {(audience?.procedures ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </section>

              {/* 2. Selection */}
              <section>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    2. Confirme a lista{' '}
                    <span className="font-normal text-muted-foreground">
                      ({selected.size} selecionado{selected.size !== 1 ? 's' : ''})
                    </span>
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(new Set(patients.map((p) => p.id)))}
                      className="btn-ghost btn-sm"
                    >
                      Todos
                    </button>
                    <button type="button" onClick={() => setSelected(new Set())} className="btn-ghost btn-sm">
                      Nenhum
                    </button>
                  </div>
                </div>

                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar paciente..."
                    aria-label="Buscar paciente na lista"
                    className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                </div>

                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border">
                  {loading ? (
                    <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando…
                    </p>
                  ) : visible.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum paciente neste filtro.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {visible.map((p) => (
                        <li key={p.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-alt">
                            <input
                              type="checkbox"
                              checked={selected.has(p.id)}
                              onChange={() => toggle(p.id)}
                              className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {p.phoneHint}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {audience && (audience.skipped.optOut > 0 || audience.skipped.noPhone > 0) && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Fora da lista:{' '}
                    {audience.skipped.optOut > 0 && `${audience.skipped.optOut} descadastrado(s)`}
                    {audience.skipped.optOut > 0 && audience.skipped.noPhone > 0 && ' · '}
                    {audience.skipped.noPhone > 0 && `${audience.skipped.noPhone} sem telefone`}
                  </p>
                )}
              </section>

              {/* 3. Message */}
              <section>
                <h3 className="text-sm font-semibold">3. A mensagem</h3>
                <label htmlFor="campaign-name" className="mt-2 block text-xs font-medium">
                  Nome da campanha <span className="text-destructive">*</span>{' '}
                  <span className="font-normal text-muted-foreground">(só você vê)</span>
                </label>
                <input
                  id="campaign-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Ex: Promoção de clareamento"
                  className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={900}
                  placeholder={EXAMPLE}
                  aria-label="Texto da mensagem"
                  className="mt-2 w-full rounded-md border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Use <code className="font-mono">{'{nome}'}</code> para o primeiro nome do paciente.
                  </span>
                  <button
                    type="button"
                    onClick={() => setMessage(EXAMPLE)}
                    className="font-medium text-primary hover:underline"
                  >
                    Usar exemplo
                  </button>
                </div>

                {message.trim().length > 0 && (
                  <div className="mt-3 rounded-lg border border-border bg-surface-alt p-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Prévia (como o paciente vê)
                    </p>
                    <div className="whitespace-pre-wrap rounded-lg bg-[#dcf8c6] p-3 text-sm text-slate-900 dark:bg-emerald-900/40 dark:text-emerald-50">
                      {preview}
                      <span className="mt-2 block text-xs italic opacity-70">
                        Para não receber mais, responda SAIR.
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
              {/* A disabled button with no explanation reads as a broken screen —
                  always say which field is still missing. */}
              <p className={`text-xs ${missing ? 'text-warning' : 'text-muted-foreground'}`}>
                {missing ?? (selected.size > 0 ? `≈ ${Math.ceil((selected.size * 20) / 60)} min de envio` : '')}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-outline btn-md">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={sending || missing !== null}
                  title={missing ?? undefined}
                  className="btn-primary btn-md"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Enviar para {selected.size}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
