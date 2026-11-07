import { z } from 'zod';
import { ferramenta, limitar } from './tipos';

export const listarProfissionais = ferramenta({
  nome: 'listar_profissionais',
  descricao:
    'Lista os profissionais ativos da clínica com id, nome e especialidade. Use para descobrir o id de um profissional citado pelo nome (ex.: "Dra. Ana") antes de chamar outras ferramentas.',
  capability: 'agenda',
  entrada: z.object({}).strict(),
  async executar(ctx) {
    const profs = await ctx.db.professional.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      select: { id: true, name: true, specialty: true },
      orderBy: { name: 'asc' },
    });
    return limitar(profs.map((p) => ({ id: p.id, nome: p.name, especialidade: p.specialty })));
  },
});
