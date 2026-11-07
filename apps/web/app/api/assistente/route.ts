import { after, NextResponse } from 'next/server';
import { currentAccess } from '@/lib/guard';
import { getTenantAccess, getTenantModules } from '@/lib/access';
import { reportError } from '@/lib/observability';
import { assistenteLiberado, checarLimites } from '@/assistente/acesso';
import { lerPedido, prepararTurno, rodarTurno, SEPARADOR_FIM } from '@/assistente/turno';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Só clínica com a Agenda contratada e a assinatura em dia (nada de modo somente leitura). */
async function assinaturaOk(tenantId: string) {
  const [access, modules] = await Promise.all([getTenantAccess(tenantId), getTenantModules(tenantId)]);
  return access.level === 'full' && modules.clinic;
}

export async function POST(req: Request) {
  const acesso = await currentAccess();
  // 404, e não 403: para quem não está no piloto, a rota não existe.
  if (!acesso || !(await assistenteLiberado(acesso.tenantId)) || !(await assinaturaOk(acesso.tenantId))) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  }
  const pedido = lerPedido(await req.json().catch(() => null));
  if (!pedido.ok) return NextResponse.json({ erro: pedido.erro }, { status: 400 });

  const limite = await checarLimites(acesso.tenantId, acesso.userId);
  if (!limite.ok) {
    return NextResponse.json({ erro: limite.mensagem }, { status: 429, headers: { 'Retry-After': String(limite.retryAfter) } });
  }

  const preparo = await prepararTurno({ tenantId: acesso.tenantId, userId: acesso.userId, conversaId: pedido.conversaId });
  if (!preparo.ok) return NextResponse.json({ erro: preparo.erro }, { status: preparo.status });

  const codificador = new TextEncoder();
  let turno: Promise<void> | undefined;
  // Se a tela fecha, o turno continua: ainda grava o histórico e a auditoria.
  let fechado = false;
  const corpo = new ReadableStream<Uint8Array>({
    start(controller) {
      const escrever = (t: string) => {
        if (fechado) return;
        try {
          controller.enqueue(codificador.encode(t));
        } catch {
          fechado = true;
        }
      };
      const encerrar = () => {
        if (fechado) return;
        fechado = true;
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      };
      turno = (async () => {
        try {
          const r = await rodarTurno({
            tenantId: acesso.tenantId,
            userId: acesso.userId,
            role: acesso.role,
            pergunta: pedido.pergunta,
            historico: preparo.historico,
            conversaId: preparo.conversaId,
            escrever,
          });
          escrever(`\n${SEPARADOR_FIM}${JSON.stringify(r)}`);
        } catch (e) {
          reportError(e, { area: 'assistente', tenantId: acesso.tenantId });
          escrever(`\n${SEPARADOR_FIM}${JSON.stringify({ erro: 'Algo deu errado ao responder. Tente de novo.' })}`);
        } finally {
          encerrar();
        }
      })();
    },
    cancel() {
      fechado = true;
    },
  });
  // start() roda dentro do construtor: `turno` já existe. O after() segura a função viva
  // na Vercel mesmo se o cliente fechar a tela e a resposta terminar.
  if (turno) after(turno);
  return new Response(corpo, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
