'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, ImagePlus, Lock, Trash2, UploadCloud, X } from 'lucide-react';
import { uploadPatientFile, deletePatientFile, type UploadFileState } from '../actions';
import { CLINIC_TZ } from '@/lib/tz';

interface FileItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  createdAt: Date | string;
  url: string | null;
}

interface Props {
  patientId: string;
  files: FileItem[];
  storageEnabled: boolean;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const dateBR = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: CLINIC_TZ });
const isImage = (f: FileItem) => f.mimeType.startsWith('image/');

/**
 * Radiografias, fotos e documentos do paciente: arrastar para enviar, galeria
 * com filtro e um visualizador que passa de uma imagem para outra pelas setas.
 */
export function ImagesSection({ patientId, files, storageEnabled }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [filtro, setFiltro] = useState<'all' | 'img' | 'doc'>('all');
  const [aberta, setAberta] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const action = uploadPatientFile.bind(null, patientId);
  const [state, formAction, pending] = useActionState<UploadFileState | null, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setFileName(null);
      router.refresh();
    }
  }, [state, router]);

  function remove(id: string) {
    setConfirmDelete(null);
    setAberta(null);
    startDelete(async () => {
      await deletePatientFile(id, patientId);
      router.refresh();
    });
  }

  if (!storageEnabled) {
    return (
      <div className="flex justify-center py-8">
        <div className="max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold">Imagens e documentos</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Guarde radiografias, fotos e documentos do paciente com segurança. Para ativar, o administrador precisa configurar a chave de
            armazenamento (Supabase Storage) no servidor.
          </p>
        </div>
      </div>
    );
  }

  const images = files.filter(isImage);
  const docs = files.filter((f) => !isImage(f));
  const galeria = images.filter((f) => f.url);
  const atual = aberta != null ? galeria[aberta] : null;

  return (
    <div className="space-y-4">
      {/* Enviar */}
      <form ref={formRef} action={formAction} className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        {state && !state.ok && (
          <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              const f = e.dataTransfer.files?.[0];
              if (f && inputRef.current) {
                const dt = new DataTransfer();
                dt.items.add(f);
                inputRef.current.files = dt.files;
                setFileName(f.name);
              }
            }}
            className={[
              'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
              arrastando ? 'border-primary bg-primary/5' : fileName ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-surface-alt/50',
            ].join(' ')}
          >
            <UploadCloud className={`h-8 w-8 ${fileName ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
            <span className="text-sm font-medium">{fileName ?? 'Arraste o arquivo aqui ou clique para escolher'}</span>
            <span className="text-xs text-muted-foreground">JPG, PNG, WEBP, HEIC ou PDF · até 10 MB</span>
            <input
              ref={inputRef}
              type="file"
              name="file"
              required
              accept={ACCEPT}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="sr-only"
            />
          </label>
          <div className="flex flex-col justify-between gap-3">
            <div>
              <label htmlFor="file-desc" className="text-xs font-medium text-muted-foreground">
                Descrição
              </label>
              <input
                id="file-desc"
                type="text"
                name="description"
                maxLength={200}
                placeholder="Ex: RX panorâmica inicial, foto do sorriso antes"
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Guardado com acesso restrito (LGPD)
              </p>
              <button type="submit" disabled={pending || !fileName} className="btn-primary btn-md">
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                {pending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {files.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
          <ImagePlus className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm text-muted-foreground">Nenhum arquivo ainda. Radiografias e fotos do caso ficam guardadas aqui.</p>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Mostrar" className="inline-flex rounded-lg bg-surface-alt p-0.5">
            {(
              [
                ['all', `Todos (${files.length})`],
                ['img', `Imagens (${images.length})`],
                ['doc', `Documentos (${docs.length})`],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={filtro === k}
                onClick={() => setFiltro(k)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring ${
                  filtro === k ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {filtro !== 'doc' && images.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {images.map((f) => (
                <li key={f.id} className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                  {f.url ? (
                    <button
                      type="button"
                      onClick={() => setAberta(galeria.findIndex((g) => g.id === f.id))}
                      className="relative block w-full overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      aria-label={`Ver ${f.description || f.filename}`}
                    >
                      {/* URLs assinadas expiram: <img> simples, sem o cache do next/image. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt="" loading="lazy" className="aspect-square w-full bg-surface-alt object-cover transition-transform duration-300 group-hover:scale-105" />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    </button>
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-xs text-muted-foreground">indisponível</div>
                  )}
                  <div className="p-2.5">
                    <p className="truncate text-xs font-medium">{f.description || f.filename}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {dateBR(f.createdAt)} · {fmtSize(f.sizeBytes)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {filtro !== 'img' && docs.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              <ul className="divide-y divide-border">
                {docs.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.description || f.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {dateBR(f.createdAt)} · {fmtSize(f.sizeBytes)}
                      </p>
                    </div>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${f.filename}`} className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                    {confirmDelete === f.id ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <button type="button" onClick={() => setConfirmDelete(null)} className="rounded border border-border px-2 py-0.5 hover:bg-surface-alt">
                          Não
                        </button>
                        <button type="button" disabled={isDeleting} onClick={() => remove(f.id)} className="rounded bg-destructive px-2 py-0.5 font-medium text-white hover:bg-destructive/90">
                          Sim, excluir
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(f.id)}
                        aria-label={`Excluir ${f.filename}`}
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Visualizador */}
      <Dialog.Root
        open={atual != null}
        onOpenChange={(v) => {
          if (!v) {
            setAberta(null);
            setConfirmDelete(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85" />
          <Dialog.Content
            className="fixed inset-0 z-50 flex flex-col focus:outline-none"
            onKeyDown={(e) => {
              if (aberta == null) return;
              if (e.key === 'ArrowRight') setAberta((aberta + 1) % galeria.length);
              if (e.key === 'ArrowLeft') setAberta((aberta - 1 + galeria.length) % galeria.length);
            }}
          >
            {atual && (
              <>
                <div className="flex items-center gap-3 px-4 py-3 text-white">
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="truncate text-sm font-semibold">{atual.description || atual.filename}</Dialog.Title>
                    <Dialog.Description className="text-xs text-white/70">
                      {dateBR(atual.createdAt)} · {fmtSize(atual.sizeBytes)} · {aberta! + 1} de {galeria.length}
                    </Dialog.Description>
                  </div>
                  <a href={atual.url!} target="_blank" rel="noreferrer" download={atual.filename} aria-label="Baixar" className="rounded-lg p-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
                    <Download className="h-5 w-5" aria-hidden="true" />
                  </a>
                  {confirmDelete === atual.id ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      Excluir?
                      <button type="button" onClick={() => setConfirmDelete(null)} className="rounded border border-white/30 px-2 py-0.5 hover:bg-white/10">
                        Não
                      </button>
                      <button type="button" disabled={isDeleting} onClick={() => remove(atual.id)} className="rounded bg-destructive px-2 py-0.5 font-medium text-white">
                        Sim
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(atual.id)} aria-label="Excluir imagem" className="rounded-lg p-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </button>
                  )}
                  <Dialog.Close aria-label="Fechar" className="rounded-lg p-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={atual.url!} alt={atual.description || atual.filename} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
                  {galeria.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAberta((aberta! - 1 + galeria.length) % galeria.length)}
                        aria-label="Imagem anterior"
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white sm:left-4"
                      >
                        <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAberta((aberta! + 1) % galeria.length)}
                        aria-label="Próxima imagem"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white sm:right-4"
                      >
                        <ChevronRight className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
