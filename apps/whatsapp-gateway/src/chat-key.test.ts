import { describe, expect, it } from 'vitest';
import { chatKey } from './phone';

/**
 * A mesma tabela nos dois lados (app e gateway): se divergirem, a conversa que o
 * gateway grava não é a que o app procura.
 */
const CASOS: [string, string][] = [
  ['11 98765-4321', '5511987654321'],
  ['5511987654321', '5511987654321'],
  // Celular antigo, como o WhatsApp ainda manda: ganha o 9.
  ['551187654321', '5511987654321'],
  ['11 8765-4321', '5511987654321'],
  ['556199998888', '5561999998888'],
  // Fixo fica como está.
  ['(11) 3456-7890', '551134567890'],
  ['552134567890', '552134567890'],
  // DDD 55 (Santa Maria/RS) não é confundido com o código do país.
  ['55 9999-8888', '5555999998888'],
  ['(55) 3220-1234', '555532201234'],
  // Fora do Brasil fica como veio.
  ['351912345678', '351912345678'],
  ['', ''],
];

describe('chatKey', () => {
  it.each(CASOS)('%s → %s', (entrada, chave) => {
    expect(chatKey(entrada)).toBe(chave);
  });
});
