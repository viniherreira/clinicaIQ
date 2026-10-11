import { NextResponse } from 'next/server';
import { guardCrmAction } from '@/crm/guard';
import { activeCloudAccount, cloudClient } from '@/crm/cloud';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Abre a foto, o áudio ou o documento de uma mensagem da API oficial. Busca na
 * Meta na hora e repassa: nada fica guardado no ClinicaIQ. Mesmas travas do CRM.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCrmAction('crm', { write: false });
  if (!g.ok) return NextResponse.json({ error: g.message }, { status: 403 });
  const { id } = await params;

  const msg = await g.db.chatMessage.findFirst({ where: { id }, select: { mediaRef: true, mimeType: true } });
  if (!msg?.mediaRef) return NextResponse.json({ error: 'sem mídia' }, { status: 404 });
  const account = await activeCloudAccount(g.tenantId);
  if (!account) return NextResponse.json({ error: 'API oficial desconectada' }, { status: 409 });

  try {
    const api = cloudClient(account);
    const info = await api.getMediaInfo(msg.mediaRef);
    const file = await api.downloadMedia(info.url);
    return new NextResponse(file.body, {
      headers: {
        'content-type': info.mime_type || msg.mimeType || 'application/octet-stream',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    // A Meta guarda a mídia por um tempo limitado.
    return NextResponse.json({ error: 'A mídia não está mais disponível na Meta.' }, { status: 410 });
  }
}
