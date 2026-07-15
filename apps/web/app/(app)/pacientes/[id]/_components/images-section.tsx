'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ImagePlus, Trash2, Lock, ExternalLink } from 'lucide-react';
import { uploadPatientFile, deletePatientFile, type UploadFileState } from '../actions';

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

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImagesSection({ patientId, files, storageEnabled }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
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
    startDelete(async () => {
      await deletePatientFile(id, patientId);
      router.refresh();
    });
  }

  if (!storageEnabled) {
    return (
      <div className="flex justify-center py-8">
        <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold">Imagens e documentos</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Guarde radiografias, fotos e documentos do paciente com segurança.
            Para ativar, o administrador precisa configurar a chave de armazenamento
            (Supabase Storage) no servidor.
          </p>
        </div>
      </div>
    );
  }

  const images = files.filter((f) => f.mimeType.startsWith('image/'));
  const docs = files.filter((f) => !f.mimeType.startsWith('image/'));

  return (
    <div className="space-y-4">
      {/* Upload */}
      <form ref={formRef} action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="text-sm font-semibold">Adicionar imagem ou documento</h2>
        {state && !state.ok && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.message}</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="btn-outline btn-md cursor-pointer sm:shrink-0">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {fileName ? 'Trocar arquivo' : 'Escolher arquivo'}
            <input
              type="file"
              name="file"
              required
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="sr-only"
            />
          </label>
          {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
          <input
            type="text"
            name="description"
            maxLength={200}
            placeholder="Descrição (ex: RX panorâmica inicial)"
            aria-label="Descrição do arquivo"
            className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <button type="submit" disabled={pending} className="btn-primary btn-md sm:shrink-0">
            {pending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, HEIC ou PDF · até 10 MB · armazenado com acesso restrito (LGPD)</p>
      </form>

      {/* Gallery */}
      {images.length === 0 && docs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum arquivo ainda. Radiografias e fotos do caso ficam guardadas aqui.
        </p>
      ) : (
        <>
          {images.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((f) => (
                <li key={f.id} className="group overflow-hidden rounded-xl border border-border bg-surface shadow-card">
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer" className="block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                      {/* Signed URLs expire, so plain <img> (not next/image cache) */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={f.description || f.filename}
                        loading="lazy"
                        className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]"
                      />
                    </a>
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-xs text-muted-foreground">indisponível</div>
                  )}
                  <div className="flex items-start justify-between gap-1 p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{f.description || f.filename}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(f.createdAt).toLocaleDateString('pt-BR')} · {fmtSize(f.sizeBytes)}
                      </p>
                    </div>
                    {confirmDelete === f.id ? (
                      <span className="flex shrink-0 items-center gap-1 text-[11px]">
                        <button type="button" onClick={() => setConfirmDelete(null)} className="rounded border border-border px-1.5 py-0.5 hover:bg-surface-alt">Não</button>
                        <button type="button" disabled={isDeleting} onClick={() => remove(f.id)} className="rounded bg-destructive px-1.5 py-0.5 font-medium text-white hover:bg-destructive/90">Sim</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(f.id)}
                        aria-label={`Excluir ${f.description || f.filename}`}
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {docs.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Documentos</p>
              <ul className="divide-y divide-border">
                {docs.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.description || f.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(f.createdAt).toLocaleDateString('pt-BR')} · {fmtSize(f.sizeBytes)}
                      </p>
                    </div>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${f.filename}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                    {confirmDelete === f.id ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <button type="button" onClick={() => setConfirmDelete(null)} className="rounded border border-border px-2 py-0.5 hover:bg-surface-alt">Não</button>
                        <button type="button" disabled={isDeleting} onClick={() => remove(f.id)} className="rounded bg-destructive px-2 py-0.5 font-medium text-white hover:bg-destructive/90">Sim</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(f.id)}
                        aria-label={`Excluir ${f.filename}`}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
    </div>
  );
}
