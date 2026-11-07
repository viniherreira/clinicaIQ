import { z } from 'zod';
import { ferramenta, limitar, reais } from './tipos';

export const saldoDevedor = ferramenta({
  nome: 'saldo_devedor',
  descricao:
    'Quem está com pagamento pendente: soma dos orçamentos aprovados menos o que já foi pago, por paciente. Só aparece quem deve mais que zero, do maior para o menor saldo. Passe pacienteIds para checar pacientes de uma resposta anterior ("quais deles ainda não pagaram?").',
  capability: 'financeiro',
  entrada: z.object({ pacienteIds: z.array(z.string()).max(50).optional() }).strict(),
  async executar(ctx, { pacienteIds }) {
    const filtro = pacienteIds?.length ? { patientId: { in: pacienteIds } } : {};
    // A mesma conta da tela de Retorno (app/(app)/retorno/actions.ts).
    const [orcamentos, pagamentos] = await Promise.all([
      ctx.db.quote.findMany({
        where: { tenantId: ctx.tenantId, status: 'ACCEPTED', ...filtro },
        select: { total: true, patient: { select: { id: true, name: true } } },
      }),
      ctx.db.payment.findMany({ where: { tenantId: ctx.tenantId, ...filtro }, select: { patientId: true, amount: true } }),
    ]);
    const conta = new Map<string, { nome: string; aprovado: number; pago: number }>();
    for (const o of orcamentos) {
      const c = conta.get(o.patient.id) ?? { nome: o.patient.name, aprovado: 0, pago: 0 };
      c.aprovado += Math.round(Number(o.total) * 100);
      conta.set(o.patient.id, c);
    }
    for (const p of pagamentos) {
      const c = conta.get(p.patientId);
      if (c) c.pago += Math.round(Number(p.amount) * 100);
    }
    const devedores = [...conta.entries()]
      .map(([id, c]) => ({ id, ...c, aberto: Math.max(0, c.aprovado - c.pago) }))
      .filter((c) => c.aberto > 0)
      .sort((a, b) => b.aberto - a.aberto);
    return {
      totalEmAberto: reais(devedores.reduce((s, d) => s + d.aberto, 0)),
      ...limitar(
        devedores.map((d) => ({ pacienteId: d.id, paciente: d.nome, aprovado: reais(d.aprovado), pago: reais(d.pago), emAberto: reais(d.aberto) })),
      ),
    };
  },
});
