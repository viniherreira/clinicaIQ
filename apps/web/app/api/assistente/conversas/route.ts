import { NextResponse } from 'next/server';
import { currentAccess } from '@/lib/guard';
import { getTenantAccess, getTenantModules } from '@/lib/access';
import { reportError } from '@/lib/observability';
import { assistenteLiberado } from '@/assistente/acesso';
import { carregarHistorico, listarConversas } from '@/assistente/historico';
import { ERRO_CONVERSA_ILEGIVEL } from '@/assistente/mensagens-erro';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const acesso = await currentAccess();
  if (!acesso || !(await assistenteLiberado(acesso.tenantId))) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  }
  const [access, modules] = await Promise.all([getTenantAccess(acesso.tenantId), getTenantModules(acesso.tenantId)]);
  if (access.level !== 'full' || !modules.clinic) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ conversas: await listarConversas(acesso.tenantId, acesso.userId) });
  try {
    const mensagens = await carregarHistorico(acesso.tenantId, acesso.userId, id);
    if (!mensagens) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
    return NextResponse.json({ mensagens });
  } catch (e) {
    reportError(e, { area: 'assistente', tenantId: acesso.tenantId, etapa: 'carregarHistorico' });
    return NextResponse.json({ erro: ERRO_CONVERSA_ILEGIVEL }, { status: 409 });
  }
}
