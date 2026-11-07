import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const m = vi.hoisted(() => ({
  currentAccess: vi.fn(),
  assistenteLiberado: vi.fn(),
  checarLimites: vi.fn(),
  prepararTurno: vi.fn(),
  rodarTurno: vi.fn(),
  getTenantAccess: vi.fn(),
  getTenantModules: vi.fn(),
  after: vi.fn(),
}));
vi.mock('@/lib/access', () => ({ getTenantAccess: m.getTenantAccess, getTenantModules: m.getTenantModules }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: m.after }));
vi.mock('@/lib/guard', () => ({ currentAccess: m.currentAccess }));
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/assistente/acesso', () => ({ assistenteLiberado: m.assistenteLiberado, checarLimites: m.checarLimites }));
vi.mock('@/assistente/turno', () => ({
  lerPedido: (c: { pergunta?: string; conversaId?: string } | null) =>
    c?.pergunta ? { ok: true, pergunta: c.pergunta, conversaId: c.conversaId } : { ok: false, erro: 'vazia' },
  SEPARADOR_FIM: '\u0000',
  prepararTurno: m.prepararTurno,
  rodarTurno: m.rodarTurno,
}));

import { POST } from './route';

const req = (corpo: unknown) => new Request('http://x/api/assistente', { method: 'POST', body: JSON.stringify(corpo) });

beforeEach(() => {
  vi.resetAllMocks();
  m.currentAccess.mockResolvedValue({ tenantId: 't', userId: 'u', role: 'OWNER' });
  m.assistenteLiberado.mockResolvedValue(true);
  m.checarLimites.mockResolvedValue({ ok: true });
  m.prepararTurno.mockResolvedValue({ ok: true, historico: [] });
  m.getTenantAccess.mockResolvedValue({ level: 'full' });
  m.getTenantModules.mockResolvedValue({ clinic: true });
});

describe('POST /api/assistente', () => {
  it('404 em JSON quando não está liberado', async () => {
    m.assistenteLiberado.mockResolvedValue(false);
    const r = await POST(req({ pergunta: 'oi' }));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ erro: 'não encontrado' });
  });

  it('404 quando a assinatura está em somente leitura', async () => {
    m.getTenantAccess.mockResolvedValue({ level: 'readonly' });
    const r = await POST(req({ pergunta: 'oi' }));
    expect(r.status).toBe(404);
    expect(m.rodarTurno).not.toHaveBeenCalled();
  });

  it('404 quando a clínica não tem o módulo da Agenda', async () => {
    m.getTenantModules.mockResolvedValue({ clinic: false });
    const r = await POST(req({ pergunta: 'oi' }));
    expect(r.status).toBe(404);
  });

  it('registra o turno em after() para sobreviver ao fechamento da tela', async () => {
    m.rodarTurno.mockResolvedValue({ conversaId: 'c1', parouPor: 'end_turn' });
    const r = await POST(req({ pergunta: 'oi' }));
    await r.text();
    expect(m.after).toHaveBeenCalledTimes(1);
    expect(m.after.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it('409 em JSON vindo do prepararTurno, sem rodar o turno', async () => {
    m.prepararTurno.mockResolvedValue({ ok: false, erro: 'ilegível', status: 409 });
    const r = await POST(req({ pergunta: 'oi', conversaId: 'c' }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ erro: 'ilegível' });
    expect(m.rodarTurno).not.toHaveBeenCalled();
  });

  it('stream normal termina com o separador e o JSON final', async () => {
    m.rodarTurno.mockImplementation(async ({ escrever }: { escrever: (t: string) => void }) => {
      escrever('Olá');
      return { conversaId: 'c1', parouPor: 'end_turn' };
    });
    const r = await POST(req({ pergunta: 'oi' }));
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('Olá\n\u0000{"conversaId":"c1","parouPor":"end_turn"}');
  });

  it('cancelar a leitura no meio não quebra e o turno termina', async () => {
    let solta!: () => void;
    const portao = new Promise<void>((res) => {
      solta = res;
    });
    let terminou = false;
    m.rodarTurno.mockImplementation(async ({ escrever }: { escrever: (t: string) => void }) => {
      escrever('a');
      await portao;
      escrever('b');
      terminou = true;
      return { conversaId: 'c1', parouPor: 'end_turn' };
    });
    const r = await POST(req({ pergunta: 'oi' }));
    const leitor = r.body!.getReader();
    expect((await leitor.read()).done).toBe(false);
    await leitor.cancel();
    solta();
    await vi.waitFor(() => expect(terminou).toBe(true));
    await new Promise((res) => setTimeout(res, 10));
  });
});
