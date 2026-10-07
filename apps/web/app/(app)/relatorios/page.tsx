import { redirect } from 'next/navigation';

/**
 * Relatórios agora moram no Financeiro, como o detalhamento embaixo do resumo.
 *
 * O endereço continua respondendo porque está em favoritos, em mensagens já
 * mandadas e no histórico do navegador de quem usava a tela. Os filtros vêm
 * junto: `type`, período, profissional, procedimento e situação têm o mesmo
 * nome lá.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && v) params.set(k, v);
  }
  const qs = params.toString();
  redirect(`/financeiro${qs ? `?${qs}` : ''}#detalhe`);
}
