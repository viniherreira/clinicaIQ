import { after } from 'next/server';

/**
 * Roda depois da resposta (o `after()` do Next), sem atrasar quem clicou.
 * Fora de uma requisição (testes, scripts), roda solto. A tarefa não pode
 * lançar: quem chama garante (ex.: `reportConversion`).
 */
export function runAfter(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
