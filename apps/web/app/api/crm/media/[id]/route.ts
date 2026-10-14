import { NextResponse } from 'next/server';
import { guardCrmAction } from '@/crm/guard';
import { activeCloudAccount, cloudClient } from '@/crm/cloud';
import { fileNameOf, isStoredRef, readChatMedia } from '@/crm/media-store';
import { mediaResponseHeaders } from '@/crm/media-rules';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Abre a foto, o áudio ou o documento de uma mensagem. O que a equipe mandou
 * está guardado no DreamClin (`crm/media-store.ts`); o que chegou pela API
 * oficial é buscado na Meta na hora e repassado, sem guardar. Mesmas travas do CRM.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return NextResponse.json({ error: g.message }, { status: 403 });
  const { id } = await params;

  const msg = await g.db.chatMessage.findFirst({ where: { id }, select: { mediaRef: true, mimeType: true } });
  if (!msg?.mediaRef) return NextResponse.json({ error: 'sem mídia' }, { status: 404 });

  if (isStoredRef(msg.mediaRef)) {
    const file = await readChatMedia(msg.mediaRef);
    if (!file) return NextResponse.json({ error: 'O arquivo não está mais disponível.' }, { status: 410 });
    return new NextResponse(file.bytes, {
      headers: mediaResponseHeaders(msg.mimeType || file.contentType, fileNameOf(msg.mediaRef)),
    });
  }

  const account = await activeCloudAccount(g.tenantId);
  if (!account) return NextResponse.json({ error: 'API oficial desconectada' }, { status: 409 });

  try {
    const api = cloudClient(account);
    const info = await api.getMediaInfo(msg.mediaRef);
    const file = await api.downloadMedia(info.url);
    // O tipo aqui é o que o contato mandou: só abre na tela o que é seguro.
    return new NextResponse(file.body, {
      headers: mediaResponseHeaders(info.mime_type || msg.mimeType),
    });
  } catch {
    // A Meta guarda a mídia por um tempo limitado.
    return NextResponse.json({ error: 'A mídia não está mais disponível na Meta.' }, { status: 410 });
  }
}
