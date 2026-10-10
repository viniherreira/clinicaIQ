import { describe, expect, it } from 'vitest';
import { fillQuickReply, newMessageId } from './conversations';

describe('fillQuickReply', () => {
  it.each([
    ['Oi {nome}, tudo bem?', 'Ana Souza', 'Oi Ana, tudo bem?'],
    ['{NOME}, seu horário está confirmado.', 'bruno', 'bruno, seu horário está confirmado.'],
    // Sem nome, a frase continua de pé.
    ['Oi {nome}, tudo bem?', null, 'Oi, tudo bem?'],
    ['Olá {nome}!', '  ', 'Olá!'],
    ['Nosso endereço é Rua A, 10', 'Ana', 'Nosso endereço é Rua A, 10'],
  ])('%s + %s', (body, name, esperado) => {
    expect(fillQuickReply(body, name)).toBe(esperado);
  });
});

describe('newMessageId', () => {
  it('tem o formato do WhatsApp e não repete', () => {
    const ids = new Set(Array.from({ length: 500 }, newMessageId));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^3EB0[0-9A-F]{18}$/);
  });
});
