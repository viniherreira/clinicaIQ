import { describe, expect, it } from 'vitest';
import { salesWhatsAppUrl } from './company';

describe('salesWhatsAppUrl', () => {
  it.each([
    ['11 91234-5678', '5511912345678'],
    ['(11) 3456-7890', '551134567890'],
    ['+55 11 91234-5678', '5511912345678'],
    ['5511912345678', '5511912345678'],
  ])('monta o link de %s', (numero, esperado) => {
    expect(salesWhatsAppUrl(numero, 'Oi')).toBe(`https://wa.me/${esperado}?text=Oi`);
  });

  it.each(['', '1234', '+1 415 555 0100', '55 11 9123'])('esconde o botão com %j', (numero) => {
    expect(salesWhatsAppUrl(numero)).toBeNull();
  });

  it('codifica a mensagem pronta', () => {
    expect(salesWhatsAppUrl('11912345678', 'Olá, tudo bem?')).toBe(
      'https://wa.me/5511912345678?text=Ol%C3%A1%2C%20tudo%20bem%3F',
    );
  });
});
