import { z } from 'zod';
import { DATA_ISO, diaDeParede } from '../datas';
import { ferramenta, limitar } from './tipos';

const STATUS: Record<string, string> = {
  SCHEDULED: 'agendado',
  CONFIRMED: 'confirmado',
  ATTENDED: 'atendido',
  MISSED: 'faltou',
};

export const agendaDoDia = ferramenta({
  nome: 'agenda_do_dia',
  descricao:
    'Os agendamentos de um dia (AAAA-MM-DD), sem os cancelados e remarcados, com hora, paciente, profissional e status. Filtre por profissionalId quando a pergunta citar um profissional. Responde "quantos agendamentos temos amanhã".',
  capability: 'agenda',
  entrada: z.object({ data: DATA_ISO, profissionalId: z.string().optional() }).strict(),
  async executar(ctx, { data, profissionalId }) {
    const { inicio, fim } = diaDeParede(data);
    const ags = await ctx.db.appointment.findMany({
      where: {
        tenantId: ctx.tenantId,
        startTime: { gte: inicio, lte: fim },
        status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
        ...(profissionalId ? { professionalId: profissionalId } : {}),
      },
      orderBy: { startTime: 'asc' },
      select: {
        startTime: true,
        status: true,
        patient: { select: { id: true, name: true } },
        professional: { select: { name: true } },
      },
    });
    return {
      data,
      ...limitar(
        ags.map((a) => ({
          hora: a.startTime.toISOString().slice(11, 16),
          paciente: a.patient.name,
          pacienteId: a.patient.id,
          profissional: a.professional.name,
          status: STATUS[a.status] ?? a.status,
        })),
      ),
    };
  },
});
