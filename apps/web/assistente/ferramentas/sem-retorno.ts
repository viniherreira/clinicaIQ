import { z } from 'zod';
import { subtrairMeses } from '../datas';
import { ferramenta, limitar } from './tipos';

export const semRetorno = ferramenta({
  nome: 'sem_retorno',
  descricao:
    'Pacientes cuja última consulta atendida foi há mais de `meses` meses e que não têm consulta marcada para frente. Devolve a data da última visita, da mais antiga para a mais recente.',
  capability: 'pacientes',
  entrada: z.object({ meses: z.number().int().min(1).max(60) }).strict(),
  async executar(ctx, { meses }) {
    const corte = new Date(`${subtrairMeses(ctx.hoje, meses)}T00:00:00.000Z`);
    const hoje = new Date(`${ctx.hoje}T00:00:00.000Z`);
    const ags = await ctx.db.appointment.findMany({
      where: {
        tenantId: ctx.tenantId,
        patient: { active: true, deletedAt: null },
        OR: [{ status: 'ATTENDED' }, { status: { in: ['SCHEDULED', 'CONFIRMED'] }, startTime: { gte: hoje } }],
      },
      select: { startTime: true, status: true, patient: { select: { id: true, name: true } } },
    });

    const ultima = new Map<string, { nome: string; visita: Date }>();
    const comFuturo = new Set<string>();
    for (const a of ags) {
      if (a.status !== 'ATTENDED') {
        comFuturo.add(a.patient.id);
        continue;
      }
      const atual = ultima.get(a.patient.id);
      if (!atual || a.startTime > atual.visita) ultima.set(a.patient.id, { nome: a.patient.name, visita: a.startTime });
    }

    const lista = [...ultima.entries()]
      .filter(([id, u]) => u.visita < corte && !comFuturo.has(id))
      .sort((a, b) => a[1].visita.getTime() - b[1].visita.getTime())
      .map(([id, u]) => ({ pacienteId: id, paciente: u.nome, ultimaVisita: u.visita.toISOString().slice(0, 10) }));
    return limitar(lista);
  },
});
