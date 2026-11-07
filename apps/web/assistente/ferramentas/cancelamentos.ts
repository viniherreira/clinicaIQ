import { z } from 'zod';
import { DATA_ISO } from '../datas';
import { ferramenta, limitar } from './tipos';

export const cancelamentos = ferramenta({
  nome: 'cancelamentos',
  descricao:
    'Pacientes com pelo menos `minimo` consultas canceladas ou faltas (somadas), desde a data opcional `desde` (AAAA-MM-DD). "Mais de duas" significa minimo=3.',
  capability: 'agenda',
  entrada: z.object({ minimo: z.number().int().min(1).max(20), desde: DATA_ISO.optional() }).strict(),
  async executar(ctx, { minimo, desde }) {
    // findMany e conta no código: groupBy não passa pelo filtro de clínica.
    const ags = await ctx.db.appointment.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['CANCELLED', 'MISSED'] },
        ...(desde ? { startTime: { gte: new Date(`${desde}T00:00:00.000Z`) } } : {}),
      },
      select: { status: true, patient: { select: { id: true, name: true } } },
    });
    const porPaciente = new Map<string, { pacienteId: string; paciente: string; cancelados: number; faltas: number; total: number }>();
    for (const a of ags) {
      const p = porPaciente.get(a.patient.id) ?? { pacienteId: a.patient.id, paciente: a.patient.name, cancelados: 0, faltas: 0, total: 0 };
      if (a.status === 'CANCELLED') p.cancelados += 1;
      else p.faltas += 1;
      p.total += 1;
      porPaciente.set(a.patient.id, p);
    }
    return limitar([...porPaciente.values()].filter((p) => p.total >= minimo).sort((a, b) => b.total - a.total));
  },
});
