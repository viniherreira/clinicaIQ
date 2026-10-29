import { describe, expect, it } from 'vitest';
import { contentMatchesType } from './file-sniff';

const bytes = (...b: (number | string)[]) =>
  new Uint8Array(b.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'JFIF');
const PNG = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
const PDF = bytes('%PDF-1.7\n');
const WEBP = bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 ');
const HEIC = bytes(0, 0, 0, 0x18, 'ftypheic', 0, 0, 0, 0);
const MP4 = bytes(0, 0, 0, 0x20, 'ftypisom', 0, 0, 2, 0);
const OGG = bytes('OggS', 0, 2);
const MP3 = bytes('ID3', 4, 0);
const DOCX = bytes('PK', 3, 4, 20, 0);
const DOC = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const HTML = bytes('<!doctype html><script>alert(1)</script>');
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');

describe('contentMatchesType', () => {
  it('aceita o arquivo que é o que diz ser', () => {
    expect(contentMatchesType('image/jpeg', JPEG)).toBe(true);
    expect(contentMatchesType('image/png', PNG)).toBe(true);
    expect(contentMatchesType('application/pdf', PDF)).toBe(true);
    expect(contentMatchesType('image/webp', WEBP)).toBe(true);
    expect(contentMatchesType('image/heic', HEIC)).toBe(true);
    expect(contentMatchesType('video/mp4', MP4)).toBe(true);
    expect(contentMatchesType('audio/ogg', OGG)).toBe(true);
    expect(contentMatchesType('audio/mpeg', MP3)).toBe(true);
    expect(contentMatchesType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX)).toBe(true);
    expect(contentMatchesType('application/msword', DOC)).toBe(true);
    expect(contentMatchesType('text/plain', bytes('Olá, tudo bem?\n'))).toBe(true);
  });

  it('recusa HTML ou SVG disfarçado de imagem ou PDF', () => {
    expect(contentMatchesType('image/png', HTML)).toBe(false);
    expect(contentMatchesType('image/jpeg', SVG)).toBe(false);
    expect(contentMatchesType('application/pdf', HTML)).toBe(false);
  });

  it('recusa um tipo trocado por outro', () => {
    expect(contentMatchesType('image/png', JPEG)).toBe(false);
    expect(contentMatchesType('application/pdf', PNG)).toBe(false);
  });

  it('recusa texto com bytes binários e tipo que não conhece', () => {
    expect(contentMatchesType('text/plain', bytes('abc', 0, 'def'))).toBe(false);
    expect(contentMatchesType('application/x-msdownload', bytes('MZ', 0x90, 0))).toBe(false);
  });

  it('recusa arquivo vazio', () => {
    expect(contentMatchesType('image/png', new Uint8Array())).toBe(false);
  });
});
