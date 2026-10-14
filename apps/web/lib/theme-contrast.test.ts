import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Confere o contraste (WCAG 2.1 AA) dos pares de cor que as telas usam, em cada
 * tema, lendo os tokens direto do globals.css. Trocar uma cor que derrube um
 * texto abaixo de 4,5:1 quebra este teste antes de chegar à tela.
 */

const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`bloco ${selector} não encontrado`);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const root = block(':root');
const dark = block('.dark');
const hc = block('.high-contrast');
const darkHc = block('.dark.high-contrast');
const navy = block('.dark.crm-navy:not(.high-contrast)');

const THEMES = {
  claro: { ...root },
  escuro: { ...root, ...dark },
  'alto contraste': { ...root, ...hc },
  'alto contraste escuro': { ...root, ...dark, ...hc, ...darkHc },
  'CRM marinho': { ...root, ...dark, ...navy },
};

function hslToRgb(value: string): [number, number, number] {
  const [h, s, l] = value.replace(/%/g, '').split(/\s+/).map(Number);
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

function luminance(value: string) {
  const [r, g, b] = hslToRgb(value).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Texto sobre fundo: 4,5:1. */
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'canvas'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'canvas'],
  ['muted-foreground', 'surface-alt'],
  ['primary-foreground', 'primary'],
  ['primary-foreground', 'primary-hover'],
  ['accent-foreground', 'accent'],
  ['link', 'card'],
  ['link', 'background'],
  ['rail-foreground', 'rail'],
];

/** `text-primary` como texto. No CRM ele vira `--link` (globals.css). */
const PRIMARY_TEXT_PAIRS: [string, string][] = [
  ['primary', 'background'],
  ['primary', 'card'],
  ['primary', 'canvas'],
];

describe.each(Object.entries(THEMES))('contraste no tema %s', (name, vars) => {
  const pairs = name === 'CRM marinho' ? TEXT_PAIRS : [...TEXT_PAIRS, ...PRIMARY_TEXT_PAIRS];

  it.each(pairs)('%s sobre %s passa de 4,5:1', (fg, bg) => {
    expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('o anel de foco passa de 3:1 sobre o fundo', () => {
    expect(ratio(vars.ring, vars.background)).toBeGreaterThanOrEqual(3);
  });
});
