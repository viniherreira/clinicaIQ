import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let modulos: () => Promise<{ clinic: true; crm: boolean }>;
const getTenantClient = vi.fn();

vi.mock('@/lib/access', () => ({ getTenantModules: () => modulos() }));
vi.mock('@clinicaiq/db', () => ({ getTenantClient: (id: string) => getTenantClient(id) }));

const { notifyCrm, appointmentStatusEvent } = await import('./notify');
const evento = { type: 'appointment.created', patientId: 'p1', appointmentId: 'a1' } as const;

beforeEach(() => {
  getTenantClient.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('notifyCrm — nunca atrapalha a agenda', () => {
  it('clínica sem CRM: não abre nem o banco da clínica', async () => {
    modulos = async () => ({ clinic: true, crm: false });
    await notifyCrm('t1', evento);
    expect(getTenantClient).not.toHaveBeenCalled();
  });

  it('banco fora do ar ao checar o módulo: não lança', async () => {
    modulos = async () => {
      throw new Error('conexão recusada');
    };
    await expect(notifyCrm('t1', evento)).resolves.toBeUndefined();
  });

  it('erro no meio do caminho: não lança, e o log não leva dado pessoal', async () => {
    modulos = async () => ({ clinic: true, crm: true });
    getTenantClient.mockImplementation(() => {
      throw new Error('falhou');
    });
    await expect(notifyCrm('t1', evento)).resolves.toBeUndefined();

    const log = vi.mocked(console.error).mock.calls.at(-1)!;
    expect(log[0]).toBe('[crm] aviso da clínica falhou');
    expect(Object.keys(log[1] as object).sort()).toEqual(['event', 'message', 'patientId', 'tenantId']);
  });
});

describe('appointmentStatusEvent', () => {
  it('cada situação da agenda vira o aviso certo', () => {
    expect(appointmentStatusEvent('CANCELLED')).toBe('appointment.cancelled');
    expect(appointmentStatusEvent('MISSED')).toBe('appointment.missed');
    expect(appointmentStatusEvent('ATTENDED')).toBe('appointment.attended');
    for (const s of ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] as const) {
      expect(appointmentStatusEvent(s)).toBe('appointment.rescheduled');
    }
  });
});
