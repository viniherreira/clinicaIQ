import { SearchX } from 'lucide-react';
import { formatCount, formatMoney, formatRate, formatRoas, type AdsReport, type FunnelStep } from '@/crm/ads-rules';
import { chatTime, formatCents } from '@/crm/format';
import { rangeText } from '@/crm/period';
import { DEFAULT_REPORT_PERIOD, PREVIOUS_LABEL, REPORT_PERIODS, type DayRange, type ReportPeriodKey } from '@/crm/report-period';
import { refreshAdsAction } from '../../whatsapp/ads-actions';
import { StackedCharts } from '../../_components/report/charts';
import { ReportFrame } from '../../_components/report/frame';
import { CARD, ChartCard, EmptyState, Legend, StatTile } from '../../_components/report/parts';
import { CampaignTable } from './campaign-table';

const META = 'var(--viz-meta)';
const CRM = 'var(--viz-crm)';

/** A tela Anúncios com os números: cartões, funil, dia a dia e campanhas. */
export function AdsReportView({
  report: r,
  period,
  accountName,
  range,
  fetchedAt,
}: {
  report: AdsReport;
  period: ReportPeriodKey;
  accountName: string | null;
  range: Pick<DayRange, 'since' | 'until'>;
  fetchedAt: string;
}) {
  const versus = PREVIOUS_LABEL[period];
  const dinheiro = (v: number | null) => (v == null ? '–' : formatMoney(v));

  return (
    <ReportFrame
      title="Anúncios"
      basePath="/crm/anuncios"
      periods={REPORT_PERIODS}
      period={period}
      defaultPeriod={DEFAULT_REPORT_PERIOD}
      params={r.campaignId ? { campanha: r.campaignId } : {}}
      select={{ name: 'campanha', label: 'Campanha', all: 'Todas as campanhas', value: r.campaignId ?? '', options: r.campaigns }}
      refresh={refreshAdsAction}
      updatedAt={`Atualizado às ${chatTime(new Date(fetchedAt))}`}
    >
      <p className="text-sm text-muted-foreground">
        {accountName ?? 'Conta de anúncios'} · {rangeText(range.since, range.until)} · as setas comparam com {versus}
      </p>

      {r.empty ? (
        <EmptyState icon={<SearchX className="h-5 w-5" />} title="Nenhum anúncio rodou neste período">
          <p>A conta não teve investimento nem conversas nestes dias, e nenhum lead de anúncio agendou ou fechou. Escolha um período maior, ali em cima.</p>
        </EmptyState>
      ) : (
        <>
          <section aria-label="Números do período">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <div className="contents [&>li]:col-span-2 md:[&>li]:col-span-4 xl:[&>li]:col-span-2">
                <StatTile
                  lead
                  index={0}
                  label="Investido"
                  value={formatMoney(r.kpis.spend.value ?? 0)}
                  hint="Quanto a clínica pagou à Meta pelos anúncios neste período."
                  change={r.kpis.spend.change}
                  tone={r.kpis.spend.tone}
                  versus={versus}
                  trend={r.kpis.spend.trend}
                  detail={`${formatCount(r.totals.conversations)} ${r.totals.conversations === 1 ? 'conversa' : 'conversas'} · ${formatCount(r.totals.won)} ${r.totals.won === 1 ? 'paciente' : 'pacientes'}`}
                />
              </div>
              <StatTile
                index={1}
                label="Custo por conversa"
                value={dinheiro(r.kpis.costPerConversation.value)}
                hint="Quanto custou, em média, cada pessoa que chamou no WhatsApp pelo anúncio."
                change={r.kpis.costPerConversation.change}
                tone={r.kpis.costPerConversation.tone}
                versus={versus}
                trend={r.kpis.costPerConversation.trend}
              />
              <StatTile
                index={2}
                label="Custo por agendamento"
                value={dinheiro(r.kpis.costPerScheduled.value)}
                hint="Quanto custou, em média, cada pessoa que veio de anúncio e agendou."
                change={r.kpis.costPerScheduled.change}
                tone={r.kpis.costPerScheduled.tone}
                versus={versus}
                trend={r.kpis.costPerScheduled.trend}
                trendColor={CRM}
              />
              <StatTile
                index={3}
                label="Custo por paciente"
                value={dinheiro(r.kpis.costPerPatient.value)}
                hint="Quanto custou, em média, cada pessoa que veio de anúncio e fechou."
                change={r.kpis.costPerPatient.change}
                tone={r.kpis.costPerPatient.tone}
                versus={versus}
                trend={r.kpis.costPerPatient.trend}
                trendColor={CRM}
              />
              <StatTile
                index={4}
                label="Retorno"
                value={r.kpis.roas.value == null ? '–' : formatRoas(r.kpis.roas.value)}
                hint="Quanto voltou para cada real investido: o valor dos negócios fechados dividido pelo gasto. 3x quer dizer R$ 3 para cada R$ 1."
                change={r.kpis.roas.change}
                tone={r.kpis.roas.tone}
                versus={versus}
                trend={r.kpis.roas.trend}
                trendColor={CRM}
                detail={`${formatCents(r.totals.revenueCents)} fechados`}
              />
            </ul>
          </section>

          <div className="grid gap-5 lg:grid-cols-5">
            <Funil report={r} />
            <ChartCard
              index={6}
              className="lg:col-span-3"
              title="Dia a dia"
              subtitle="Três gráficos com os mesmos dias: compare o formato, não a altura entre eles."
              table={{
                columns: ['Dia', 'Gasto', 'Conversas', 'Agendamentos'],
                rows: r.daily.map((d) => [d.label, formatMoney(d.spendCents), d.conversations, d.scheduled]),
              }}
            >
              <StackedCharts
                points={r.daily.map((d) => ({ label: d.label, tick: d.tick }))}
                charts={[
                  { title: 'Gasto', series: { name: 'gasto', color: META, values: r.daily.map((d) => d.spendCents), format: 'money' } },
                  { title: 'Conversas no WhatsApp', series: { name: 'conversas', color: META, values: r.daily.map((d) => d.conversations), format: 'count' } },
                  { title: 'Agendamentos', series: { name: 'agendamentos', color: CRM, values: r.daily.map((d) => d.scheduled), format: 'count' } },
                ]}
              />
            </ChartCard>
          </div>

          <ChartCard index={7} title="Por campanha" subtitle="Toque numa campanha para ver cada anúncio. Toque no nome de uma coluna para ordenar.">
            <CampaignTable lines={r.lines} />
          </ChartCard>

          {r.unmatched.leads + r.unmatched.scheduled + r.unmatched.won > 0 && (
            <p className={`${CARD} px-4 py-3 text-sm text-muted-foreground`}>
              Ficaram de fora {formatCount(r.unmatched.leads)} {r.unmatched.leads === 1 ? 'lead' : 'leads'}, {formatCount(r.unmatched.scheduled)}{' '}
              {r.unmatched.scheduled === 1 ? 'agendamento' : 'agendamentos'} e {formatCount(r.unmatched.won)}{' '}
              {r.unmatched.won === 1 ? 'fechamento' : 'fechamentos'} de anúncios que não são desta conta de anúncios.
            </p>
          )}
        </>
      )}

      <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
        Conta quem chegou pelo botão “Enviar mensagem” do anúncio. Quem viu o anúncio e chamou depois por conta própria aparece como WhatsApp
        direto. Agendou, compareceu e fechou vêm das etapas do funil do CRM.
      </p>
    </ReportFrame>
  );
}


function Funil({ report }: { report: AdsReport }) {
  const passo = (key: FunnelStep['key']) => report.funnel.find((p) => p.key === key)!;
  const [alcance, cliques, conversas] = [passo('reach'), passo('clicks'), passo('conversations')];
  // As barras começam nas conversas: é onde a pessoa vira um contato de verdade.
  const barras = report.funnel.filter((p) => p.key !== 'reach' && p.key !== 'clicks');
  return (
    <ChartCard
      index={5}
      className="lg:col-span-2"
      title="Do anúncio ao paciente"
      subtitle="De cada etapa para a seguinte, quantas pessoas continuaram."
      legend={<Legend items={[{ label: 'Meta', color: META }, { label: 'CRM', color: CRM }]} />}
      table={{
        columns: ['Etapa', 'Pessoas', 'Da etapa anterior'],
        rows: report.funnel.map((p) => [p.label, formatCount(p.value), p.ofPrevious == null ? '–' : formatRate(p.ofPrevious)]),
      }}
    >
      <dl className="grid grid-cols-2 gap-3">
        {[alcance, cliques].map((p) => (
          <div key={p.key} className="rounded-lg bg-surface-alt/70 px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{p.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tracking-tight">
              {formatCount(p.value)}
              {p.ofPrevious != null && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{formatRate(p.ofPrevious)} de quem viu</span>}
            </dd>
          </div>
        ))}
      </dl>
      <ol className="mt-5 space-y-4">
        {barras.map((p, i) => (
          <FunilLinha key={p.key} passo={p} i={i} base={conversas.value} primeiro={i === 0} />
        ))}
      </ol>
      {conversas.value > 0 && (
        <p className="mt-5 rounded-lg bg-surface-alt/70 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
          De cada 100 pessoas que chamaram no WhatsApp,{' '}
          <strong className="font-semibold text-foreground">{formatRate(passo('scheduled').value / conversas.value).replace('%', '')} agendaram</strong> e{' '}
          <strong className="font-semibold text-foreground">{formatRate(passo('won').value / conversas.value).replace('%', '')} fecharam</strong>.
        </p>
      )}
    </ChartCard>
  );
}

function FunilLinha({ passo, i, base, primeiro }: { passo: FunnelStep; i: number; base: number; primeiro: boolean }) {
  const largura = base > 0 ? Math.min(100, (passo.value / base) * 100) : 0;
  return (
    <li className="text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">{passo.label}</span>
        <span className="shrink-0 tabular-nums">
          <span className="font-semibold">{formatCount(passo.value)}</span>
          {passo.ofPrevious != null && (
            <span className="text-muted-foreground"> · {formatRate(passo.ofPrevious)} {primeiro ? 'dos cliques' : 'da etapa acima'}</span>
          )}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-full bg-surface-alt" aria-hidden="true">
        <div
          className="viz-grow-x h-full rounded-full"
          style={{ width: `${Math.max(passo.value > 0 ? 1.5 : 0, largura)}%`, background: passo.source === 'meta' ? META : CRM, animationDelay: `${i * 60}ms` }}
        />
      </div>
    </li>
  );
}
