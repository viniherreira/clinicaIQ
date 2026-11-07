import { z } from 'zod';
import { ferramenta, limitar } from './tipos';

export const ultimosAtendidos = ferramenta({
  nome: 'ultimos_atendidos',
  descricao:
    'Os últimos atendimentos realizados (status atendido), do mais recente para o mais antigo, com paciente (e o id dele), data, hora, profissional e procedimento.',
  capability: 'agenda',
  entrada: z.object({ quantidade: z.number().int().min(1).max(50) }).strict(),
  async executar(ctx, { quantidade }) {
    const atendimentos = await ctx.db.appointment.findMany({
      where: { tenantId: ctx.tenantId, status: 'ATTENDED', patient: { active: true, deletedAt: null } },
      orderBy: { startTime: 'desc' },
      take: quantidade,
      select: {
        startTime: true,
        patient: { select: { id: true, name: true } },
        professional: { select: { name: true } },
        procedure: { select: { name: true } },
      },
    });
    return limitar(
      atendimentos.map((a) => ({
        pacienteId: a.patient.id,
        paciente: a.patient.name,
        data: a.startTime.toISOString().slice(0, 10),
        hora: a.startTime.toISOString().slice(11, 16),
        profissional: a.professional.name,
        procedimento: a.procedure?.name ?? null,
      })),
    );
  },
});
