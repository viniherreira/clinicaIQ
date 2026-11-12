import { describe, expect, it } from 'vitest';
import { asReportPeriod, bucketDays, dayCount, daysOf, reportRange, sumByBucket } from './report-period';

// 11/11/2026, 15h em Brasília.
const AGORA = new Date('2026-11-11T18:00:00Z');

describe('período das telas de números', () => {
  it('30 dias: hoje conta, e o anterior é o trecho de mesmo tamanho logo antes', () => {
    const r = reportRange('30d', AGORA);
    expect([r.current.since, r.current.until]).toEqual(['2026-10-13', '2026-11-11']);
    expect([r.previous.since, r.previous.until]).toEqual(['2026-09-13', '2026-10-12']);
    expect(dayCount(r.current)).toBe(30);
    expect(dayCount(r.previous)).toBe(30);
    // Meia-noite de Brasília, com o fim excluso.
    expect(r.current.from.toISOString()).toBe('2026-10-13T03:00:00.000Z');
    expect(r.current.to.toISOString()).toBe('2026-11-12T03:00:00.000Z');
  });

  it('hoje compara com ontem', () => {
    const r = reportRange('hoje', AGORA);
    expect([r.current.since, r.current.until, r.previous.since, r.previous.until]).toEqual([
      '2026-11-11',
      '2026-11-11',
      '2026-11-10',
      '2026-11-10',
    ]);
  });

  it('este mês compara com os mesmos dias do mês passado', () => {
    const r = reportRange('mes', AGORA);
    expect([r.current.since, r.current.until]).toEqual(['2026-11-01', '2026-11-11']);
    expect([r.previous.since, r.previous.until]).toEqual(['2026-10-01', '2026-10-11']);
    // Dia 31 de março: fevereiro não tem 31, então vai até o fim de fevereiro.
    const marco = reportRange('mes', new Date('2026-03-31T18:00:00Z'));
    expect([marco.previous.since, marco.previous.until]).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('mês passado inteiro contra o mês anterior inteiro', () => {
    const r = reportRange('mes_passado', AGORA);
    expect([r.current.since, r.current.until]).toEqual(['2026-10-01', '2026-10-31']);
    expect([r.previous.since, r.previous.until]).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('perto da meia-noite vale o dia da clínica, não o do servidor', () => {
    // 01:30 UTC do dia 12 ainda é dia 11 em Brasília.
    expect(reportRange('hoje', new Date('2026-11-12T01:30:00Z')).current.since).toBe('2026-11-11');
  });

  it('período desconhecido cai no padrão', () => {
    expect(asReportPeriod('xyz')).toBe('30d');
    expect(asReportPeriod(undefined)).toBe('30d');
    expect(asReportPeriod('90d')).toBe('90d');
  });

  it('agrupa os dias para caber no gráfico e soma dentro de cada grupo', () => {
    const dias = daysOf({ since: '2026-11-01', until: '2026-11-10' });
    expect(bucketDays(dias, 31)).toHaveLength(10);
    const grupos = bucketDays(dias, 4);
    expect(grupos.map((g) => g.label)).toEqual(['01/11 a 03/11', '04/11 a 06/11', '07/11 a 09/11', '10/11']);
    const porDia = new Map([
      ['2026-11-01', 2],
      ['2026-11-03', 5],
      ['2026-11-10', 1],
      ['2026-12-25', 99],
    ]);
    expect(sumByBucket(grupos, porDia)).toEqual([7, 0, 0, 1]);
    expect(bucketDays([], 10)).toEqual([]);
  });
});
