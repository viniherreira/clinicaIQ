import { z } from 'zod';
import { decrypt } from '@clinicaiq/db';
import { ferramenta, limitar } from './tipos';

export const buscarPacientes = ferramenta({
  nome: 'buscar_pacientes',
  descricao:
    'Busca pacientes ativos pelo nome (parte do nome serve) ou por uma lista de ids vinda de outra ferramenta. Devolve id, número, nome, e-mail e nascimento. O telefone só vem com incluirContato=true: peça apenas quando a pergunta for sobre contato. O CPF nunca é devolvido.',
  capability: 'pacientes',
  entrada: z
    .object({
      nome: z.string().min(2).optional(),
      ids: z.array(z.string()).max(50).optional(),
      incluirContato: z.boolean().optional(),
    })
    .strict()
    .refine((v) => v.nome || v.ids?.length, 'informe nome ou ids'),
  async executar(ctx, input) {
    const pacientes = await ctx.db.patient.findMany({
      where: {
        tenantId: ctx.tenantId,
        active: true,
        deletedAt: null,
        ...(input.nome ? { name: { contains: input.nome, mode: 'insensitive' as const } } : {}),
        ...(input.ids?.length ? { id: { in: input.ids } } : {}),
      },
      select: { id: true, controlNumber: true, name: true, email: true, birthDate: true, phoneEncrypted: true },
      orderBy: { name: 'asc' },
      take: 51,
    });
    const chave = process.env.ENCRYPTION_MASTER_KEY!;
    return limitar(
      pacientes.map((p) => ({
        id: p.id,
        numero: p.controlNumber,
        nome: p.name,
        email: p.email,
        nascimento: p.birthDate?.toISOString().slice(0, 10) ?? null,
        ...(input.incluirContato ? { telefone: p.phoneEncrypted ? decrypt(p.phoneEncrypted, chave, ctx.tenantId) : null } : {}),
      })),
    );
  },
});
