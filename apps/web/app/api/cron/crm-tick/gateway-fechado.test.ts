import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/crm/tick', () => ({ runTick: async () => ({ ran: true }) }));

/**
 * O gateway do WhatsApp por QR saiu do ar (achado F-08 da auditoria). O token
 * dele era um só para todas as clínicas: com ele dava para confirmar ou
 * cancelar consultas de qualquer clínica (/api/whatsapp/inbound) e disparar o
 * relógio do CRM. Mesmo que alguém volte a configurar o token por engano, nada
 * aceita mais esse segredo. O relógio é do Supabase, com o CRON_SECRET.
 */
describe('gateway do WhatsApp fechado', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_GATEWAY_TOKEN', 'token-antigo-do-gateway');
    vi.stubEnv('CRON_SECRET', 'segredo-do-relogio');
  });
  afterEach(() => vi.unstubAllEnvs());

  const chamar = async (token: string) => {
    const { POST } = await import('./route');
    return POST(new Request('http://localhost/api/cron/crm-tick', { method: 'POST', headers: { authorization: `Bearer ${token}` } }));
  };

  it('o relógio do CRM recusa o token do gateway', async () => {
    expect((await chamar('token-antigo-do-gateway')).status).toBe(401);
  });

  it('o relógio do CRM aceita o CRON_SECRET', async () => {
    expect((await chamar('segredo-do-relogio')).status).toBe(200);
  });

  it('as rotas do gateway não existem mais', () => {
    const api = resolve(__dirname, '..', '..');
    expect(existsSync(resolve(api, 'whatsapp', 'inbound', 'route.ts'))).toBe(false);
    expect(existsSync(resolve(api, 'whatsapp', 'conversation', 'route.ts'))).toBe(false);
  });
});
