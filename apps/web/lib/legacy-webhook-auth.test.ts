import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { directShapeAllowed, legacyWebhookAuthorized } from './legacy-webhook-auth';

const body = JSON.stringify({ from: '5511999990000', text: 'cancelar' });
const sign = (secret: string) => `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

describe('webhook antigo do WhatsApp', () => {
  it('em produção recusa chamada sem assinatura', () => {
    expect(legacyWebhookAuthorized(body, null, { NODE_ENV: 'production', META_APP_SECRET: 's3' })).toBe(false);
  });

  it('em produção recusa tudo quando não há segredo configurado', () => {
    expect(legacyWebhookAuthorized(body, sign('qualquer'), { NODE_ENV: 'production' })).toBe(false);
  });

  it('em produção aceita só a assinatura certa', () => {
    expect(legacyWebhookAuthorized(body, sign('s3'), { NODE_ENV: 'production', META_APP_SECRET: 's3' })).toBe(true);
    expect(legacyWebhookAuthorized(body, sign('outro'), { NODE_ENV: 'production', META_APP_SECRET: 's3' })).toBe(false);
  });

  it('WHATSAPP_APP_SECRET vale antes do META_APP_SECRET', () => {
    const env = { NODE_ENV: 'production', WHATSAPP_APP_SECRET: 'wa', META_APP_SECRET: 'meta' };
    expect(legacyWebhookAuthorized(body, sign('wa'), env)).toBe(true);
    expect(legacyWebhookAuthorized(body, sign('meta'), env)).toBe(false);
  });

  it('fora de produção o mock passa sem assinatura', () => {
    expect(legacyWebhookAuthorized(body, null, { NODE_ENV: 'development' })).toBe(true);
  });

  it('o atalho por id de agendamento só existe fora de produção', () => {
    expect(directShapeAllowed({ NODE_ENV: 'production' })).toBe(false);
    expect(directShapeAllowed({ NODE_ENV: 'test' })).toBe(true);
  });
});
