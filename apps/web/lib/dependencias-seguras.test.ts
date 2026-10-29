import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * Versões mínimas das dependências que ficam de frente para a internet.
 *
 * O Next 15.5.18 tinha falhas públicas que dispensam login: derrubar o site
 * chamando Server Actions, descobrir endpoints internos de Server Actions e
 * executar código pelo otimizador de imagem (SVG/AVIF). Todas corrigidas até
 * a 15.5.28. O `^15` do package.json aceita a versão boa, mas não a exige: o
 * lockfile segurava a antiga. Este teste é a trava.
 */

const require = createRequire(import.meta.url);

function versao(pacote: string): [number, number, number] {
  const { version } = require(`${pacote}/package.json`) as { version: string };
  const [maior, menor, correcao] = version.split('-')[0].split('.').map(Number);
  return [maior, menor, correcao];
}

function peloMenos(atual: [number, number, number], minimo: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (atual[i] !== minimo[i]) return atual[i] > minimo[i];
  }
  return true;
}

describe('dependências com falhas conhecidas', () => {
  it('next está na 15.5.28 ou acima', () => {
    expect(peloMenos(versao('next'), [15, 5, 28])).toBe(true);
  });
});
