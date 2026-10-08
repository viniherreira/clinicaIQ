import { describe, expect, it, vi } from 'vitest';
import type { TenantPrismaClient } from '@clinicaiq/db';
import { liveInfoForLeads } from './live';

function fakeDb(consultas: unknown[], orcamentos: unknown[]) {
  return {
    appointment: { findMany: vi.fn(async () => consultas) },
    quote: { findMany: vi.fn(async () => orcamentos) },
  } as unknown as TenantPrismaClient & {
    appointment: { findMany: ReturnType<typeof vi.fn> };
    quote: { findMany: ReturnType<typeof vi.fn> };
  };
}

describe('liveInfoForLeads', () => {
  it('lead sem paciente não consulta nada', async () => {
    const db = fakeDb([], []);
    expect((await liveInfoForLeads(db, [{ id: 'l1', patientId: null }])).size).toBe(0);
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });

  it('duas consultas para o quadro inteiro, e o primeiro de cada paciente vence', async () => {
    const cedo = new Date('2026-10-12T09:00:00Z');
    const tarde = new Date('2026-10-20T09:00:00Z');
    const db = fakeDb(
      [
        { patientId: 'p1', startTime: cedo, professional: { name: 'Dra. Ana' } },
        { patientId: 'p1', startTime: tarde, professional: { name: 'Dr. Beto' } },
      ],
      [
        { id: 'q2', patientId: 'p2', number: 12, total: '6500.50' },
        { id: 'q1', patientId: 'p2', number: 3, total: '100' },
      ],
    );
    const r = await liveInfoForLeads(db, [
      { id: 'l1', patientId: 'p1' },
      { id: 'l2', patientId: 'p2' },
      { id: 'l3', patientId: 'p3' },
    ]);

    expect(db.appointment.findMany).toHaveBeenCalledTimes(1);
    expect(db.quote.findMany).toHaveBeenCalledTimes(1);
    expect(r.get('l1')).toEqual({ nextAppointment: { startTime: cedo, professionalName: 'Dra. Ana' } });
    expect(r.get('l2')).toEqual({ openQuote: { id: 'q2', number: 12, totalCents: 650_050 } });
    expect(r.has('l3')).toBe(false);
  });

  it('dois negócios do mesmo paciente mostram a mesma agenda', async () => {
    const db = fakeDb([{ patientId: 'p1', startTime: new Date(), professional: { name: 'Dra. Ana' } }], []);
    const r = await liveInfoForLeads(db, [
      { id: 'l1', patientId: 'p1' },
      { id: 'l2', patientId: 'p1' },
    ]);
    expect(r.get('l1')).toEqual(r.get('l2'));
  });
});
