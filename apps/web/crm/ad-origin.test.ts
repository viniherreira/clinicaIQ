import { describe, expect, it } from 'vitest';
import { originOf, readAd } from './ad-origin';

describe('originOf', () => {
  it.each([
    [{ sourceUrl: 'https://fb.me/4YAcPbZJ2' }, '', 'FACEBOOK'],
    [{ sourceUrl: null, headline: 'Prótese' }, '', 'FACEBOOK'],
    [{ sourceUrl: 'https://www.instagram.com/p/C1abc/' }, '', 'INSTAGRAM'],
    [{ sourceUrl: 'https://instagram.com/reel/XYZ' }, '', 'INSTAGRAM'],
    [{ sourceUrl: 'https://instagr.am/p/1' }, '', 'INSTAGRAM'],
    // Anúncio vale mais que a frase do site.
    [{ sourceUrl: 'https://fb.me/x' }, 'vim pelo site', 'FACEBOOK'],
    // Link que só cita o Instagram no meio não engana.
    [{ sourceUrl: 'https://fb.me/instagram.com.fake' }, '', 'FACEBOOK'],
  ] as const)('anúncio %o → %s', (ad, texto, esperado) => {
    expect(originOf(ad, texto)).toBe(esperado);
  });

  it.each([
    ['Olá! Vim pelo site e quero agendar', 'SITE'],
    ['vi no SITE de vocês', 'SITE'],
    ['Mensagem do site: quero saber de implante', 'SITE'],
    ['Oi, quero agendar', null],
    ['vou visitar o website amanhã', null],
    ['', null],
  ] as const)('sem anúncio: %s → %s', (texto, esperado) => {
    expect(originOf(null, texto)).toBe(esperado);
  });
});

describe('readAd', () => {
  it('lê o anúncio guardado e usa a miniatura do vídeo como imagem', () => {
    expect(readAd({ sourceUrl: 'https://fb.me/x', headline: 'Lentes', body: 'Só este mês', mediaType: 'video', thumbnailUrl: 'https://scontent/x.jpg' })).toEqual({
      sourceUrl: 'https://fb.me/x',
      headline: 'Lentes',
      body: 'Só este mês',
      imageUrl: 'https://scontent/x.jpg',
      mediaType: 'video',
    });
  });

  it('ignora o que não é anúncio e link que não é https', () => {
    expect(readAd(null)).toBeNull();
    expect(readAd([])).toBeNull();
    expect(readAd({ mediaType: 'image' })).toBeNull();
    expect(readAd({ headline: 'Promo', sourceUrl: 'javascript:alert(1)', imageUrl: 'http://x' })).toMatchObject({ sourceUrl: null, imageUrl: null });
  });
});
