import { describe, expect, it } from 'vitest';
import { buildConversionPayload, conversionForRole, explainMetaError, readCtwaClid } from './meta-conversions-rules';

describe('aviso de conversões à Meta', () => {
  it('Agendados vira "agendou" e Fechou vira "fechou"; o resto não avisa', () => {
    expect(conversionForRole('SCHEDULED')).toBe('agendou');
    expect(conversionForRole('WON')).toBe('fechou');
    expect(conversionForRole('NEW')).toBeNull();
    expect(conversionForRole('LOST')).toBeNull();
    expect(conversionForRole(null)).toBeNull();
  });

  it('lê o clique do anúncio guardado na mensagem', () => {
    expect(readCtwaClid({ ctwaClid: ' ABC ' })).toBe('ABC');
    expect(readCtwaClid({ ctwaClid: '' })).toBeNull();
    expect(readCtwaClid({ sourceId: '1' })).toBeNull();
    expect(readCtwaClid(null)).toBeNull();
    expect(readCtwaClid(['x'])).toBeNull();
  });

  it('"agendou" vai como LeadSubmitted, sem valor', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    const p = buildConversionPayload({ kind: 'agendou', wabaId: 'W1', ctwaClid: 'C1', leadId: 'L1', now });
    expect(p.partner_agent).toBe('dreamclin');
    expect(p.data[0]).toEqual({
      event_name: 'LeadSubmitted',
      event_time: Math.floor(now.getTime() / 1000),
      event_id: 'L1:agendou',
      action_source: 'business_messaging',
      messaging_channel: 'whatsapp',
      user_data: { whatsapp_business_account_id: 'W1', ctwa_clid: 'C1' },
    });
  });

  it('"fechou" vai como Purchase, em reais', () => {
    const p = buildConversionPayload({ kind: 'fechou', wabaId: 'W1', ctwaClid: 'C1', leadId: 'L1', valueCents: 350050 });
    expect(p.data[0]).toMatchObject({ event_name: 'Purchase', custom_data: { currency: 'BRL', value: 3500.5 } });
    const semValor = buildConversionPayload({ kind: 'fechou', wabaId: 'W1', ctwaClid: 'C1', leadId: 'L1', valueCents: null });
    expect(semValor.data[0]).toMatchObject({ custom_data: { currency: 'BRL', value: 0 } });
  });

  it('erro de permissão pede para reconectar', () => {
    expect(explainMetaError(200, 'Permissions error')).toMatch(/Reconecte/);
    expect(explainMetaError(100, 'Invalid parameter')).toMatch(/Invalid parameter/);
  });
});
