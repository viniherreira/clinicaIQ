import { describe, expect, it } from 'vitest';
import { needsSignature, readCrmPrefs, signText } from './crm-prefs';

describe('readCrmPrefs', () => {
  it('padrão: lead automático, sem reusar fechado, sem assinatura', () => {
    expect(readCrmPrefs(null)).toEqual({ autoLead: true, reuseClosedLead: false, senderName: false });
    expect(readCrmPrefs({ crm: { autoLead: false, senderName: true, reuseClosedLead: 'sim' } })).toEqual({
      autoLead: false,
      reuseClosedLead: false,
      senderName: true,
    });
  });
});

describe('assinatura', () => {
  const minha = { direction: 'OUTBOUND', origin: 'CRM', sentById: 'eu' };
  it('vai na primeira e depois que o contato ou um colega fala', () => {
    expect(needsSignature(null, 'eu')).toBe(true);
    expect(needsSignature(minha, 'eu')).toBe(false);
    expect(needsSignature({ direction: 'INBOUND', origin: 'CONTACT', sentById: null }, 'eu')).toBe(true);
    expect(needsSignature({ ...minha, sentById: 'ana' }, 'eu')).toBe(true);
    expect(needsSignature({ direction: 'OUTBOUND', origin: 'BOT', sentById: null }, 'eu')).toBe(true);
  });
  it('em negrito do WhatsApp', () => {
    expect(signText('Ana', 'Oi!')).toBe('*Ana:*\nOi!');
  });
});
