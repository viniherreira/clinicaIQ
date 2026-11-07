import { z } from 'zod';
import { getDay, parseISO } from 'date-fns';
import { buildWorkingHoursMap } from '@/lib/working-hours';
import { clinicNow, freeSlots } from '@/lib/availability';
import { DATA_ISO, diaDeParede } from '../datas';
import { ferramenta } from './tipos';

export const horariosLivres = ferramenta({
  nome: 'horarios_livres',
  descricao:
    'Horários livres de um profissional num dia (AAAA-MM-DD), pelo expediente cadastrado, tirando agendamentos e bloqueios. Use listar_profissionais antes para obter o profissionalId. duracaoMin é a duração da consulta (padrão 30).',
  capability: 'agenda',
  entrada: z
    .object({ profissionalId: z.string(), data: DATA_ISO, duracaoMin: z.number().int().min(10).max(240).optional() })
    .strict(),
  async executar(ctx, { profissionalId, data, duracaoMin = 30 }) {
    const prof = await ctx.db.professional.findFirst({
      where: { tenantId: ctx.tenantId, id: profissionalId, active: true },
      select: { id: true, name: true },
    });
    if (!prof) return { erro: 'profissional não encontrado nesta clínica' };

    const { inicio, fim } = diaDeParede(data);
    const [mapa, ags, bloqueios] = await Promise.all([
      buildWorkingHoursMap(ctx.tenantId, [prof.id]),
      ctx.db.appointment.findMany({
        where: { tenantId: ctx.tenantId, professionalId: prof.id, status: { notIn: ['CANCELLED', 'RESCHEDULED'] }, startTime: { lt: fim }, endTime: { gt: inicio } },
        select: { startTime: true, endTime: true },
      }),
      ctx.db.blockedSlot.findMany({
        where: { tenantId: ctx.tenantId, professionalId: prof.id, startTime: { lt: fim }, endTime: { gt: inicio } },
        select: { startTime: true, endTime: true },
      }),
    ]);

    // Minutos do dia; o que começa antes ou termina depois fica preso às bordas
    // (a mesma conta de app/agendar/[slug]/actions.ts).
    const min = (d: Date) => {
      const dia = d.toISOString().slice(0, 10);
      if (dia < data) return 0;
      if (dia > data) return 24 * 60;
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    };
    const busy: [number, number][] = [...ags, ...bloqueios].map((x) => [min(x.startTime), min(x.endTime)]);
    const day = mapa[prof.id]?.[getDay(parseISO(data))] ?? null;
    const agora = clinicNow();
    const notBeforeMin = data === agora.date ? agora.minutes : data < agora.date ? 24 * 60 : 0;

    return { profissional: prof.name, data, horarios: freeSlots({ day, busy, durationMin: duracaoMin, stepMin: 30, notBeforeMin }) };
  },
});
