import { describe, expect, it } from 'vitest';
import { describeMessage, messageTime, previewOf } from './chat-describe';

describe('describeMessage', () => {
  it.each([
    ['texto simples', { conversation: ' Oi, tudo bem? ' }, { kind: 'TEXT', text: 'Oi, tudo bem?' }],
    ['texto com link', { extendedTextMessage: { text: 'Vi no Instagram' } }, { kind: 'TEXT', text: 'Vi no Instagram' }],
    ['temporária', { ephemeralMessage: { message: { conversation: 'some' } } }, { kind: 'TEXT', text: 'some' }],
    ['ver uma vez', { viewOnceMessageV2: { message: { imageMessage: { caption: 'raio-x' } } } }, { kind: 'IMAGE', text: 'raio-x' }],
    ['botão tocado', { buttonsResponseMessage: { selectedButtonId: 'confirm', selectedDisplayText: 'Confirmar' } }, { kind: 'TEXT', text: 'Confirmar' }],
    ['botão novo tocado', { interactiveResponseMessage: { body: { text: 'Remarcar' } } }, { kind: 'TEXT', text: 'Remarcar' }],
    ['confirmação com botões', { interactiveMessage: { body: { text: 'Sua consulta é amanhã' } } }, { kind: 'TEXT', text: 'Sua consulta é amanhã' }],
    ['foto sem legenda', { imageMessage: {} }, { kind: 'IMAGE', text: null }],
    ['áudio', { audioMessage: { ptt: true } }, { kind: 'AUDIO', text: null }],
    ['vídeo', { videoMessage: { caption: 'olha' } }, { kind: 'VIDEO', text: 'olha' }],
    ['documento com legenda', { documentWithCaptionMessage: { message: { documentMessage: { caption: 'exame' } } } }, { kind: 'DOCUMENT', text: 'exame' }],
    ['figurinha', { stickerMessage: {} }, { kind: 'STICKER', text: null }],
    ['localização', { locationMessage: { degreesLatitude: 1 } }, { kind: 'LOCATION', text: null }],
    ['contato', { contactMessage: { displayName: 'Ana' } }, { kind: 'CONTACT', text: null }],
  ])('%s', (_nome, message, esperado) => {
    expect(describeMessage(message)).toEqual(esperado);
  });

  it.each([
    ['reação', { reactionMessage: { text: '👍' } }],
    ['apagamento', { protocolMessage: { type: 0 } }],
    ['edição', { editedMessage: { message: { conversation: 'corrigido' } } }],
    ['texto vazio', { conversation: '   ' }],
    ['só troca de chaves', { senderKeyDistributionMessage: {} }],
    ['nada', null],
  ])('ignora %s', (_nome, message) => {
    expect(describeMessage(message)).toBeNull();
  });
});

describe('previewOf', () => {
  it('texto vai como está, em uma linha e curto', () => {
    expect(previewOf({ kind: 'TEXT', text: 'Oi\nquero\n\nmarcar' })).toBe('Oi quero marcar');
    expect(previewOf({ kind: 'TEXT', text: 'x'.repeat(300) })).toHaveLength(120);
  });

  it('mídia diz o que é', () => {
    expect(previewOf({ kind: 'AUDIO', text: null })).toBe('Áudio');
    expect(previewOf({ kind: 'IMAGE', text: 'raio-x' })).toBe('Foto: raio-x');
  });
});

describe('messageTime', () => {
  it('segundos viram data; Long também; lixo usa o padrão', () => {
    const padrao = new Date('2026-01-01T00:00:00Z');
    expect(messageTime(1_760_000_000).toISOString()).toBe('2025-10-09T08:53:20.000Z');
    expect(messageTime({ toString: () => '1760000000' }).getTime()).toBe(1_760_000_000_000);
    expect(messageTime(undefined, padrao)).toBe(padrao);
  });
});
