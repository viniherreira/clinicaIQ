/**
 * Ao subir o servidor. O código do Node fica num arquivo à parte e só é
 * importado no runtime do Node: o build da borda (edge) não pode nem enxergar
 * o import, senão tenta empacotar `node:crypto`.
 */
import type { Instrumentation } from 'next';
import { reportError } from './lib/observability';

/**
 * Todo erro que escapa de server action, página ou rota de API passa por aqui.
 * Vai a rota como padrão (`/orcamento/[token]`), nunca o endereço de verdade:
 * o link do orçamento e os ids não saem do sistema.
 */
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  reportError(err, {
    rota: context.routePath,
    tipo: context.routeType,
    metodo: request.method,
    ...(err && typeof err === 'object' && 'digest' in err && typeof err.digest === 'string' ? { digest: err.digest } : {}),
  });
};

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
