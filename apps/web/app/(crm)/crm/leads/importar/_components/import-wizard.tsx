'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { parseCsv } from '@/crm/csv';
import { buildRecords, guessMapping, guessNewFieldType, TARGETS, type ImportRecord, type ImportTarget } from '@/crm/import-map';
import type { DuplicateMode, ImportPreview, ImportSummary } from '@/crm/import';
import { createImportFieldsAction, importBatchAction, previewImportAction } from '../actions';

/** Iguais a `IMPORT_BATCH` e `MAX_IMPORT` de `crm/import.ts` (que não entra no navegador). */
const LOTE = 200;
const MAXIMO = 20_000;

type Passo = 'arquivo' | 'colunas' | 'conferir' | 'importando' | 'pronto';

interface Planilha {
  name: string;
  headers: string[];
  rows: string[][];
}

const ctl =
  'h-9 rounded-lg border border-border bg-background px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Célula do Excel → texto. Data vira "AAAA-MM-DD HH:MM" (o Excel guarda a hora de parede). */
function celula(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())} ${p(v.getUTCHours())}:${p(v.getUTCMinutes())}`;
  }
  return String(v);
}

async function lerArquivo(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/universal');
    const linhas = (await readSheet(file)) as unknown[][];
    return linhas.map((l) => l.map(celula)).filter((l) => l.some((c) => c.trim()));
  }
  const buf = await file.arrayBuffer();
  let txt = new TextDecoder('utf-8').decode(buf);
  // Planilha salva pelo Excel antigo vem em Windows-1252: os acentos viram "�".
  if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
  return parseCsv(txt);
}

export function ImportWizard({ pipelines, fields }: { pipelines: { id: string; name: string }[]; fields: { id: string; name: string }[] }) {
  const [passo, setPasso] = useState<Passo>('arquivo');
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [mapa, setMapa] = useState<ImportTarget[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);

  const ir = (p: Passo) => {
    setErro(null);
    setPasso(p);
    // O foco vai para o título do passo novo (leitor de tela e teclado).
    requestAnimationFrame(() => {
      titulo.current?.focus();
    });
  };

  async function escolher(file: File | undefined) {
    if (!file) return;
    setErro(null);
    setLendo(true);
    try {
      const linhas = await lerArquivo(file);
      if (linhas.length < 2) {
        setErro('A planilha está vazia ou só tem o cabeçalho.');
        return;
      }
      const [headers, ...rows] = linhas;
      if (rows.length > MAXIMO) {
        setErro(`A planilha tem ${rows.length} linhas; o máximo por vez é ${MAXIMO.toLocaleString('pt-BR')}. Divida em partes.`);
        return;
      }
      setPlanilha({ name: file.name, headers: headers!.map((h) => h.trim()), rows });
      setMapa(guessMapping(headers!, fields));
      ir('colunas');
    } catch {
      setErro('Não foi possível ler o arquivo. Use .xlsx ou .csv.');
    } finally {
      setLendo(false);
    }
  }

  const passos: { key: Passo; label: string }[] = [
    { key: 'arquivo', label: 'Arquivo' },
    { key: 'colunas', label: 'Colunas' },
    { key: 'conferir', label: 'Conferir' },
    { key: 'importando', label: 'Importar' },
  ];
  const atual = passos.findIndex((p) => p.key === (passo === 'pronto' ? 'importando' : passo));

  return (
    <div className="mt-6 space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Passos da importação">
        {passos.map((p, i) => (
          <li
            key={p.key}
            aria-current={i === atual ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${i === atual ? 'border-primary bg-primary/10 font-medium text-foreground' : i < atual ? 'border-border text-foreground' : 'border-border text-muted-foreground'}`}
          >
            {i + 1}. {p.label}
          </li>
        ))}
      </ol>

      {erro && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      {passo === 'arquivo' && (
        <section aria-labelledby="passo-titulo" className="rounded-xl border border-border bg-card p-6">
          <h3 id="passo-titulo" ref={titulo} tabIndex={-1} className="text-base font-semibold outline-none">
            Escolha a planilha
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">Excel (.xlsx) ou CSV. A primeira linha precisa ser o nome das colunas. Até 20 mil leads por vez.</p>
          <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center hover:bg-muted/40 focus-within:outline-2 focus-within:outline-ring">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">{lendo ? 'Lendo a planilha…' : 'Clique para escolher o arquivo'}</span>
            <input
              type="file"
              accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label="Planilha de leads"
              disabled={lendo}
              onChange={(e) => escolher(e.target.files?.[0])}
            />
          </label>
        </section>
      )}

      {passo === 'colunas' && planilha && (
        <Colunas
          planilha={planilha}
          mapa={mapa}
          setMapa={setMapa}
          fields={fields}
          titulo={titulo}
          onVoltar={() => ir('arquivo')}
          onSeguir={() => {
            if (!mapa.includes('phone')) {
              setErro('Diga qual coluna é o telefone: é por ele que o lead se liga às conversas do WhatsApp.');
              return;
            }
            ir('conferir');
          }}
        />
      )}

      {(passo === 'conferir' || passo === 'importando' || passo === 'pronto') && planilha && (
        <Conferir
          planilha={planilha}
          mapa={mapa}
          pipelines={pipelines}
          titulo={titulo}
          passo={passo}
          onVoltar={() => ir('colunas')}
          onPasso={ir}
          onErro={setErro}
        />
      )}
    </div>
  );
}

function Colunas({
  planilha,
  mapa,
  setMapa,
  fields,
  titulo,
  onVoltar,
  onSeguir,
}: {
  planilha: Planilha;
  mapa: ImportTarget[];
  setMapa: (m: ImportTarget[]) => void;
  fields: { id: string; name: string }[];
  titulo: React.RefObject<HTMLHeadingElement | null>;
  onVoltar: () => void;
  onSeguir: () => void;
}) {
  const id = useId();
  const exemplo = (j: number) => planilha.rows.find((r) => (r[j] ?? '').trim())?.[j]?.trim() ?? '';
  return (
    <section aria-labelledby="passo-titulo" className="rounded-xl border border-border bg-card p-6">
      <h3 id="passo-titulo" ref={titulo} tabIndex={-1} className="text-base font-semibold outline-none">
        O que é cada coluna
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {planilha.name} · {planilha.rows.length.toLocaleString('pt-BR')} linhas. Já reconhecemos os nomes do Kommo; corrija o que precisar.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Colunas da planilha e onde cada uma vai entrar</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">Coluna da planilha</th>
              <th scope="col" className="py-2 pr-3 font-medium">Exemplo</th>
              <th scope="col" className="py-2 font-medium">Vai para</th>
            </tr>
          </thead>
          <tbody>
            {planilha.headers.map((h, j) => (
              <tr key={j} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {h || <span className="text-muted-foreground">(sem nome)</span>}
                </th>
                <td className="max-w-[220px] truncate py-2 pr-3 text-muted-foreground">{exemplo(j) || '-'}</td>
                <td className="py-2">
                  <label htmlFor={`${id}-${j}`} className="sr-only">
                    Coluna {h || j + 1} vai para
                  </label>
                  <select
                    id={`${id}-${j}`}
                    className={`${ctl} w-full`}
                    value={mapa[j] ?? 'ignore'}
                    onChange={(e) => {
                      const novo = [...mapa];
                      novo[j] = e.target.value as ImportTarget;
                      setMapa(novo);
                    }}
                  >
                    {TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                    {fields.length > 0 && (
                      <optgroup label="Campos personalizados">
                        {fields.map((f) => (
                          <option key={f.id} value={`field:${f.id}`}>
                            Campo: {f.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex justify-between gap-2">
        <button type="button" onClick={onVoltar} className="btn-ghost btn-md">
          Voltar
        </button>
        <button type="button" onClick={onSeguir} className="btn-primary btn-md">
          Continuar
        </button>
      </div>
    </section>
  );
}

const DUPLICADOS: { value: DuplicateMode; label: string; hint: string }[] = [
  { value: 'skip', label: 'Pular', hint: 'quem já tem lead aberto com o mesmo telefone fica como está' },
  { value: 'update', label: 'Atualizar', hint: 'completa o lead aberto: etapa, valor, responsável, tags, notas e campos' },
  { value: 'create', label: 'Criar outro', hint: 'cria um negócio novo mesmo assim' },
];

function Conferir({
  planilha,
  mapa,
  pipelines,
  titulo,
  passo,
  onVoltar,
  onPasso,
  onErro,
}: {
  planilha: Planilha;
  mapa: ImportTarget[];
  pipelines: { id: string; name: string }[];
  titulo: React.RefObject<HTMLHeadingElement | null>;
  passo: Passo;
  onVoltar: () => void;
  onPasso: (p: Passo) => void;
  onErro: (m: string | null) => void;
}) {
  const id = useId();
  const { records, problems } = useMemo(() => buildRecords(planilha.rows, mapa), [planilha, mapa]);
  const novosCampos = useMemo(
    () =>
      mapa.flatMap((m, j) =>
        m === 'newField' ? [{ key: `new:${j}`, name: (planilha.headers[j] || `Coluna ${j + 1}`).slice(0, 60), ...guessNewFieldType(planilha.rows.map((r) => r[j] ?? '')) }] : [],
      ),
    [planilha, mapa],
  );
  const [pipelineId, setPipelineId] = useState<string>(pipelines[0]?.id ?? '');
  const [duplicates, setDuplicates] = useState<DuplicateMode>('skip');
  const [createMissing, setCreateMissing] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [resumo, setResumo] = useState<ImportSummary>({ created: 0, updated: 0, skipped: 0, problems: [] });

  async function conferir(pid = pipelineId) {
    setCarregando(true);
    const r = await previewImportAction({
      phones: records.map((x) => x.phone),
      stages: records.filter((x) => x.outcome === 'open').map((x) => ({ pipeline: x.pipeline, stage: x.stage })),
      tags: [...new Set(records.flatMap((x) => x.tags))],
      responsibles: [...new Set(records.flatMap((x) => (x.responsible ? [x.responsible] : [])))],
      pipelineId: pid || null,
    }).catch(() => ({ ok: false as const, message: 'Não foi possível conferir a planilha.' }));
    setCarregando(false);
    if (r.ok) setPreview(r.preview);
    else onErro(r.message);
  }

  // Confere assim que o passo abre (a prévia depende só do que veio da planilha).
  useEffect(() => {
    void conferir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importar() {
    onErro(null);
    onPasso('importando');
    let lista: ImportRecord[] = records;
    if (novosCampos.length) {
      const f = await createImportFieldsAction(novosCampos.map(({ key, name, type, options }) => ({ key, name, type, options }))).catch(() => ({
        ok: false as const,
        message: 'Não foi possível criar os campos novos.',
      }));
      if (!f.ok) {
        onErro(f.message);
        onPasso('conferir');
        return;
      }
      lista = records.map((r) => ({
        ...r,
        fields: Object.fromEntries(Object.entries(r.fields).flatMap(([k, v]) => (k.startsWith('new:') ? (f.keys[k] ? [[f.keys[k]!, v]] : []) : [[k, v]]))),
      }));
    }
    const total: ImportSummary = { created: 0, updated: 0, skipped: 0, problems: [] };
    for (let i = 0; i < lista.length; i += LOTE) {
      const lote = lista.slice(i, i + LOTE);
      const r = await importBatchAction({
        records: lote,
        options: { duplicates, pipelineId: pipelineId || null, createMissing },
        fileName: planilha.name,
      }).catch(() => ({ ok: false as const, message: 'A conexão caiu no meio da importação.' }));
      if (!r.ok) {
        total.problems.push(...lote.map((x) => ({ line: x.line, message: r.message })));
      } else {
        total.created += r.summary.created;
        total.updated += r.summary.updated;
        total.skipped += r.summary.skipped;
        total.problems.push(...r.summary.problems);
      }
      setFeitos(Math.min(i + LOTE, lista.length));
      setResumo({ ...total, problems: [...total.problems] });
    }
    onPasso('pronto');
  }

  const todosProblemas = [...problems, ...resumo.problems].sort((a, b) => a.line - b.line);

  if (passo === 'importando' || passo === 'pronto') {
    const pronto = passo === 'pronto';
    return (
      <section aria-labelledby="passo-titulo" className="rounded-xl border border-border bg-card p-6">
        <h3 id="passo-titulo" ref={titulo} tabIndex={-1} className="text-base font-semibold outline-none">
          {pronto ? 'Importação concluída' : 'Importando…'}
        </h3>
        <progress className="mt-4 h-2 w-full" max={records.length} value={feitos} aria-label="Andamento da importação" />
        <p role="status" className="mt-2 text-sm">
          {feitos.toLocaleString('pt-BR')} de {records.length.toLocaleString('pt-BR')} linhas · {resumo.created} criados · {resumo.updated} atualizados ·{' '}
          {resumo.skipped} pulados
        </p>
        {!pronto && <p className="mt-1 text-xs text-muted-foreground">Não feche esta página até terminar.</p>}
        {pronto && todosProblemas.length > 0 && <Problemas lista={todosProblemas} />}
        {pronto && (
          <div className="mt-5 flex gap-2">
            <Link href="/crm/leads" className="btn-primary btn-md">
              Ver os leads
            </Link>
            <Link href="/crm" className="btn-ghost btn-md">
              Abrir o funil
            </Link>
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="passo-titulo" className="rounded-xl border border-border bg-card p-6">
      <h3 id="passo-titulo" ref={titulo} tabIndex={-1} className="text-base font-semibold outline-none">
        Conferir antes de importar
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {records.length.toLocaleString('pt-BR')} leads prontos para entrar
        {problems.length > 0 ? ` · ${problems.length} linhas vão ficar de fora` : ''}. Importar não dispara automações nem o robô.
      </p>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label htmlFor={`${id}-funil`} className="text-sm font-medium">
              Funil para quem não diz o funil
            </label>
            <select
              id={`${id}-funil`}
              className={`${ctl} mt-1 w-full`}
              value={pipelineId}
              onChange={(e) => {
                setPipelineId(e.target.value);
                void conferir(e.target.value);
              }}
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Telefone que já tem lead aberto</legend>
            <div className="mt-1 space-y-1.5">
              {DUPLICADOS.map((d) => (
                <label key={d.value} htmlFor={`${id}-dup-${d.value}`} className="flex items-start gap-2 text-sm">
                  <input
                    id={`${id}-dup-${d.value}`}
                    type="radio"
                    name={`${id}-dup`}
                    className="mt-1"
                    checked={duplicates === d.value}
                    onChange={() => setDuplicates(d.value)}
                  />
                  <span className="font-medium">
                    {d.label} <span className="font-normal text-muted-foreground">· {d.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
            <span>
              Criar os funis e as etapas que a planilha cita e ainda não existem
              <span className="block text-xs text-muted-foreground">Desmarcado, o lead entra na primeira etapa do funil escolhido.</span>
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm" aria-live="polite" aria-busy={carregando}>
          {carregando || !preview ? (
            <p className="text-muted-foreground">Conferindo a planilha…</p>
          ) : (
            <ul className="space-y-2">
              <li>
                <strong>{preview.duplicates}</strong> telefones já têm lead aberto
              </li>
              {preview.newPipelines.length > 0 && (
                <li>
                  Funis novos: {preview.newPipelines.join(', ')}
                  {!createMissing && <span className="text-muted-foreground"> (não serão criados)</span>}
                </li>
              )}
              {preview.newStages.length > 0 && (
                <li>
                  Etapas novas: {preview.newStages.slice(0, 8).map((s) => `${s.stage} (${s.pipeline})`).join(', ')}
                  {preview.newStages.length > 8 ? ` e mais ${preview.newStages.length - 8}` : ''}
                  {!createMissing && <span className="text-muted-foreground"> (não serão criadas)</span>}
                </li>
              )}
              {preview.newTags.length > 0 && <li>Tags novas: {preview.newTags.slice(0, 12).join(', ')}{preview.newTags.length > 12 ? '…' : ''}</li>}
              {novosCampos.length > 0 && (
                <li>
                  Campos novos: {novosCampos.map((c) => `${c.name} (${c.type === 'SELECT' ? 'lista' : 'texto'})`).join(', ')}
                </li>
              )}
              {preview.unknownResponsibles.length > 0 && (
                <li>
                  Responsáveis que não estão na equipe (o lead fica sem responsável): {preview.unknownResponsibles.slice(0, 8).join(', ')}
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {problems.length > 0 && <Problemas lista={problems} />}

      <div className="mt-5 flex justify-between gap-2">
        <button type="button" onClick={onVoltar} className="btn-ghost btn-md">
          Voltar
        </button>
        <button type="button" onClick={importar} disabled={records.length === 0 || carregando} className="btn-primary btn-md">
          Importar {records.length.toLocaleString('pt-BR')} leads
        </button>
      </div>
    </section>
  );
}

function Problemas({ lista }: { lista: { line: number; message: string }[] }) {
  return (
    <details className="mt-4 rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {lista.length} {lista.length === 1 ? 'aviso' : 'avisos'} por linha
      </summary>
      <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-muted-foreground">
        {lista.slice(0, 300).map((p, i) => (
          <li key={i}>
            Linha {p.line}: {p.message}
          </li>
        ))}
        {lista.length > 300 && <li>… e mais {lista.length - 300}.</li>}
      </ul>
    </details>
  );
}
