'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ClipboardList, FileText, History, MousePointerClick, RotateCcw, Trash2, X } from 'lucide-react';
import {
  DECID_LOWER,
  DECID_UPPER,
  faceLetter,
  faceName,
  FACES,
  facesText,
  isKind,
  KIND_ORDER,
  KINDS,
  PERM_LOWER,
  PERM_UPPER,
  STATUS_LABEL,
  toothGone,
  toothName,
  toothVisual,
  type Face,
  type FindingKind,
  type FindingStatus,
} from '@/lib/odontogram';
import { addToothFindings, deleteToothFinding, updateToothFindings } from '../actions';
import { facePositions, SECTORS, STATUS_DOT, STATUS_FILL, ToothSide, ToothTop } from './tooth-shapes';
import { CLINIC_TZ } from '@/lib/tz';

export interface Finding {
  id: string;
  toothNumber: number;
  surfaces: string[];
  kind: string;
  status: FindingStatus;
  note: string | null;
  doneAt: Date | string | null;
  createdAt: Date | string;
  procedure: { id: string; name: string; price: number } | null;
  professional: { id: string; name: string } | null;
}

interface Props {
  patientId: string;
  findings: Finding[];
  procedures: { id: string; name: string; price: number }[];
  professionals: { id: string; name: string }[];
  /** Pode escrever no prontuário (perfil e situação da clínica). */
  canEdit?: boolean;
}

type Dentition = 'perm' | 'decid' | 'mixed';
type Filter = 'all' | 'PLANNED' | 'DONE';

const STATUS_ORDER: FindingStatus[] = ['PLANNED', 'DONE', 'EXISTING'];
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const kindLabel = (k: string) => (isKind(k) ? KINDS[k].label : k);
const dateBR = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: CLINIC_TZ });

const STATUS_PILL: Record<FindingStatus, string> = {
  PLANNED: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900',
  DONE: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900',
  EXISTING: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
};

function StatusPill({ status }: { status: FindingStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_PILL[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * O odontograma da ficha, no padrão dos sistemas de clínica: cada dente com a
 * vista lateral e as cinco faces; marcações por face (cárie, restauração,
 * selante) ou do dente todo (canal, coroa, implante, extração...), cada uma
 * a fazer, realizada ou pré-existente. O que está a fazer forma o plano de
 * tratamento (com valores, vira orçamento); marcar como realizado escreve a
 * evolução sozinho.
 */
export function Odontogram({ patientId, findings, procedures, professionals, canEdit = true }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dentition, setDentition] = useState<Dentition>(() =>
    findings.some((f) => f.toothNumber >= 50) && !findings.some((f) => f.toothNumber < 50) ? 'decid' : 'perm',
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<number[]>([]);
  const [faces, setFaces] = useState<Face[]>([]);
  const [status, setStatus] = useState<FindingStatus | null>(null);
  const [note, setNote] = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [professionalId, setProfessionalId] = useState(professionals.length === 1 ? professionals[0].id : '');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [planSel, setPlanSel] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const visiveis = useMemo(() => (filter === 'all' ? findings : findings.filter((f) => f.status === filter)), [findings, filter]);
  const porDente = useMemo(() => {
    const m = new Map<number, Finding[]>();
    for (const f of visiveis) m.set(f.toothNumber, [...(m.get(f.toothNumber) ?? []), f]);
    return m;
  }, [visiveis]);
  const plano = findings.filter((f) => f.status === 'PLANNED');
  const historico = findings
    .filter((f) => f.status !== 'PLANNED')
    .sort((a, b) => new Date(b.doneAt ?? b.createdAt).getTime() - new Date(a.doneAt ?? a.createdAt).getTime());
  const totalPlano = plano.reduce((s, f) => s + (f.procedure?.price ?? 0), 0);
  const contagem = Object.fromEntries(STATUS_ORDER.map((s) => [s, findings.filter((f) => f.status === s).length])) as Record<FindingStatus, number>;

  const unico = selected.length === 1 ? selected[0] : null;
  const doDente = unico != null ? findings.filter((f) => f.toothNumber === unico) : [];

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, ok: string, after?: () => void) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setAviso({ tipo: 'erro', texto: r.message ?? 'Não foi possível salvar.' });
        return;
      }
      setAviso({ tipo: 'ok', texto: ok });
      after?.();
      router.refresh();
    });
  }

  function pickTooth(n: number, e: React.MouseEvent) {
    const face = (e.target as Element).getAttribute?.('data-face') as Face | null;
    const multi = e.ctrlKey || e.metaKey || e.shiftKey;
    setAviso(null);
    setConfirmDel(null);
    if (multi) {
      setSelected((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
      return;
    }
    if (face && canEdit) {
      // Clicou numa face: escolhe o dente e liga/desliga essa face.
      if (unico === n) setFaces((cur) => (cur.includes(face) ? cur.filter((f) => f !== face) : [...cur, face]));
      else {
        setSelected([n]);
        setFaces([face]);
      }
      return;
    }
    if (unico === n) {
      setSelected([]);
      setFaces([]);
    } else {
      setSelected([n]);
      setFaces([]);
    }
  }

  function mark(kind: FindingKind) {
    const meta = KINDS[kind];
    if (selected.length === 0) return;
    if (meta.faces && faces.length === 0) {
      setAviso({ tipo: 'erro', texto: `${meta.label} é marcada por face: escolha as faces no desenho acima.` });
      return;
    }
    const st = status ?? meta.defaultStatus;
    run(
      () =>
        addToothFindings(patientId, {
          teeth: selected,
          kind,
          surfaces: meta.faces ? faces : [],
          status: st,
          note,
          procedureId,
          professionalId,
        }),
      `Marcado: ${meta.label}${meta.faces ? ` ${facesText(faces, selected[0])}` : ''} ${selected.length > 1 ? `em ${selected.length} dentes` : `no ${selected[0]}`} (${STATUS_LABEL[st].toLowerCase()}).${st === 'DONE' ? ' A evolução foi registrada.' : ''}`,
      () => {
        setFaces([]);
        setNote('');
        setProcedureId('');
      },
    );
  }

  // Funções que desenham, não componentes: assim o botão não é recriado a cada clique e o foco fica nele.
  function tooth(n: number) {
    const list = porDente.get(n) ?? [];
    const v = toothVisual(list);
    const sel = selected.includes(n);
    const upper = n < 30 || (n > 50 && n < 70);
    const descricao = list.map((f) => `${kindLabel(f.kind)}${f.surfaces.length ? ` ${facesText(f.surfaces, n)}` : ''} ${STATUS_LABEL[f.status].toLowerCase()}`);
    const numero = (
      <span
        className={[
          'flex h-5 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums',
          v.top === 'PLANNED' ? 'bg-red-600 text-white' : v.top ? 'bg-surface-alt text-foreground' : 'text-muted-foreground',
        ].join(' ')}
      >
        {n}
      </span>
    );
    const lado = <ToothSide fdi={n} visual={v} className="h-[54px] w-[34px] sm:h-[60px] sm:w-[37px]" />;
    const topo = <ToothTop fdi={n} faces={v.faces} gone={toothGone(v)} selected={sel && unico === n ? faces : []} className="h-7 w-7" />;
    return (
      <button
        key={n}
        type="button"
        onClick={(e) => pickTooth(n, e)}
        aria-pressed={sel}
        aria-label={`Dente ${n}, ${toothName(n)}${descricao.length ? `: ${descricao.join('; ')}` : ', sem marcações'}`}
        className={[
          'group relative flex shrink-0 flex-col items-center gap-1 rounded-xl px-px py-1.5 transition-colors',
          sel ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-surface-alt',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        ].join(' ')}
      >
        {upper ? (
          <>
            {numero}
            {lado}
            {topo}
          </>
        ) : (
          <>
            {topo}
            {lado}
            {numero}
          </>
        )}
        {list.some((f) => f.note) && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
      </button>
    );
  }

  function row({ numbers, label }: { numbers: number[]; label: string }) {
    const mid = numbers.length / 2;
    return (
      <div key={label} role="group" aria-label={label} className="mx-auto flex w-max items-center gap-0.5">
        {numbers.slice(0, mid).map(tooth)}
        <span className="mx-1 w-px self-stretch bg-border-strong sm:mx-1.5" aria-hidden="true" />
        {numbers.slice(mid).map(tooth)}
      </div>
    );
  }

  const linhas: { numbers: number[]; label: string }[][] = [
    dentition === 'decid' ? [] : [{ numbers: PERM_UPPER, label: 'Arcada superior, permanentes' }],
    dentition === 'perm' ? [] : [{ numbers: DECID_UPPER, label: 'Arcada superior, decíduos' }],
  ];
  const linhasBaixo: { numbers: number[]; label: string }[][] = [
    dentition === 'perm' ? [] : [{ numbers: DECID_LOWER, label: 'Arcada inferior, decíduos' }],
    dentition === 'decid' ? [] : [{ numbers: PERM_LOWER, label: 'Arcada inferior, permanentes' }],
  ];

  const seg = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
      on ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Quadro */}
        <section aria-label="Odontograma" className="rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div role="group" aria-label="Dentição" className="inline-flex rounded-lg bg-surface-alt p-0.5">
              {(
                [
                  ['perm', 'Permanente'],
                  ['decid', 'Decídua'],
                  ['mixed', 'Mista'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={dentition === k} onClick={() => setDentition(k)} className={seg(dentition === k)}>
                  {l}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Mostrar" className="inline-flex rounded-lg bg-surface-alt p-0.5">
              {(
                [
                  ['all', 'Tudo'],
                  ['PLANNED', 'A fazer'],
                  ['DONE', 'Realizado'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={seg(filter === k)}>
                  {l}
                </button>
              ))}
            </div>
            <ul className="ml-auto flex flex-wrap gap-x-3 gap-y-1" aria-label="Legenda">
              {STATUS_ORDER.map((s) => (
                <li key={s} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`h-2.5 w-2.5 rounded-sm ${STATUS_DOT[s]}`} aria-hidden="true" />
                  {STATUS_LABEL[s]}
                  <span className="tabular-nums text-foreground/70">({contagem[s]})</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="overflow-x-auto px-2 py-4 sm:px-4">
            <div className="mx-auto w-max">
              <div className="mb-1 flex justify-between px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>Direito do paciente</span>
                <span>Superior</span>
                <span>Esquerdo do paciente</span>
              </div>
              <div className="space-y-1">
                {linhas.flat().map(row)}
              </div>
              <div className="my-3 flex items-center gap-2" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Plano oclusal</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-1">
                {linhasBaixo.flat().map(row)}
              </div>
              <p className="mt-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Inferior</p>
            </div>
          </div>

          <p className="flex items-center justify-center gap-1.5 border-t border-border px-4 py-2.5 text-center text-xs text-muted-foreground">
            <MousePointerClick className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Clique num dente (ou direto numa face) para marcar. Ctrl + clique escolhe vários dentes de uma vez.
          </p>
        </section>

        {/* Painel */}
        <aside aria-label="Marcar no odontograma" className="xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-2xl border border-border bg-surface shadow-card">
            {selected.length === 0 ? (
              <div className="space-y-4 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Resumo</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Escolha um dente para marcar ou ver o que ele tem.</p>
                </div>
                <dl className="grid grid-cols-3 gap-2">
                  {STATUS_ORDER.map((s) => (
                    <div key={s} className="rounded-xl bg-surface-alt/70 p-3 text-center">
                      <dd className="text-xl font-semibold tabular-nums">{contagem[s]}</dd>
                      <dt className="mt-0.5 text-[11px] text-muted-foreground">{STATUS_LABEL[s]}</dt>
                    </div>
                  ))}
                </dl>
                {totalPlano > 0 && (
                  <p className="rounded-xl border border-red-200 bg-red-50/60 px-3 py-2 text-sm dark:border-red-900 dark:bg-red-950/30">
                    Plano de tratamento: <strong className="tabular-nums">{brl(totalPlano)}</strong>
                  </p>
                )}
                <FaceGuide />
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">
                      {unico != null ? `Dente ${unico}` : `${selected.length} dentes`}
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {unico != null ? toothName(unico) : [...selected].sort((a, b) => a - b).join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected([]);
                      setFaces([]);
                    }}
                    aria-label="Fechar"
                    className="rounded-lg p-1 text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {canEdit ? (
                  <div className="space-y-4 p-4">
                    <FacePicker fdi={unico ?? selected[0]} value={faces} onChange={setFaces} generic={unico == null} />

                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Situação</p>
                      <div role="group" aria-label="Situação da marcação" className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-surface-alt p-0.5">
                        {STATUS_ORDER.map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={status === s}
                            onClick={() => setStatus(status === s ? null : s)}
                            className={`inline-flex items-center justify-center gap-1 !px-1 text-center !text-[11px] ${seg(status === s)}`}
                          >
                            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} aria-hidden="true" />
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                      {!status && <p className="mt-1 text-[11px] text-muted-foreground">Sem escolha: cada marcação usa a situação mais comum dela.</p>}
                    </div>

                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Marcar</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        {KIND_ORDER.map((k) => {
                          const meta = KINDS[k];
                          const st = status ?? meta.defaultStatus;
                          const precisaFace = meta.faces && faces.length === 0;
                          return (
                            <button
                              key={k}
                              type="button"
                              disabled={pending}
                              onClick={() => mark(k)}
                              title={meta.hint}
                              className={[
                                'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors disabled:opacity-50',
                                precisaFace ? 'border-dashed border-border text-muted-foreground' : 'border-border hover:border-primary hover:bg-primary/5',
                                'focus-visible:outline-2 focus-visible:outline-ring',
                              ].join(' ')}
                            >
                              <KindIcon kind={k} status={st} />
                              <span className="min-w-0">
                                {meta.label}
                                {meta.faces && <span className="block text-[10px] font-normal text-muted-foreground">por face</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <details className="group rounded-lg border border-border">
                      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                        Procedimento, profissional e anotação
                        {(procedureId || note) && <span className="ml-1 text-primary">•</span>}
                      </summary>
                      <div className="space-y-2.5 border-t border-border p-3">
                        <label className="block text-xs">
                          <span className="font-medium text-muted-foreground">Procedimento da tabela (dá o valor)</span>
                          <select value={procedureId} onChange={(e) => setProcedureId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
                            <option value="">Nenhum</option>
                            {procedures.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} · {brl(p.price)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs">
                          <span className="font-medium text-muted-foreground">Profissional</span>
                          <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
                            <option value="">Não informar</option>
                            {professionals.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs">
                          <span className="font-medium text-muted-foreground">Anotação</span>
                          <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={300}
                            placeholder="Ex: resina A2, retratamento..."
                            className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                          />
                        </label>
                        <p className="text-[11px] text-muted-foreground">Vale para a próxima marcação.</p>
                      </div>
                    </details>
                  </div>
                ) : (
                  <p className="p-4 text-xs text-muted-foreground">Você pode ver o odontograma, mas não alterar.</p>
                )}

                {aviso && (
                  <p
                    role={aviso.tipo === 'erro' ? 'alert' : 'status'}
                    className={`mx-4 mb-3 rounded-lg px-3 py-2 text-xs ${aviso.tipo === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'}`}
                  >
                    {aviso.texto}
                  </p>
                )}

                {unico != null && (
                  <div className="border-t border-border px-4 py-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Neste dente</h4>
                    {doDente.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">Nada marcado ainda.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {doDente.map((f) => (
                          <li key={f.id} className="rounded-lg border border-border p-2.5">
                            <div className="flex items-start gap-2">
                              <KindIcon kind={f.kind} status={f.status} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight">
                                  {kindLabel(f.kind)}
                                  {f.surfaces.length > 0 && <span className="ml-1 font-mono text-xs text-muted-foreground">{facesText(f.surfaces, f.toothNumber)}</span>}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {f.status === 'DONE' && f.doneAt ? `em ${dateBR(f.doneAt)}` : `desde ${dateBR(f.createdAt)}`}
                                  {f.professional && ` · ${f.professional.name}`}
                                  {f.procedure && ` · ${brl(f.procedure.price)}`}
                                </p>
                                {f.note && <p className="mt-1 text-xs">{f.note}</p>}
                              </div>
                              <StatusPill status={f.status} />
                            </div>
                            {canEdit && (
                              <FindingActions
                                f={f}
                                pending={pending}
                                confirm={confirmDel === f.id}
                                onConfirm={(v) => setConfirmDel(v ? f.id : null)}
                                onStatus={(s) => run(() => updateToothFindings(patientId, [f.id], { status: s }), s === 'DONE' ? 'Marcado como realizado. A evolução foi registrada.' : 'Situação alterada.')}
                                onDelete={() => run(() => deleteToothFinding(patientId, f.id), 'Marcação apagada.', () => setConfirmDel(null))}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Plano de tratamento */}
      <section aria-labelledby="plano-titulo" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <ClipboardList className="h-4 w-4 text-red-500" aria-hidden="true" />
          <h3 id="plano-titulo" className="mr-auto text-sm font-semibold">
            Plano de tratamento <span className="font-normal text-muted-foreground">· {plano.length} {plano.length === 1 ? 'item' : 'itens'}</span>
          </h3>
          {canEdit && planSel.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => updateToothFindings(patientId, planSel, { status: 'DONE' }), `${planSel.length} ${planSel.length === 1 ? 'item realizado' : 'itens realizados'}. A evolução foi registrada.`, () => setPlanSel([]))}
              className="btn-primary btn-sm"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Marcar {planSel.length} como realizado{planSel.length > 1 ? 's' : ''}
            </button>
          )}
          {plano.length > 0 && (
            <Link href={`/orcamentos/novo?patientId=${patientId}&plano=1`} className="btn-outline btn-sm">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Gerar orçamento
            </Link>
          )}
        </div>
        {plano.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nada a fazer. O que for marcado como <strong className="font-medium text-red-600 dark:text-red-400">a fazer</strong> no odontograma aparece aqui, com o valor.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {canEdit && (
                    <th scope="col" className="w-10 px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label="Escolher todos os itens do plano"
                        checked={planSel.length === plano.length}
                        onChange={(e) => setPlanSel(e.target.checked ? plano.map((f) => f.id) : [])}
                        className="h-4 w-4 accent-primary"
                      />
                    </th>
                  )}
                  <th scope="col" className="px-3 py-2 font-medium">Dente</th>
                  <th scope="col" className="px-3 py-2 font-medium">Procedimento</th>
                  <th scope="col" className="px-3 py-2 font-medium">Faces</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Valor</th>
                  {canEdit && <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plano.map((f) => (
                  <tr key={f.id} className="hover:bg-surface-alt/50">
                    {canEdit && (
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Escolher ${kindLabel(f.kind)} no dente ${f.toothNumber}`}
                          checked={planSel.includes(f.id)}
                          onChange={(e) => setPlanSel((cur) => (e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id)))}
                          className="h-4 w-4 accent-primary"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected([f.toothNumber]);
                          setFaces([]);
                          if (f.toothNumber >= 50 && dentition === 'perm') setDentition('mixed');
                        }}
                        className="rounded-md bg-surface-alt px-2 py-0.5 font-mono text-xs font-semibold hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                        aria-label={`Ver o dente ${f.toothNumber} no odontograma`}
                      >
                        {f.toothNumber}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{f.procedure?.name ?? kindLabel(f.kind)}</p>
                      {(f.procedure || f.note) && (
                        <p className="text-xs text-muted-foreground">
                          {f.procedure && kindLabel(f.kind)}
                          {f.procedure && f.note && ' · '}
                          {f.note}
                        </p>
                      )}
                      {canEdit && !f.procedure && procedures.length > 0 && (
                        <select
                          aria-label={`Procedimento da tabela para ${kindLabel(f.kind)} no dente ${f.toothNumber}`}
                          value=""
                          disabled={pending}
                          onChange={(e) => e.target.value && run(() => updateToothFindings(patientId, [f.id], { procedureId: e.target.value }), 'Procedimento ligado ao item.')}
                          className="mt-1 h-7 max-w-56 rounded-md border border-dashed border-border bg-background px-1.5 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <option value="">+ ligar à tabela de preços</option>
                          {procedures.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {brl(p.price)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{facesText(f.surfaces, f.toothNumber) || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.procedure ? brl(f.procedure.price) : <span className="text-muted-foreground">—</span>}</td>
                    {canEdit && (
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => updateToothFindings(patientId, [f.id], { status: 'DONE' }), 'Marcado como realizado. A evolução foi registrada.')}
                            aria-label={`Marcar ${kindLabel(f.kind)} no dente ${f.toothNumber} como realizado`}
                            title="Marcar como realizado"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-blue-950/50 dark:hover:text-blue-300"
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => deleteToothFinding(patientId, f.id), 'Item tirado do plano.')}
                            aria-label={`Tirar ${kindLabel(f.kind)} no dente ${f.toothNumber} do plano`}
                            title="Tirar do plano"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface-alt/40">
                  <td colSpan={canEdit ? 4 : 3} className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    Total {plano.some((f) => !f.procedure) && '(itens sem procedimento ligado não somam)'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{brl(totalPlano)}</td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Histórico */}
      {historico.length > 0 && (
        <section aria-labelledby="odonto-hist" className="rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
            <History className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h3 id="odonto-hist" className="text-sm font-semibold">
              Realizados e pré-existentes <span className="font-normal text-muted-foreground">· {historico.length}</span>
            </h3>
          </div>
          <ul className="divide-y divide-border">
            {historico.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <KindIcon kind={f.kind} status={f.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{f.procedure?.name ?? kindLabel(f.kind)}</span>
                    {f.surfaces.length > 0 && <span className="ml-1 font-mono text-xs text-muted-foreground">{facesText(f.surfaces, f.toothNumber)}</span>}
                    <span className="text-muted-foreground"> · dente {f.toothNumber}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.status === 'DONE' && f.doneAt ? `Realizado em ${dateBR(f.doneAt)}` : `Registrado em ${dateBR(f.createdAt)}`}
                    {f.professional && ` · ${f.professional.name}`}
                    {f.note && ` · ${f.note}`}
                  </p>
                </div>
                <StatusPill status={f.status} />
                {canEdit && f.status === 'DONE' && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => updateToothFindings(patientId, [f.id], { status: 'PLANNED' }), 'Voltou para o plano de tratamento.')}
                    aria-label={`Voltar ${kindLabel(f.kind)} no dente ${f.toothNumber} para a fazer`}
                    title="Voltar para a fazer"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FindingActions({
  f,
  pending,
  confirm,
  onConfirm,
  onStatus,
  onDelete,
}: {
  f: Finding;
  pending: boolean;
  confirm: boolean;
  onConfirm: (v: boolean) => void;
  onStatus: (s: FindingStatus) => void;
  onDelete: () => void;
}) {
  const label = `${kindLabel(f.kind)} no dente ${f.toothNumber}`;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
      {f.status === 'PLANNED' && (
        <button type="button" disabled={pending} onClick={() => onStatus('DONE')} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">
          <Check className="h-3 w-3" aria-hidden="true" /> Realizar<span className="sr-only"> {label}</span>
        </button>
      )}
      {f.status === 'DONE' && (
        <button type="button" disabled={pending} onClick={() => onStatus('PLANNED')} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
          <RotateCcw className="h-3 w-3" aria-hidden="true" /> Voltar a fazer<span className="sr-only"> {label}</span>
        </button>
      )}
      <span className="ml-auto" />
      {confirm ? (
        <span className="flex items-center gap-1.5 text-[11px]">
          Apagar?
          <button type="button" onClick={() => onConfirm(false)} className="rounded border border-border px-1.5 py-0.5 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-ring">
            Não
          </button>
          <button type="button" disabled={pending} onClick={onDelete} className="rounded bg-destructive px-1.5 py-0.5 font-medium text-white hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-ring">
            Sim
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => onConfirm(true)} aria-label={`Apagar ${label}`} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** O desenho grande das faces, para escolher clicando, e os botões com o nome de cada uma. */
function FacePicker({ fdi, value, onChange, generic }: { fdi: number; value: Face[]; onChange: (f: Face[]) => void; generic: boolean }) {
  const toggle = (f: Face) => onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f]);
  const pos = facePositions(fdi);
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Faces (para cárie, restauração e selante)</p>
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            Limpar
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        {!generic && (
          <div className="relative shrink-0">
            <ToothTop fdi={fdi} faces={{}} selected={value} onFace={toggle} className="h-24 w-24" />
            <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-muted-foreground">{faceLetter(pos.top, fdi)}</span>
            <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-muted-foreground">{faceLetter(pos.bottom, fdi)}</span>
            <span className="pointer-events-none absolute -left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground">{faceLetter(pos.left, fdi)}</span>
            <span className="pointer-events-none absolute -right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground">{faceLetter(pos.right, fdi)}</span>
          </div>
        )}
        <div role="group" aria-label="Faces" className="grid flex-1 grid-cols-1 gap-1">
          {FACES.map((f) => {
            const on = value.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(f)}
                className={`flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  on ? 'bg-primary text-primary-foreground' : 'bg-surface-alt/70 text-foreground hover:bg-surface-alt'
                }`}
              >
                <span className="w-3 font-mono font-bold">{generic ? f : faceLetter(f, fdi)}</span>
                {generic ? { M: 'Mesial', D: 'Distal', O: 'Oclusal / incisal', V: 'Vestibular', L: 'Lingual / palatina' }[f] : faceName(f, fdi)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Um ícone pequeno de cada marcação, na cor da situação. */
function KindIcon({ kind, status }: { kind: string; status: FindingStatus }) {
  const fill = STATUS_FILL[status];
  const stroke = fill.replace(/fill-/g, 'stroke-');
  const k = isKind(kind) ? kind : 'NOTE';
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="23" height="23" rx="6" className="fill-surface-alt stroke-border" />
      {k === 'CARIES' && <circle cx="12" cy="12" r="4.5" className={fill} />}
      {k === 'RESTORATION' && <rect x="7" y="7" width="10" height="10" rx="2" className={fill} />}
      {k === 'SEALANT' && <path d="M6 13 Q9 9 12 13 T18 13" fill="none" strokeWidth="2.2" strokeLinecap="round" className={stroke} />}
      {k === 'ROOT_CANAL' && <path d="M12 5 L12 19 M8.5 6 L10 18 M15.5 6 L14 18" fill="none" strokeWidth="1.8" strokeLinecap="round" className={stroke} />}
      {k === 'CROWN' && <path d="M6 16 L7 8 L10 11 L12 7 L14 11 L17 8 L18 16 Z" strokeWidth="1.2" strokeLinejoin="round" className={`${fill} ${stroke}`} />}
      {k === 'IMPLANT' && (
        <g strokeWidth="1.6" strokeLinecap="round" className={stroke}>
          <path d="M9 6 L15 6 M9.5 9 L14.5 8 M9.5 12 L14.5 11 M10 15 L14 14 M10.5 18 L13.5 17" />
        </g>
      )}
      {k === 'EXTRACTION' && <path d="M7 7 L17 17 M17 7 L7 17" strokeWidth="2.4" strokeLinecap="round" className={stroke} />}
      {k === 'MISSING' && <rect x="7" y="6" width="10" height="12" rx="3" fill="none" strokeWidth="1.6" strokeDasharray="2 1.6" className={stroke} />}
      {k === 'BRIDGE' && <path d="M4 10 L20 10 M7 10 L7 17 M17 10 L17 17" strokeWidth="2" strokeLinecap="round" className={stroke} />}
      {k === 'VENEER' && <path d="M8 6 L16 6 L16 14 Q16 18 12 18 Q8 18 8 14 Z" className={fill} opacity="0.75" />}
      {k === 'FRACTURE' && <path d="M8 6 L13 10 L10 13 L16 18" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={stroke} />}
      {k === 'NOTE' && <path d="M7 8 L17 8 M7 12 L17 12 M7 16 L13 16" strokeWidth="1.8" strokeLinecap="round" className={stroke} />}
    </svg>
  );
}

/** Como ler as faces: um lembrete para quem não usa o odontograma todo dia. */
function FaceGuide() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3">
      <svg viewBox="0 0 40 40" className="h-14 w-14 shrink-0" aria-hidden="true">
        {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
          <path key={k} d={SECTORS[k]} strokeWidth="1.1" className="fill-white stroke-slate-400 dark:fill-slate-200/10 dark:stroke-slate-500" />
        ))}
        <circle cx="20" cy="20" r="7" strokeWidth="1.1" className="fill-white stroke-slate-400 dark:fill-slate-200/10 dark:stroke-slate-500" />
        <text x="20" y="6.5" textAnchor="middle" className="fill-muted-foreground text-[5px] font-bold">V</text>
        <text x="20" y="22" textAnchor="middle" className="fill-muted-foreground text-[5px] font-bold">O</text>
        <text x="20" y="37" textAnchor="middle" className="fill-muted-foreground text-[5px] font-bold">L</text>
        <text x="4.5" y="22" textAnchor="middle" className="fill-muted-foreground text-[5px] font-bold">D</text>
        <text x="35.5" y="22" textAnchor="middle" className="fill-muted-foreground text-[5px] font-bold">M</text>
      </svg>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Em cima de cada dente, as 5 faces: <strong>V</strong>estibular (para fora), <strong>L</strong>ingual ou <strong>P</strong>alatina (para dentro),{' '}
        <strong>M</strong>esial (para o meio), <strong>D</strong>istal e <strong>O</strong>clusal ou <strong>I</strong>ncisal (o centro).
      </p>
    </div>
  );
}
