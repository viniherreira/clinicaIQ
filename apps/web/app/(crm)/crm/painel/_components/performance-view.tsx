import Link from 'next/link';
import { Clock3 } from 'lucide-react';
import type { PerformanceData } from '@/crm/performance';
import { formatMinutes } from '@/crm/dashboard-math';
import { formatCount, formatRate } from '@/crm/ads-rules';
import { formatCents } from '@/crm/format';
import { rangeText } from '@/crm/period';
import { monthLabel, peakText, WEEKDAYS, WEEKDAYS_SHORT } from '@/crm/performance-rules';
import { DEFAULT_REPORT_PERIOD, PREVIOUS_LABEL, REPORT_PERIODS, type ReportPeriodKey } from '@/crm/report-period';
import { ColumnChart, Heatmap } from '../../_components/report/charts';
import { ReportFrame } from '../../_components/report/frame';
import { BarList, CARD, ChartCard, Legend, StatTile } from '../../_components/report/parts';

const AZUL = 'var(--viz-meta)';
const VERDE = 'var(--viz-crm)';

/** O Painel com os números. Todo gráfico tem os mesmos números em tabela ("Ver em tabela"). */
export function PerformanceView({ data: d, period, ownOnly }: { data: PerformanceData; period: ReportPeriodKey; ownOnly: boolean }) {
  const k = d.kpis;
  const versus = PREVIOUS_LABEL[period];
  const taxa = (v: number | null) => (v == null ? '–' : formatRate(v));
  const a = d.arrivals;
  const totalOrigens = d.sources.reduce((s, o) => s + o.leads, 0);
  const totalPerdas = d.lostReasons.reduce((s, o) => s + o.count, 0);
  const semanas = ['Dias 1 a 7', 'Dias 8 a 14', 'Dias 15 a 21', 'Dias 22 a 28', 'Dias 29 a 31'];

  return (
    <ReportFrame title="Painel" basePath="/crm/painel" periods={REPORT_PERIODS} period={period} defaultPeriod={DEFAULT_REPORT_PERIOD}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-muted-foreground">
          {ownOnly ? 'Seus números' : 'A clínica inteira'} · {rangeText(d.range.since, d.range.until)} · as setas comparam com {versus}
        </p>
        {(k.overdueTasks > 0 || k.awaitingReply > 0) && (
          <div className="flex flex-wrap gap-2 text-sm">
            {k.awaitingReply > 0 && (
              <Link href="/crm/conversas?aba=unanswered" className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-50 px-3 py-1 text-amber-900 hover:border-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-amber-950/40 dark:text-amber-200">
                <strong className="font-semibold tabular-nums">{k.awaitingReply}</strong>
                {k.awaitingReply === 1 ? 'conversa esperando resposta' : 'conversas esperando resposta'}
              </Link>
            )}
            {k.overdueTasks > 0 && (
              <Link href="/crm?tarefa=overdue" className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-50 px-3 py-1 text-red-800 hover:border-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-red-950/40 dark:text-red-200">
                <strong className="font-semibold tabular-nums">{k.overdueTasks}</strong>
                {k.overdueTasks === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
              </Link>
            )}
          </div>
        )}
      </div>

      <section aria-label="Números do período">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
          <div className="contents [&>li]:col-span-2 md:[&>li]:col-span-1 xl:[&>li]:col-span-2">
            <StatTile
              lead
              index={0}
              label="Leads novos"
              value={formatCount(k.newLeads.value ?? 0)}
              hint="Quantas pessoas novas entraram no CRM neste período, por qualquer canal."
              change={k.newLeads.change}
              tone={k.newLeads.tone}
              versus={versus}
            />
          </div>
          <StatTile
            index={1}
            label="Lead que agendou"
            value={taxa(k.leadToScheduled.value)}
            hint="De cada 100 pessoas que chegaram no período, quantas agendaram uma avaliação."
            change={k.leadToScheduled.change}
            tone={k.leadToScheduled.tone}
            versus={versus}
          />
          <StatTile
            index={2}
            label="Agendou e fechou"
            value={taxa(k.scheduledToWon.value)}
            hint="Das pessoas que agendaram, quantas fecharam negócio. Quem chegou há pouco tempo ainda pode fechar."
            change={k.scheduledToWon.change}
            tone={k.scheduledToWon.tone}
            versus={versus}
          />
          <StatTile
            index={3}
            label="Faturado"
            value={formatCents(k.revenueCents.value ?? 0)}
            hint="A soma do valor dos negócios fechados neste período."
            change={k.revenueCents.change}
            tone={k.revenueCents.tone}
            versus={versus}
            detail={`${formatCount(k.won)} ${k.won === 1 ? 'negócio fechado' : 'negócios fechados'}`}
          />
          <StatTile
            index={4}
            label="Primeira resposta"
            value={k.responseMinutes.value == null ? '–' : formatMinutes(k.responseMinutes.value)}
            hint="Quanto tempo a pessoa espera até alguém da equipe responder no WhatsApp. É a mediana: metade das conversas foi respondida em até esse tempo. O robô não conta."
            change={k.responseMinutes.change}
            tone={k.responseMinutes.tone}
            versus={versus}
          />
          <StatTile
            index={5}
            label="No funil agora"
            value={formatCount(k.openLeads)}
            hint="Negócios abertos neste momento, em qualquer etapa. Não depende do período."
            detail={`${formatCents(k.openValueCents)} em negociação`}
          />
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard
          index={6}
          className="lg:col-span-3"
          title="Quando os leads chegam"
          subtitle={
            a.peak ? (
              <>
                Horário de pico: <strong className="font-semibold text-foreground">{peakText(a.peak)}</strong>. Mostra quando ter gente respondendo.
              </>
            ) : (
              'Mostra quando ter gente respondendo.'
            )
          }
          table={{
            columns: ['Dia', 'Hora', 'Leads'],
            rows: a.grid.flatMap((dia, i) => dia.map((n, h) => [WEEKDAYS[i], `${h}h`, n] as [string, string, number])).filter((r) => r[2] > 0),
          }}
        >
          {a.total === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Ainda não há leads suficientes para mostrar os horários.</p>
          ) : (
            <Heatmap cells={a.grid} />
          )}
          <p className="mt-3 text-xs text-muted-foreground">Leads dos últimos {a.days} dias, no horário de Brasília.</p>
        </ChartCard>

        <div className="grid gap-5 lg:col-span-2">
          <ChartCard
            index={7}
            title="Por dia da semana"
            table={{ columns: ['Dia', 'Leads'], rows: a.byWeekday.map((n, i) => [WEEKDAYS[i], n]) }}
          >
            <ColumnChart
              height={96}
              label="Leads por dia da semana"
              points={WEEKDAYS.map((w, i) => ({ label: w, tick: WEEKDAYS_SHORT[i] }))}
              series={[{ name: 'leads', color: AZUL, values: a.byWeekday, format: 'count' }]}
            />
          </ChartCard>
          <ChartCard
            index={8}
            title="Por semana do mês"
            table={{ columns: ['Semana', 'Leads'], rows: a.byWeekOfMonth.map((n, i) => [semanas[i], n]) }}
          >
            <ColumnChart
              height={96}
              label="Leads por semana do mês"
              points={semanas.map((s, i) => ({ label: s, tick: `${i + 1}ª` }))}
              series={[{ name: 'leads', color: AZUL, values: a.byWeekOfMonth, format: 'count' }]}
            />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard
          index={9}
          className="lg:col-span-3"
          title="Leads por mês"
          subtitle="Os últimos 12 meses: quem chegou e quem fechou em cada mês."
          legend={<Legend items={[{ label: 'Chegaram', color: AZUL }, { label: 'Fecharam', color: VERDE }]} />}
          table={{ columns: ['Mês', 'Chegaram', 'Fecharam'], rows: d.months.map((m) => [monthLabel(m.ym).label, m.leads, m.won]) }}
        >
          <ColumnChart
            height={184}
            label="Leads que chegaram e que fecharam, por mês"
            points={d.months.map((m) => monthLabel(m.ym))}
            series={[
              { name: 'chegaram', color: AZUL, values: d.months.map((m) => m.leads), format: 'count' },
              { name: 'fecharam', color: VERDE, values: d.months.map((m) => m.won), format: 'count' },
            ]}
          />
        </ChartCard>

        <ChartCard index={10} className="lg:col-span-2" title="De onde vêm" subtitle="Os leads novos do período, por canal, e quantos já fecharam.">
          <BarList
            empty="Nenhum lead novo neste período."
            items={d.sources.map((o) => ({
              label: o.label,
              value: o.leads,
              display: formatCount(o.leads),
              note: `${formatRate(o.leads / Math.max(1, totalOrigens))} · ${o.won} ${o.won === 1 ? 'fechou' : 'fecharam'}`,
            }))}
          />
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard
          index={11}
          className="lg:col-span-3"
          title="Por onde passaram"
          subtitle="Dos leads que chegaram no período, quantos passaram por cada etapa e quantos foram perdidos nela."
        >
          <BarList
            empty="Nenhum lead novo neste período."
            items={d.stages
              .filter((s) => s.reached > 0 || s.lostHere > 0)
              .map((s) => ({
                label: s.name,
                value: s.reached,
                display: formatCount(s.reached),
                note: s.lostHere > 0 ? `${s.lostHere} ${s.lostHere === 1 ? 'perdido aqui' : 'perdidos aqui'}` : undefined,
              }))}
          />
        </ChartCard>

        <ChartCard index={12} className="lg:col-span-2" title="Por que perdemos" subtitle="Os motivos dos negócios perdidos no período.">
          <BarList
            empty="Nenhum negócio perdido neste período."
            items={d.lostReasons.map((m) => ({
              label: m.label,
              value: m.count,
              display: formatCount(m.count),
              note: formatRate(m.count / Math.max(1, totalPerdas)),
            }))}
          />
        </ChartCard>
      </div>

      <ChartCard
        index={13}
        title="Equipe"
        subtitle={ownOnly ? 'Seus números no período.' : 'Quem atendeu, agendou e fechou no período. Agendou e fechou contam para quem é o responsável do negócio.'}
      >
        {d.team.length === 0 && d.bot.attended === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Ninguém atendeu, agendou ou fechou neste período.</p>
        ) : (
          <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full text-sm">
              <caption className="sr-only">Desempenho de cada pessoa da equipe no período</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 font-medium">Pessoa</th>
                  <th scope="col" className="px-3 pb-2 text-right font-medium">Conversas atendidas</th>
                  <th scope="col" className="px-3 pb-2 text-right font-medium">Agendou</th>
                  <th scope="col" className="px-3 pb-2 text-right font-medium">Fechou</th>
                  <th scope="col" className="px-3 pb-2 text-right font-medium">Faturou</th>
                  <th scope="col" className="pb-2 pl-3 text-right font-medium">Primeira resposta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {d.team.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="max-w-[14rem] truncate py-2.5 pr-3 text-left font-medium">{p.name}</th>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(p.attended)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(p.scheduled)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(p.won)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCents(p.revenueCents)}</td>
                    <td className="py-2.5 pl-3 text-right tabular-nums">{p.responseMinutes == null ? <span className="text-muted-foreground">–</span> : formatMinutes(p.responseMinutes)}</td>
                  </tr>
                ))}
                {d.bot.attended > 0 && (
                  <tr className="text-muted-foreground">
                    <th scope="row" className="py-2.5 pr-3 text-left font-medium">Robô</th>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(d.bot.attended)}</td>
                    <td className="px-3 py-2.5 text-right">–</td>
                    <td className="px-3 py-2.5 text-right">–</td>
                    <td className="px-3 py-2.5 text-right">–</td>
                    <td className="py-2.5 pl-3 text-right">na hora</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <p className={`${CARD} flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground`}>
        <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-foreground">Tempo online de cada pessoa</span> · em breve
        </span>
      </p>
    </ReportFrame>
  );
}
