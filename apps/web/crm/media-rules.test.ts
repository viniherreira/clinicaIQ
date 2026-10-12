import { describe, expect, it } from 'vitest';
import { checkChatMedia, formatBytes, safeFileName } from './media-rules';

const MB = 1024 * 1024;
const f = (type: string, size: number, name = 'x') => ({ type, size, name });

describe('checkChatMedia', () => {
  it.each([
    ['image/jpeg', 1 * MB, 'IMAGE'],
    ['image/png', 4.9 * MB, 'IMAGE'],
    ['application/pdf', 9 * MB, 'DOCUMENT'],
    ['audio/ogg; codecs=opus', 1 * MB, 'AUDIO'],
    ['video/mp4', 10 * MB, 'VIDEO'],
    ['APPLICATION/PDF', 1000, 'DOCUMENT'],
  ])('%s de %d bytes → %s', (type, size, kind) => {
    expect(checkChatMedia(f(type, size))).toMatchObject({ ok: true, kind });
  });

  it.each([
    ['image/gif', 1000, 'Esse tipo'],
    ['application/zip', 1000, 'Esse tipo'],
    ['', 1000, 'Esse tipo'],
    ['image/jpeg', 6 * MB, 'Foto de até 5 MB'],
    ['video/mp4', 11 * MB, 'até 10 MB'],
    ['application/pdf', 0, 'vazio'],
  ])('%s de %d bytes é recusado', (type, size, msg) => {
    const r = checkChatMedia(f(type, size));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(msg);
  });
});

describe('safeFileName', () => {
  it.each([
    ['Orçamento João.pdf', 'Orcamento-Joao.pdf'],
    ['C:\\fotos\\raio x.png', 'raio-x.png'],
    ['../../etc/passwd', 'passwd'],
    ['...', 'arquivo'],
    ['', 'arquivo'],
  ])('%s → %s', (entrada, esperado) => expect(safeFileName(entrada)).toBe(esperado));
});

describe('formatBytes', () => {
  it.each([
    [500, '1 KB'],
    [340 * 1024, '340 KB'],
    [1.25 * MB, '1,3 MB'],
  ])('%d → %s', (n, esperado) => expect(formatBytes(n)).toBe(esperado));
});
