import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYMBOL_BODY, SYMBOL_D, SYMBOL_STAR, WORDMARK_CLIN, WORDMARK_DREAM } from './logo-paths';

/**
 * O favicon e os arquivos de `public/brand/` são cópias do desenho de
 * `logo-paths.ts`. Mudou a logo? Gere os arquivos de novo.
 */
const root = path.resolve(__dirname, '..');
const brandDir = path.join(root, 'public', 'brand');
const svgs = [
  path.join(root, 'app', 'icon.svg'),
  ...readdirSync(brandDir)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => path.join(brandDir, f)),
];

describe('arquivos da logo', () => {
  it.each(svgs.map((f) => [path.relative(root, f), f]))('%s usa o símbolo do código', (_, file) => {
    const svg = readFileSync(file, 'utf8');
    for (const d of [SYMBOL_D, SYMBOL_BODY, SYMBOL_STAR]) expect(svg).toContain(d);
  });

  it('as versões com nome usam o nome do código', () => {
    const comNome = svgs.filter((f) => /horizontal|vertical/.test(f));
    expect(comNome.length).toBeGreaterThan(0);
    for (const f of comNome) {
      const svg = readFileSync(f, 'utf8');
      expect(svg).toContain(WORDMARK_DREAM);
      expect(svg).toContain(WORDMARK_CLIN);
    }
  });
});
