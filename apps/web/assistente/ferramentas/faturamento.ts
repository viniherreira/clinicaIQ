import { z } from 'zod';
import { DATA_ISO, periodoReal } from '../datas';
import { ferramenta, reais } from './tipos';

export const faturamento = ferramenta({
  nome: 'faturamento',
  descricao:
    'Quanto a clínica recebeu num período (pagamentos lançados), de `inicio` a `fim` inclusive (AAAA-MM-DD), com o total, o número de pagamentos e a divisão por forma de pagamento. "Mês passado" vai do dia 1 ao último dia do mês anterior a hoje.',
  capability: 'financeiro',
  entrada: z.object({ inicio: DATA_ISO, fim: DATA_ISO }).strict(),
  async executar(ctx, { inicio, fim }) {
    if (fim < inicio) return { erro: 'fim antes do início' };
    const pagamentos = await ctx.db.payment.findMany({
      where: { tenantId: ctx.tenantId, paidAt: periodoReal(inicio, fim) },
      select: { amount: true, method: true },
    });
    const porForma = new Map<string, number>();
    let total = 0;
    for (const p of pagamentos) {
      const cents = Math.round(Number(p.amount) * 100);
      total += cents;
      const forma = p.method?.trim() || 'Não informada';
      porForma.set(forma, (porForma.get(forma) ?? 0) + cents);
    }
    return {
      inicio,
      fim,
      total: reais(total),
      pagamentos: pagamentos.length,
      porForma: [...porForma.entries()].sort((a, b) => b[1] - a[1]).map(([forma, c]) => ({ forma, total: reais(c) })),
    };
  },
});
