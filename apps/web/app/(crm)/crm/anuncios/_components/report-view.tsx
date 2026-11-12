import { SearchX } from 'lucide-react';
import type { AdsBreakdowns } from '@/crm/ads-report';
import { ageLabel, BREAKDOWN_METRIC_LABEL, formatCount, formatMoney, formatRate, type AdsReport, type FunnelStep } from '@/crm/ads-rules';
import { chatTime, formatCents } from '@/crm/format';
import { rangeText } from '@/crm/period';
import { DEFAULT_REPORT_PERIOD, PREVIOUS_LABEL, REPORT_PERIODS, type DayRange, type ReportPeriodKey } from '@/crm/report-period';
import { refreshAdsAction } from '../../whatsapp/ads-actions';
import { ColumnChart, StackedCharts } from '../../_components/report/charts';
import { ReportFrame } from '../../_components/report/frame';
import { AgePyramid, BarList, CARD, ChartCard, EmptyState, Legend, SplitBar, StatTile } from '../../_components/report/parts';
import { glow } from '../../_components/report/viz-math';
import { CampaignTable } from './campaign-table';

const META = 'var(--viz-meta)';
const CRM = 'var(--viz-crm)';
const NEUTRO = 'hsl(var(--muted-foreground) / 0.55)';

/** A tela Anúncios com os números: cartões, funil, dia a dia, público e campanhas. */
export function AdsReportView({
  report: r,
  breakdowns: b,
  period,
  accountName,
  range,
  fetchedAt,
}: {
  report: AdsReport;
  breakdowns: AdsBreakdowns;
  period: ReportPeriodKey;
  accountName: string | null;
  range: Pick<DayRange, 'since' | 'until'>;
  fetchedAt: string;
}) {
  const versus = PREVIOUS_LABEL[period];
  const d = r.delivery;
  const horas = b.hours;
  const publico = b.audience;
  const unidadePublico = BREAKDOWN_METRIC_LABEL[publico.metric];

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
        <span className="font-medium text-foreground">{accountName ?? 'Conta de anúncios'}</span> · {rangeText(range.since, range.until)} · as setas comparam com {versus}
      </p>

      {r.empty ? (
        <EmptyState icon={<SearchX className="h-5 w-5" />} title="Nenhum anúncio rodou neste período">
          <p>A conta não teve investimento nem conversas nestes dias, e nenhum lead de anúncio agendou ou fechou. Escolha um período maior, ali em cima.</p>
        </EmptyState>
      ) : (
        <>
          <section aria-label="Números do período">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <StatTile
                lead
                className="col-span-2 md:col-span-4 xl:col-span-2"
                index={0}
                label="Investido"
                value={r.kpis.spend.value ?? 0}
                format="money"
                hint="Quanto a clínica pagou à Meta pelos anúncios neste período."
                change={r.kpis.spend.change}
                tone={r.kpis.spend.tone}
                versus={versus}
                trend={r.kpis.spend.trend}
                detail={`${formatCount(r.totals.conversations)} ${r.totals.conversations === 1 ? 'conversa' : 'conversas'} · ${formatCount(r.totals.won)} ${r.totals.won === 1 ? 'paciente' : 'pacientes'}`}
              />
              <StatTile
                index={1}
                label="Custo por conversa"
                value={r.kpis.costPerConversation.value}
                format="money"
                hint="Quanto custou, em média, cada pessoa que chamou no WhatsApp pelo anúncio."
                change={r.kpis.costPerConversation.change}
                tone={r.kpis.costPerConversation.tone}
                versus={versus}
                trend={r.kpis.costPerConversation.trend}
              />
              <StatTile
                index={2}
                label="Custo por agendamento"
                value={r.kpis.costPerScheduled.value}
                format="money"
                hint="Quanto custou, em média, cada pessoa que veio de anúncio e agendou."
                change={r.kpis.costPerScheduled.change}
                tone={r.kpis.costPerScheduled.tone}
                versus={versus}
                trend={r.kpis.costPerScheduled.trend}
                color={CRM}
              />
              <StatTile
                index={3}
                label="Custo por paciente"
                value={r.kpis.costPerPatient.value}
                format="money"
                hint="Quanto custou, em média, cada pessoa que veio de anúncio e fechou."
                change={r.kpis.costPerPatient.change}
                tone={r.kpis.costPerPatient.tone}
                versus={versus}
                trend={r.kpis.costPerPatient.trend}
                color={CRM}
              />
              <StatTile
                index={4}
                label="Retorno"
                value={r.kpis.roas.value}
                format="roas"
                hint="Quanto voltou para cada real investido: o valor dos negócios fechados dividido pelo gasto. 3x quer dizer R$ 3 para cada R$ 1."
                change={r.kpis.roas.change}
                tone={r.kpis.roas.tone}
                versus={versus}
                trend={r.kpis.roas.trend}
                color={CRM}
                detail={`${formatCents(r.totals.revenueCents)} fechados`}
              />
            </ul>
          </section>

          <section aria-label="Entrega dos anúncios" className={`${CARD} viz-rise`} style={{ ['--i' as string]: 5 }}>
            <dl className="grid grid-cols-2 divide-border/60 sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
              {[
                { t: 'Exibições', v: formatCount(d.impressions), n: 'vezes que o anúncio apareceu' },
                { t: 'Pessoas alcançadas', v: formatCount(d.reach), n: 'viram pelo menos uma vez' },
                { t: 'Frequência', v: d.frequency == null ? '–' : `${d.frequency.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`, n: 'vezes que cada pessoa viu' },
                { t: 'Custo por mil exibições', v: d.cpmCents == null ? '–' : formatMoney(d.cpmCents), n: 'CPM' },
                { t: 'Taxa de clique', v: d.ctr == null ? '–' : formatRate(d.ctr), n: 'de quem viu, clicou (CTR)' },
                { t: 'Ticket médio', v: d.ticketCents == null ? '–' : formatCents(d.ticketCents), n: 'por paciente de anúncio' },
              ].map((m) => (
                <div key={m.t} className="px-4 py-3.5">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{m.t}</dt>
                  <dd className="viz-num mt-1 text-lg leading-none">{m.v}</dd>
                  <dd className="mt-1 text-[11px] text-muted-foreground">{m.n}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="grid gap-5 lg:grid-cols-5">
            <Funil report={r} />
            <ChartCard
              index={7}
              className="lg:col-span-3"
              eyebrow="Meta + CRM"
              title="Dia a dia"
              subtitle="Três gráficos com os mesmos dias: passe o mouse e o mesmo dia acende nos três."
              table={{
                columns: ['Dia', 'Gasto', 'Conversas', 'Agendamentos'],
                rows: r.daily.map((p) => [p.label, formatMoney(p.spendCents), p.conversations, p.scheduled]),
              }}
            >
              <StackedCharts
                points={r.daily.map((p) => ({ label: p.label, tick: p.tick }))}
                charts={[
                  { title: 'Gasto', total: formatMoney(r.totals.spendCents), series: { name: 'gasto', color: META, values: r.daily.map((p) => p.spendCents), format: 'money' } },
                  { title: 'Conversas no WhatsApp', total: formatCount(r.totals.conversations), series: { name: 'conversas', color: META, values: r.daily.map((p) => p.conversations), format: 'count' } },
                  { title: 'Agendamentos', total: formatCount(r.totals.scheduled), series: { name: 'agendamentos', color: CRM, values: r.daily.map((p) => p.scheduled), format: 'count' } },
                ]}
              />
            </ChartCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <ChartCard
              index={8}
              className="lg:col-span-3"
              eyebrow="Meta"
              title="Quem responde aos anúncios"
              subtitle={
                publico.top ? (
                  <>
                    Quem mais respondeu:{' '}
                    <strong className="font-semibold text-foreground">
                      {publico.top.gender === 'female' ? 'mulheres' : 'homens'} de {ageLabel(publico.top.age)} anos
                    </strong>
                    . Os números contam {unidadePublico}.
                  </>
                ) : (
                  'Idade e gênero de quem respondeu.'
                )
              }
              table={{
                columns: ['Idade', 'Mulheres', 'Homens', 'Não informado'],
                rows: publico.ages.map((a) => [`${ageLabel(a.age)} anos`, a.female, a.male, a.unknown]),
              }}
            >
              {publico.ages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">A Meta não informou idade e gênero para este período.</p>
              ) : (
                <div className="space-y-5">
                  <SplitBar
                    parts={[
                      { label: 'Mulheres', value: publico.totals.female, color: CRM },
                      { label: 'Homens', value: publico.totals.male, color: META },
                      { label: 'Não informado', value: publico.totals.unknown, color: NEUTRO },
                    ]}
                  />
                  <AgePyramid unit={unidadePublico} rows={publico.ages.map((a) => ({ label: ageLabel(a.age), female: a.female, male: a.male }))} />
                </div>
              )}
            </ChartCard>

            <ChartCard
              index={9}
              className="lg:col-span-2"
              eyebrow="Meta"
              title="Onde o anúncio rendeu"
              subtitle={`Facebook, Instagram e os outros lugares, por ${BREAKDOWN_METRIC_LABEL[b.platforms.metric]}.`}
            >
              <BarList
                empty="A Meta não informou onde o anúncio apareceu neste período."
                items={b.platforms.lines.map((p) => ({
                  label: p.label,
                  value: p.value,
                  display: formatCount(p.value),
                  note: `${formatRate(p.share)}${p.costPerCents != null ? ` · ${formatMoney(p.costPerCents)} cada` : ''}`,
                }))}
              />
            </ChartCard>
          </div>

          {horas.peak != null && (
            <ChartCard
              index={10}
              eyebrow="Meta"
              title="A que horas o anúncio rende"
              subtitle={
                <>
                  Pico: <strong className="font-semibold text-foreground">das {horas.peak}h às {horas.peak + 1}h</strong>. Mostra {BREAKDOWN_METRIC_LABEL[horas.metric]} por hora do dia, somando todos os dias do período.
                </>
              }
              table={{ columns: ['Hora', BREAKDOWN_METRIC_LABEL[horas.metric]], rows: horas.hours.map((v, h) => [`${h}h`, v]) }}
            >
              <ColumnChart
                peak
                height={132}
                maxTicks={12}
                label={`${BREAKDOWN_METRIC_LABEL[horas.metric]} por hora do dia`}
                points={horas.hours.map((_, h) => ({ label: `Das ${h}h às ${h + 1}h`, tick: `${h}h` }))}
                series={[{ name: BREAKDOWN_METRIC_LABEL[horas.metric], color: META, values: horas.hours, format: 'count' }]}
              />
            </ChartCard>
          )}

          <ChartCard index={11} eyebrow="Meta + CRM" title="Por campanha" subtitle="Toque numa campanha para ver cada anúncio. Toque no nome de uma coluna para ordenar.">
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
        direto. Agendou, compareceu e fechou vêm das etapas do funil do CRM. Idade, gênero, lugar e hora são informados pela Meta.
      </p>
    </ReportFrame>
  );
}

function Funil({ report }: { report: AdsReport }) {
  const passo = (key: FunnelStep['key']) => report.funnel.find((p) => p.key === key)!;
  const [alcance, cliques, conversas] = [passo('reach'), passo('clicks'), passo('conversations')];
  // O funil começa nas conversas: é onde a pessoa vira um contato de verdade.
  const etapas = report.funnel.filter((p) => p.key !== 'reach' && p.key !== 'clicks');
  const largura = (v: number) => (conversas.value > 0 ? Math.max(9, Math.min(100, (v / conversas.value) * 100)) : 9);
  const cor = (p: FunnelStep) => (p.source === 'meta' ? META : CRM);
  // "De cada 100": número inteiro; abaixo de 10, uma casa só quando faz diferença.
  const de100 = (v: number) => {
    const p = (v / conversas.value) * 100;
    return (p >= 10 ? Math.round(p) : Math.round(p * 10) / 10).toLocaleString('pt-BR');
  };

  return (
    <ChartCard
      index={6}
      className="lg:col-span-2"
      eyebrow="Meta + CRM"
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
          <div key={p.key} className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 ring-1 ring-inset ring-foreground/[0.06]">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{p.label}</dt>
            <dd className="viz-num mt-1 text-lg leading-none">{formatCount(p.value)}</dd>
            {p.ofPrevious != null && <dd className="mt-1 text-[11px] text-muted-foreground">{formatRate(p.ofPrevious)} de quem viu</dd>}
          </div>
        ))}
      </dl>

      <ol className="mt-5 space-y-[3px]">
        {etapas.map((p, i) => {
          const [topo, base] = [largura(p.value), etapas[i + 1] ? largura(etapas[i + 1].value) : largura(p.value) * 0.82];
          return (
            <li key={p.key} className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)_minmax(0,5.5rem)] items-center gap-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(0,6.5rem)]">
              <span className="truncate text-[13px]">{p.label}</span>
              <span className="relative block h-12" aria-hidden="true">
                <span
                  className="viz-rise absolute inset-0"
                  style={{
                    clipPath: `polygon(${50 - topo / 2}% 0, ${50 + topo / 2}% 0, ${50 + base / 2}% 100%, ${50 - base / 2}% 100%)`,
                    background: `linear-gradient(180deg, ${cor(p)}, color-mix(in srgb, ${cor(p)} 62%, transparent))`,
                    ['--i' as string]: 6 + i,
                  }}
                >
                  <span className="viz-flow absolute inset-0 opacity-70" style={{ backgroundImage: 'linear-gradient(100deg, transparent 0 40%, rgba(255,255,255,0.22) 50%, transparent 60% 100%)' }} />
                </span>
              </span>
              <span className="text-right">
                <span className="viz-num block text-[15px] leading-none">{formatCount(p.value)}</span>
                {p.ofPrevious != null && <span className="mt-1 block text-[11px] text-muted-foreground">{formatRate(p.ofPrevious)} {i === 0 ? 'dos cliques' : 'seguiram'}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {conversas.value > 0 && (
        <p className="mt-5 rounded-xl bg-foreground/[0.04] px-3 py-2.5 text-sm leading-relaxed text-muted-foreground ring-1 ring-inset ring-foreground/[0.06]">
          De cada 100 pessoas que chamaram no WhatsApp,{' '}
          <strong className="font-semibold text-foreground">{de100(passo('scheduled').value)} agendaram</strong> e{' '}
          <strong className="font-semibold text-foreground" style={{ textShadow: glow(CRM, 12) }}>
            {de100(passo('won').value)} fecharam
          </strong>
          .
        </p>
      )}
    </ChartCard>
  );
}
