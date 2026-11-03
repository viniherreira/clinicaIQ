import { describe, expect, it } from 'vitest';
import { buildEnvelope, describeError, parseDsn } from './sentry-envelope';

describe('parseDsn', () => {
  it('monta o endereço do envelope', () => {
    expect(parseDsn('https://abc123@o42.ingest.us.sentry.io/4507')).toEqual({
      url: 'https://o42.ingest.us.sentry.io/api/4507/envelope/?sentry_key=abc123&sentry_version=7',
    });
  });

  it('mantém o prefixo de caminho de um Sentry próprio', () => {
    expect(parseDsn('https://k@sentry.exemplo.com/base/9')?.url).toBe(
      'https://sentry.exemplo.com/base/api/9/envelope/?sentry_key=k&sentry_version=7',
    );
  });

  it.each([undefined, '', 'não é url', 'https://sentry.io/123', 'https://k@sentry.io/', 'https://k@sentry.io/abc', 'ftp://k@sentry.io/1'])(
    'recusa %j',
    (dsn) => {
      expect(parseDsn(dsn)).toBeNull();
    },
  );
});

describe('describeError', () => {
  it('lê tipo, mensagem e pilha de um Error', () => {
    const e = new TypeError('x is undefined');
    const d = describeError(e);
    expect(d.type).toBe('TypeError');
    expect(d.value).toBe('x is undefined');
    expect(d.stack).toContain('TypeError');
  });

  it('aceita texto e objeto lançados', () => {
    expect(describeError('falhou')).toEqual({ type: 'Error', value: 'falhou' });
    expect(describeError({ code: 7 })).toEqual({ type: 'Error', value: '{"code":7}' });
  });

  it('corta mensagem enorme', () => {
    expect(describeError(new Error('a'.repeat(10_000))).value.length).toBeLessThanOrEqual(4001);
  });
});

describe('buildEnvelope', () => {
  it('gera cabeçalho, item e evento em três linhas', () => {
    const now = new Date('2026-11-03T12:00:00Z');
    const linhas = buildEnvelope({
      error: new Error('quebrou'),
      eventId: 'a'.repeat(32),
      now,
      environment: 'production',
      tags: { route: '/orcamento/[token]' },
    }).split('\n');
    expect(linhas).toHaveLength(3);
    expect(JSON.parse(linhas[0])).toEqual({ event_id: 'a'.repeat(32), sent_at: '2026-11-03T12:00:00.000Z' });
    expect(JSON.parse(linhas[1])).toEqual({ type: 'event' });
    const ev = JSON.parse(linhas[2]);
    expect(ev.exception.values[0]).toEqual({ type: 'Error', value: 'quebrou' });
    expect(ev.tags).toEqual({ route: '/orcamento/[token]' });
    expect(ev.environment).toBe('production');
    expect(ev.timestamp).toBe(now.getTime() / 1000);
    expect(typeof ev.extra.stack).toBe('string');
  });
});
