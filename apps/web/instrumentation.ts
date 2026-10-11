/**
 * Ao subir o servidor. O código do Node fica num arquivo à parte e só é
 * importado no runtime do Node: o build da borda (edge) não pode nem enxergar
 * o import, senão tenta empacotar `node:crypto`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
