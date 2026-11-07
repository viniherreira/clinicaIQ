import { NextResponse } from 'next/server';
import { currentAccess } from '@/lib/guard';
import { reportError } from '@/lib/observability';
import { assistenteLiberado, checarLimites } from '@/assistente/acesso';
import { lerPedido, rodarTurno, SEPARADOR_FIM } from '@/assistente/turno';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const acesso = await currentAccess();
  // 404, e não 403: para quem não está no piloto, a rota não existe.
  if (!acesso || !(await assistenteLiberado(acesso.tenantId))) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  }
  const pedido = lerPedido(await req.json().catch(() => null));
  if (!pedido.ok) return NextResponse.json({ erro: pedido.erro }, { status: 400 });

  const limite = await checarLimites(acesso.tenantId, acesso.userId);
  if (!limite.ok) {
    return NextResponse.json({ erro: limite.mensagem }, { status: 429, headers: { 'Retry-After': String(limite.retryAfter) } });
  }

  const codificador = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const corpo = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  let escreveu = false;
  let avisarEscrita: () => void = () => undefined;
  const primeiraEscrita = new Promise<'escreveu'>((resolve) => {
    avisarEscrita = () => resolve('escreveu');
  });
  const escrever = (t: string) => {
    escreveu = true;
    avisarEscrita();
    controller.enqueue(codificador.encode(t));
  };

  const turno = rodarTurno({ ...acesso, pergunta: pedido.pergunta, conversaId: pedido.conversaId, escrever }).catch((e) => {
    reportError(e, { area: 'assistente', tenantId: acesso.tenantId });
    return { erro: 'Algo deu errado ao responder. Tente de novo.', status: 500 };
  });

  // Erros que vêm antes de qualquer texto (conversa que não existe ou ilegível)
  // saem como JSON, com o status certo, e não como um stream de 200.
  const primeiro = await Promise.race([turno, primeiraEscrita]);
  if (primeiro !== 'escreveu' && 'erro' in primeiro && !escreveu) {
    return NextResponse.json({ erro: primeiro.erro }, { status: primeiro.status });
  }

  void turno.then((r) => {
    const fim = 'erro' in r ? { erro: r.erro } : r;
    if ('erro' in r) escrever(r.erro);
    escrever(`\n${SEPARADOR_FIM}${JSON.stringify(fim)}`);
    controller.close();
  });
  return new Response(corpo, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
