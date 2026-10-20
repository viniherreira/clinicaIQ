import Link from 'next/link';
import { requireCrm } from '@/crm/guard';
import { loadCrmBasics } from '@/crm/page-data';
import { loadDashboard } from '@/crm/dashboard';
import { asPeriod, formatMinutes, PERIODS, pct } from '@/crm/dashboard-math';
import { colorClasses } from '@/crm/colors';
import { formatCents } from '@/crm/format';

export const metadata = { title: 'Painel · DreamClin' };

/**
 * O Painel do CRM, como o do Kommo: o que entrou, o que fechou e como a equipe
 * está no período escolhido. Os gráficos são barras com o número escrito ao
 * lado — o leitor de tela lê o número, a barra é só desenho.
 */
export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireCrm('crm');
  const sp = await searchParams;
  const period = asPeriod(typeof sp.periodo === 'string' ? sp.periodo : undefined);
  const basics = await loadCrmBasics(ctx);
  // O funil do painel mostra as colunas de todos os funis (com o nome do funil, se houver mais de um).
  const varios = basics.pipelines.length > 1;
  const etapas = basics.pipelines.flatMap((p) => p.columns.map((s) => ({ ...s, name: varios ? `${p.name} · ${s.name}` : s.name })));
  const d = await loadDashboard(ctx, period, etapas, basics.team);
  const k = d.kpis;
  const maiorEtapa = Math.max(1, ...d.funnel.map((f) => f.count));

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3 sm:px-5">
        <h1 className="text-base font-semibold uppercase tracking-wide">Painel</h1>
        <nav aria-label="Período" className="segmented">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={p.key === '30d' ? '/crm/painel' : `/crm/painel?periodo=${p.key}`}
              aria-current={p.key === period ? 'page' : undefined}
              className="segmented-item"
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex-1 space-y-4 bg-board p-4 sm:p-5">
        <section aria-label="Números do período">
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Leads novos" value={String(k.newLeads)} />
            <Kpi label="Ganhos" value={String(k.won)} detail={formatCents(k.wonValueCents)} tone="text-green-700 dark:text-green-300" />
            <Kpi label="Perdidos" value={String(k.lost)} tone="text-red-700 dark:text-red-300" />
            <Kpi label="Conversão" value={k.conversion == null ? '-' : pct(k.conversion)} detail="ganhos ÷ fechados" />
            <Kpi label="No funil agora" value={String(k.openLeads)} detail={formatCents(k.openValueCents)} />
            <Kpi
              label="Tempo de resposta"
              value={k.responseMinutes == null ? '-' : formatMinutes(k.responseMinutes)}
              detail="mediana no WhatsApp"
            />
          </ul>
        </section>

        {(k.overdueTasks > 0 || k.awaitingReply > 0) && (
          <div className="flex flex-wrap gap-3">
            {k.overdueTasks > 0 && (
              <Link
                href="/crm?tarefa=overdue"
                className="rounded-md border-l-[3px] border-red-500 bg-surface px-4 py-2.5 text-sm shadow-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                <strong className="font-semibold">{k.overdueTasks}</strong> {k.overdueTasks === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
              </Link>
            )}
            {k.awaitingReply > 0 && (
              <Link
                href="/crm/conversas?aba=unanswered"
                className="rounded-md border-l-[3px] border-amber-500 bg-surface px-4 py-2.5 text-sm shadow-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                <strong className="font-semibold">{k.awaitingReply}</strong>{' '}
                {k.awaitingReply === 1 ? 'conversa esperando resposta' : 'conversas esperando resposta'}
              </Link>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card titulo="Funil agora">
            <ul className="space-y-2.5">
              {d.funnel.map((f) => (
                <li key={f.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate">{f.name}</span>
                  <span className="h-2.5 rounded-full bg-surface-alt" aria-hidden="true">
                    <span
                      className={`block h-full rounded-full ${colorClasses(f.color).dot}`}
                      style={{ width: `${(f.count / maiorEtapa) * 100}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums">
                    {f.count} <span className="text-muted-foreground">· {formatCents(f.valueCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card titulo="De onde vieram os leads novos">
            <Barras itens={d.sources} vazio="Nenhum lead novo no período." cor="bg-primary" />
          </Card>

          <Card titulo="Motivos de perda">
            <Barras itens={d.lostReasons} vazio="Nenhum lead perdido no período." cor="bg-red-500" />
          </Card>

          <Card titulo="Equipe">
            {d.team.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém com leads no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="pb-2 font-medium">Pessoa</th>
                      <th scope="col" className="pb-2 text-right font-medium">No funil</th>
                      <th scope="col" className="pb-2 text-right font-medium">Ganhos</th>
                      <th scope="col" className="pb-2 text-right font-medium">Valor ganho</th>
                      <th scope="col" className="pb-2 text-right font-medium">Atrasadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {d.team.map((p) => (
                      <tr key={p.id}>
                        <th scope="row" className="py-2 text-left font-medium">{p.name}</th>
                        <td className="py-2 text-right tabular-nums">{p.open}</td>
                        <td className="py-2 text-right tabular-nums">{p.won}</td>
                        <td className="py-2 text-right tabular-nums">{formatCents(p.wonValueCents)}</td>
                        <td className={`py-2 text-right tabular-nums ${p.overdue ? 'font-semibold text-destructive' : ''}`}>{p.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, detail, tone = '' }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <li className="rounded-md bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(15,30,60,0.10)]">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </li>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-surface p-4 shadow-[0_1px_2px_rgba(15,30,60,0.10)]" aria-label={titulo}>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-foreground/85">{titulo}</h2>
      {children}
    </section>
  );
}

function Barras({ itens, vazio, cor }: { itens: { label: string; count: number }[]; vazio: string; cor: string }) {
  if (itens.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  const maior = Math.max(...itens.map((i) => i.count));
  const total = itens.reduce((s, i) => s + i.count, 0);
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{i.label}</span>
          <span className="h-2.5 rounded-full bg-surface-alt" aria-hidden="true">
            <span className={`block h-full rounded-full ${cor}`} style={{ width: `${(i.count / maior) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">
            {i.count} <span className="text-muted-foreground">· {pct(i.count / total)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
