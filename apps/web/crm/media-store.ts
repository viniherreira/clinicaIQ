import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { deleteObject, downloadObject, storageEnabled, uploadObject } from '@/lib/storage';
import { safeFileName } from './media-rules';

/**
 * Onde ficam os arquivos que a equipe manda pelo CRM.
 *
 * Em produção, no Supabase Storage (o mesmo depósito privado das fichas, numa
 * pasta da clínica). Sem ele configurado, só no desenvolvimento, numa pasta
 * local fora do git — nunca em produção, onde o disco não dura.
 *
 * A referência gravada na mensagem diz onde está: `store:` ou `local:`. Sem
 * prefixo, é o id de uma mídia que chegou pela Meta (ver `/api/crm/media`).
 */

const LOCAL_DIR = path.join(process.cwd(), '.crm-media');

export const isStoredRef = (ref: string | null | undefined): ref is string =>
  Boolean(ref && (ref.startsWith('store:') || ref.startsWith('local:')));

/** Dá para guardar arquivo aqui? */
export function mediaStoreReady(): boolean {
  return storageEnabled() || process.env.NODE_ENV !== 'production';
}

/** O nome do arquivo, para o WhatsApp mostrar no documento. */
export function fileNameOf(ref: string): string {
  return ref.split('/').pop() ?? 'arquivo';
}

export async function saveChatMedia(tenantId: string, conversationId: string, file: File): Promise<string> {
  const rel = `${tenantId}/crm/${conversationId}/${randomUUID()}/${safeFileName(file.name)}`;
  if (storageEnabled()) {
    await uploadObject(rel, file);
    return `store:${rel}`;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Armazenamento de arquivos não configurado.');
  const destino = path.join(LOCAL_DIR, rel);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, Buffer.from(await file.arrayBuffer()));
  return `local:${rel}`;
}

export async function readChatMedia(ref: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (ref.startsWith('store:')) return downloadObject(ref.slice('store:'.length));
  if (ref.startsWith('local:')) {
    const destino = localPath(ref);
    if (!destino) return null;
    try {
      const buf = await readFile(destino);
      return { bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType: 'application/octet-stream' };
    } catch {
      return null;
    }
  }
  return null;
}

export async function deleteChatMedia(ref: string): Promise<void> {
  if (ref.startsWith('store:')) return deleteObject(ref.slice('store:'.length));
  const destino = localPath(ref);
  if (destino) await rm(destino, { force: true });
}

/** O caminho local, sem deixar sair da pasta (`..` não passa). */
function localPath(ref: string): string | null {
  if (!ref.startsWith('local:')) return null;
  const destino = path.resolve(LOCAL_DIR, ref.slice('local:'.length));
  return destino.startsWith(LOCAL_DIR + path.sep) ? destino : null;
}
