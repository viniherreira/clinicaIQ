import { describe, expect, it } from 'vitest';
import { csvCell, parseCsv, toCsv } from './csv';

describe('escrever CSV para o Excel', () => {
  it('aspas, separador e quebra de linha', () => {
    expect(csvCell('Ana; Paula')).toBe('"Ana; Paula"');
    expect(csvCell('Disse "oi"')).toBe('"Disse ""oi"""');
    expect(csvCell('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    expect(csvCell('simples')).toBe('simples');
    expect(csvCell(null)).toBe('');
  });

  it('número com vírgula decimal (Excel em português)', () => {
    expect(csvCell(1234.5)).toBe('1234,5');
  });

  it('texto que parece fórmula não vira fórmula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+55 11 9999')).toBe("'+55 11 9999");
    expect(csvCell('-5')).toBe("'-5");
  });

  it('BOM, cabeçalho e CRLF', () => {
    expect(toCsv(['Nome', 'Valor'], [['Ana', 10], ['Bia', null]])).toBe('﻿Nome;Valor\r\nAna;10\r\nBia;\r\n');
  });
});

describe('ler CSV', () => {
  it('ponto e vírgula, aspas e quebra dentro da célula', () => {
    expect(parseCsv('﻿Nome;Obs\r\nAna;"oi; tudo\nbem"\r\nBia;"ele disse ""sim"""\r\n')).toEqual([
      ['Nome', 'Obs'],
      ['Ana', 'oi; tudo\nbem'],
      ['Bia', 'ele disse "sim"'],
    ]);
  });

  it('vírgula como separador (CSV em inglês) e linhas vazias de fora', () => {
    expect(parseCsv('Name,Phone\nAna,11999\n\n')).toEqual([
      ['Name', 'Phone'],
      ['Ana', '11999'],
    ]);
  });

  it('ida e volta', () => {
    const csv = toCsv(['A', 'B'], [['x;y', 'z "q"']]);
    expect(parseCsv(csv)).toEqual([
      ['A', 'B'],
      ['x;y', 'z "q"'],
    ]);
  });
});
