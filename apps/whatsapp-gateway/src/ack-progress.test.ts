import { describe, expect, it } from 'vitest';
import { ACK_TO_STATUS, ackAdvances } from './ack-progress.js';

describe('ackAdvances', () => {
  it('avança pelo caminho normal', () => {
    expect(ackAdvances('PENDING', 'SENT')).toBe(true);
    expect(ackAdvances('SENT', 'DELIVERED')).toBe(true);
    expect(ackAdvances('DELIVERED', 'READ')).toBe(true);
  });

  it('não volta de LIDA para SAINDO — o bug que isso trava', () => {
    // Em produção havia mensagem com deliveredAt e readAt preenchidos e status
    // SENT: um SERVER_ACK reemitido na reconexão chegava depois do READ e
    // arrastava a linha para trás. A clínica via "Saindo…" para mensagem lida.
    expect(ackAdvances('READ', 'SENT')).toBe(false);
    expect(ackAdvances('DELIVERED', 'SENT')).toBe(false);
    expect(ackAdvances('READ', 'DELIVERED')).toBe(false);
  });

  it('ignora ack repetido do mesmo estado', () => {
    expect(ackAdvances('SENT', 'SENT')).toBe(false);
    expect(ackAdvances('DELIVERED', 'DELIVERED')).toBe(false);
    expect(ackAdvances('READ', 'READ')).toBe(false);
  });

  it('aceita falha enquanto a entrega não foi confirmada', () => {
    expect(ackAdvances('PENDING', 'FAILED')).toBe(true);
    expect(ackAdvances('SENT', 'FAILED')).toBe(true);
  });

  it('descarta falha que chega depois da entrega', () => {
    // A mensagem chegou ao aparelho. Um erro atrasado não desfaz isso, e marcar
    // FAILED faria a clínica ligar para um paciente que já foi avisado.
    expect(ackAdvances('DELIVERED', 'FAILED')).toBe(false);
    expect(ackAdvances('READ', 'FAILED')).toBe(false);
  });

  it('trata status desconhecido como o mais atrasado possível', () => {
    expect(ackAdvances('COISA_NOVA', 'DELIVERED')).toBe(true);
    expect(ackAdvances('READ', 'COISA_NOVA')).toBe(false);
  });

  it('pula direto quando o ack intermediário se perde', () => {
    // WhatsApp nem sempre manda o DELIVERY_ACK antes do READ.
    expect(ackAdvances('SENT', 'READ')).toBe(true);
    expect(ackAdvances('PENDING', 'READ')).toBe(true);
  });
});

describe('ACK_TO_STATUS', () => {
  it('mapeia os códigos do WhatsApp', () => {
    expect(ACK_TO_STATUS[0]).toBe('FAILED');
    expect(ACK_TO_STATUS[2]).toBe('SENT');
    expect(ACK_TO_STATUS[3]).toBe('DELIVERED');
    expect(ACK_TO_STATUS[4]).toBe('READ');
    expect(ACK_TO_STATUS[5]).toBe('READ'); // PLAYED (áudio ouvido) conta como lida
  });

  it('não mapeia PENDING (1) — é estado nosso, não notícia do WhatsApp', () => {
    expect(ACK_TO_STATUS[1]).toBeUndefined();
  });

  it('a sequência real de uma mensagem lida termina em READ', () => {
    let estado = 'PENDING';
    for (const ack of [2, 3, 4]) {
      const novo = ACK_TO_STATUS[ack];
      if (ackAdvances(estado, novo)) estado = novo;
    }
    expect(estado).toBe('READ');

    // E a reemissão do SERVER_ACK na reconexão não estraga o resultado.
    const reemitido = ACK_TO_STATUS[2];
    if (ackAdvances(estado, reemitido)) estado = reemitido;
    expect(estado).toBe('READ');
  });
});
