/**
 * Contas de desenho dos gráficos, usadas no servidor e no navegador.
 */

/** O brilho de uma marca: forte no escuro, quase nada no claro (`--viz-glow`). */
export const glow = (color: string, px = 10) => `0 0 ${px}px color-mix(in srgb, ${color} calc(var(--viz-glow) * 100%), transparent)`;

/** Curva suave que não passa do ponto (tangentes pela média harmônica). */
export function smoothPath(p: readonly (readonly [number, number])[]): string {
  const n = p.length;
  if (n === 0) return '';
  if (n === 1) return `M${p[0][0]} ${p[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1][0] - p[i][0];
    m[i] = dx[i] === 0 ? 0 : (p[i + 1][1] - p[i][1]) / dx[i];
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (2 * m[i - 1] * m[i]) / (m[i - 1] + m[i]);
  t[n - 1] = m[n - 2];
  let d = `M${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(p[i][0] + h).toFixed(2)} ${(p[i][1] + t[i] * h).toFixed(2)} ${(p[i + 1][0] - h).toFixed(2)} ${(p[i + 1][1] - t[i + 1] * h).toFixed(2)} ${p[i + 1][0].toFixed(2)} ${p[i + 1][1].toFixed(2)}`;
  }
  return d;
}
