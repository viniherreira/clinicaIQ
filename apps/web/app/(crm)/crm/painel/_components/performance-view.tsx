import Link from 'next/link';
import { CalendarDays, CalendarRange, Clock3, Flame, Hourglass, Receipt } from 'lucide-react';
import type { PerformanceData } from '@/crm/performance';
import { formatMinutes } from '@/crm/dashboard-math';
import { formatCount, formatRate } from '@/crm/ads-rules';
import { formatCents, initials } from '@/crm/format';
import { rangeText } from '@/crm/period';
import { bestIndex, monthLabel, peakText, WEEKDAYS, WEEKDAYS_SHORT } from '@/crm/performance-rules';
import { DEFAULT_REPORT_PERIOD, PREVIOUS_LABEL, REPORT_PERIODS, type ReportPeriodKey } from '@/crm/report-period';
import { ColumnChart, Heatmap } from '../../_components/report/charts';
import { ReportFrame } from '../../_components/report/frame';
import { BarList, CARD, ChartCard, Insight, Legend, StatTile } from '../../_components/report/parts';
import { glow } from '../../_components/report/viz-math';

const AZUL = 'var(--viz-meta)';
const VERDE = 'var(--viz-crm)';
const SEMANAS = ['Dias 1 a 7', 'Dias 8 a 14', 'Dias 15 a 21', 'Dias 22 a 28', 'Dias 29 a 31'];

/** O Painel com os números. Todo gráfico tem os mesmos números em tabela ("Ver em tabela"). */
export function PerformanceView({ data: d, period, ownOnly }: { data: PerformanceData; period: ReportPeriodKey; ownOnly: boolean }) {
  const k = d.kpis;
  const versus = PREVIOUS_LABEL[period];
  const a = d.arrivals;
  const totalOrigens = d.sources.reduce((s, o) => s + o.leads, 0);
  const totalPerdas = d.lostReasons.reduce((s, o) => s + o.count, 0);
  const [melhorDia, melhorSemana, melhorHora] = [bestIndex(a.byWeekday), bestIndex(a.byWeekOfMonth), bestIndex(a.byHour)];
  const maiorFaturamento = Math.max(1, ...d.team.map((p) => p.revenueCents));
  const parte = (n: number, total: number) => (total > 0 ? formatRate(n / total) : '0%');

  return (
    <ReportFrame title="Painel" basePath="/crm/painel" periods={REPORT_PERIODS} period={period} defaultPeriod={DEFAULT_REPORT_PERIOD}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{ownOnly ? 'Seus números' : 'A clínica inteira'}</span> · {rangeText(d.range.since, d.range.until)} · as setas comparam com {versus}
        </p>
        {(k.overdueTasks > 0 || k.awaitingReply > 0) && (
          <div className="flex flex-wrap gap-2 text-sm">
            {k.awaitingReply > 0 && (
              <Link
                href="/crm/conversas?aba=unanswered"
                className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-900 hover:border-amber-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-amber-200"
              >
                <strong className="font-mono font-semibold tabular-nums">{k.awaitingReply}</strong>
                {k.awaitingReply === 1 ? 'conversa esperando resposta' : 'conversas esperando resposta'}
              </Link>
            )}
            {k.overdueTasks > 0 && (
              <Link
                href="/crm?tarefa=overdue"
                className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-red-800 hover:border-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-red-200"
              >
                <strong className="font-mono font-semibold tabular-nums">{k.overdueTasks}</strong>
                {k.overdueTasks === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
              </Link>
            )}
          </div>
        )}
      </div>

      <section aria-label="Números do período">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
          <StatTile
            lead
            className="col-span-2 md:col-span-1 xl:col-span-2"
            index={0}
            label="Leads novos"
            value={k.newLeads.value ?? 0}
            format="count"
            hint="Quantas pessoas novas entraram no CRM neste período, por qualquer canal."
            change={k.newLeads.change}
            tone={k.newLeads.tone}
            versus={versus}
            trend={d.months.map((m) => m.leads)}
            detail="A curva ao fundo mostra os últimos 12 meses."
          />
          <StatTile
            index={1}
            label="Lead que agendou"
            value={k.leadToScheduled.value}
            format="rate"
            ring={k.leadToScheduled.value}
            hint="De cada 100 pessoas que chegaram no período, quantas agendaram uma avaliação."
            change={k.leadToScheduled.change}
            tone={k.leadToScheduled.tone}
            versus={versus}
          />
          <StatTile
            index={2}
            label="Agendou e fechou"
            value={k.scheduledToWon.value}
            format="rate"
            ring={k.scheduledToWon.value}
            color={VERDE}
            hint="Das pessoas que agendaram, quantas fecharam negócio. Quem chegou há pouco tempo ainda pode fechar."
            change={k.scheduledToWon.change}
            tone={k.scheduledToWon.tone}
            versus={versus}
          />
          <StatTile
            index={3}
            label="Faturado"
            value={k.revenueCents.value ?? 0}
            format="money0"
            color={VERDE}
            hint="A soma do valor dos negócios fechados neste período."
            change={k.revenueCents.change}
            tone={k.revenueCents.tone}
            versus={versus}
            detail={`${formatCount(k.won)} ${k.won === 1 ? 'negócio fechado' : 'negócios fechados'}`}
          />
          <StatTile
            index={4}
            label="Primeira resposta"
            value={k.responseMinutes.value}
            format="minutes"
            hint="Quanto tempo a pessoa espera até alguém da equipe responder no WhatsApp. É a mediana: metade das conversas foi respondida em até esse tempo. O robô não conta."
            change={k.responseMinutes.change}
            tone={k.responseMinutes.tone}
            versus={versus}
          />
          <StatTile
            index={5}
            label="No funil agora"
            value={k.openLeads}
            format="count"
            hint="Negócios abertos neste momento, em qualquer etapa. Não depende do período."
            detail={`${formatCents(k.openValueCents)} em negociação`}
          />
        </ul>
      </section>

      <section aria-label="Destaques">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Insight index={6} icon={<Flame className="h-[18px] w-[18px]" />} label="Horário de pico" value={a.peak ? peakText(a.peak) : 'Sem dados ainda'} note={a.peak ? `${formatCount(a.peak.n)} leads nesse horário` : undefined} />
          <Insight
            index={7}
            icon={<CalendarDays className="h-[18px] w-[18px]" />}
            label="Melhor dia da semana"
            value={melhorDia == null ? 'Sem dados ainda' : WEEKDAYS[melhorDia]}
            note={melhorDia == null ? undefined : `${parte(a.byWeekday[melhorDia], a.total)} dos leads`}
          />
          <Insight
            index={8}
            icon={<CalendarRange className="h-[18px] w-[18px]" />}
            label="Melhor semana do mês"
            value={melhorSemana == null ? 'Sem dados ainda' : SEMANAS[melhorSemana]}
            note={melhorSemana == null ? undefined : `${parte(a.byWeekOfMonth[melhorSemana], a.total)} dos leads`}
          />
          <Insight
            index={9}
            color={VERDE}
            icon={<Receipt className="h-[18px] w-[18px]" />}
            label="Ticket médio"
            value={k.ticketCents.value == null ? 'Sem fechamentos' : formatCents(k.ticketCents.value)}
            note="por negócio fechado"
          />
          <Insight
            index={10}
            color={VERDE}
            icon={<Hourglass className="h-[18px] w-[18px]" />}
            label="Tempo até fechar"
            value={k.cycleDays == null ? 'Sem fechamentos' : `${k.cycleDays.toLocaleString('pt-BR', { maximumFractionDigits: k.cycleDays < 10 ? 1 : 0 })} ${k.cycleDays === 1 ? 'dia' : 'dias'}`}
            note="do 1º contato ao fechamento"
          />
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard
          index={11}
          className="lg:col-span-3"
          eyebrow={`Últimos ${a.days} dias`}
          title="Quando os leads chegam"
          subtitle="Dia da semana por hora, no horário de Brasília. Quanto mais forte a cor, mais leads. Mostra quando ter gente respondendo."
          table={{
            columns: ['Dia', 'Hora', 'Leads'],
            rows: a.grid.flatMap((dia, i) => dia.map((n, h) => [WEEKDAYS[i], `${h}h`, n] as [string, string, number])).filter((r) => r[2] > 0),
          }}
        >
          {a.total === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Ainda não há leads suficientes para mostrar os horários.</p> : <Heatmap cells={a.grid} />}
        </ChartCard>

        <ChartCard index={12} className="lg:col-span-2" eyebrow={`Últimos ${a.days} dias`} title="Os 5 horários mais cheios" subtitle="Onde mais chega gente nova.">
          <BarList
            empty="Ainda não há leads suficientes."
            items={a.top.map((t) => ({
              label: `${WEEKDAYS[t.day]} · ${t.hour}h às ${t.hour + 1}h`,
              value: t.n,
              display: formatCount(t.n),
              note: parte(t.n, a.total),
            }))}
          />
        </ChartCard>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <ChartCard
          index={13}
          className="md:col-span-2"
          eyebrow={`Últimos ${a.days} dias`}
          title="Por hora do dia"
          subtitle={
            melhorHora == null ? (
              'Em que horas do dia chegam mais leads, somando todos os dias.'
            ) : (
              <>
                A hora mais cheia é <strong className="font-semibold text-foreground">das {melhorHora}h às {melhorHora + 1}h</strong>, com {parte(a.byHour[melhorHora], a.total)} dos leads.
              </>
            )
          }
          table={{ columns: ['Hora', 'Leads'], rows: a.byHour.map((n, h) => [`${h}h`, n]) }}
        >
          <ColumnChart
            peak
            height={148}
            maxTicks={12}
            label="Leads por hora do dia"
            points={a.byHour.map((_, h) => ({ label: `Das ${h}h às ${h + 1}h`, tick: `${h}h` }))}
            series={[{ name: 'leads', color: AZUL, values: a.byHour, format: 'count' }]}
          />
        </ChartCard>

        <ChartCard
          index={14}
          eyebrow={`Últimos ${a.days} dias`}
          title="Por dia da semana"
          subtitle={
            melhorDia == null ? (
              'Em que dias chegam mais leads.'
            ) : (
              <>
                O dia mais cheio é <strong className="font-semibold text-foreground">{WEEKDAYS[melhorDia].toLowerCase()}</strong>.
              </>
            )
          }
          table={{ columns: ['Dia', 'Leads'], rows: a.byWeekday.map((n, i) => [WEEKDAYS[i], n]) }}
        >
          <ColumnChart
            peak
            height={148}
            label="Leads por dia da semana"
            points={WEEKDAYS.map((w, i) => ({ label: w, tick: WEEKDAYS_SHORT[i] }))}
            series={[{ name: 'leads', color: AZUL, values: a.byWeekday, format: 'count' }]}
          />
        </ChartCard>

        <ChartCard
          index={15}
          eyebrow={`Últimos ${a.days} dias`}
          title="Por semana do mês"
          subtitle={
            melhorSemana == null ? (
              'Em que parte do mês chegam mais leads.'
            ) : (
              <>
                Chega mais gente nos <strong className="font-semibold text-foreground">{SEMANAS[melhorSemana].toLowerCase()}</strong>. A 5ª semana só tem os dias 29 a 31.
              </>
            )
          }
          table={{ columns: ['Semana', 'Leads'], rows: a.byWeekOfMonth.map((n, i) => [SEMANAS[i], n]) }}
        >
          <ColumnChart
            peak
            height={148}
            label="Leads por semana do mês"
            points={SEMANAS.map((sem, i) => ({ label: `${i + 1}ª semana (${sem.toLowerCase()})`, tick: `${i + 1}ª` }))}
            series={[{ name: 'leads', color: AZUL, values: a.byWeekOfMonth, format: 'count' }]}
          />
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard
          index={16}
          className="lg:col-span-3"
          eyebrow="12 meses"
          title="Leads por mês"
          subtitle="Quem chegou e quem fechou em cada mês."
          legend={<Legend items={[{ label: 'Chegaram', color: AZUL }, { label: 'Fecharam', color: VERDE }]} />}
          table={{ columns: ['Mês', 'Chegaram', 'Fecharam'], rows: d.months.map((m) => [monthLabel(m.ym).label, m.leads, m.won]) }}
        >
          <ColumnChart
            height={188}
            maxTicks={12}
            label="Leads que chegaram e que fecharam, por mês"
            points={d.months.map((m) => monthLabel(m.ym))}
            series={[
              { name: 'chegaram', color: AZUL, values: d.months.map((m) => m.leads), format: 'count' },
              { name: 'fecharam', color: VERDE, values: d.months.map((m) => m.won), format: 'count' },
            ]}
          />
        </ChartCard>

        <ChartCard index={17} className="lg:col-span-2" title="De onde vêm" subtitle="Os leads novos do período, por canal, e quantos já fecharam.">
          <BarList
            empty="Nenhum lead novo neste período."
            items={d.sources.map((o) => ({
              label: o.label,
              value: o.leads,
              display: formatCount(o.leads),
              note: `${parte(o.leads, totalOrigens)} · ${o.won} ${o.won === 1 ? 'fechou' : 'fecharam'}`,
            }))}
          />
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard index={18} className="lg:col-span-3" title="Por onde passaram" subtitle="Dos leads que chegaram no período, quantos passaram por cada etapa e quantos foram perdidos nela.">
          <BarList
            ranked={false}
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

        <ChartCard
          index={19}
          className="lg:col-span-2"
          title="Por que perdemos"
          subtitle={`${formatCount(k.lost)} ${k.lost === 1 ? 'negócio perdido' : 'negócios perdidos'} no período, pelo motivo.`}
        >
          <BarList
            empty="Nenhum negócio perdido neste período."
            items={d.lostReasons.map((m) => ({ label: m.label, value: m.count, display: formatCount(m.count), note: parte(m.count, totalPerdas) }))}
          />
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard index={20} className="lg:col-span-2" color={VERDE} title="Procedimentos mais procurados" subtitle="O interesse dos leads novos do período, e quanto cada um já faturou.">
          <BarList
            color={VERDE}
            empty="Nenhum lead do período tem procedimento de interesse."
            items={d.procedures.map((p) => ({
              label: p.label,
              value: p.leads,
              display: formatCount(p.leads),
              note: p.won > 0 ? `${p.won} ${p.won === 1 ? 'fechou' : 'fecharam'} · ${formatCents(p.revenueCents)}` : 'nenhum fechou ainda',
            }))}
          />
        </ChartCard>

        <ChartCard
          index={21}
          className="lg:col-span-3"
          title="Equipe"
          subtitle={ownOnly ? 'Seus números no período.' : 'Quem atendeu, agendou e fechou no período. Agendou e fechou contam para quem é o responsável do negócio.'}
        >
          {d.team.length === 0 && d.bot.attended === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Ninguém atendeu, agendou ou fechou neste período.</p>
          ) : (
            <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full text-sm">
                <caption className="sr-only">Desempenho de cada pessoa da equipe no período</caption>
                <thead>
                  <tr className="border-b border-border/70 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <th scope="col" className="pb-2 font-medium">Pessoa</th>
                    <th scope="col" className="px-3 pb-2 text-right font-medium">Atendeu</th>
                    <th scope="col" className="px-3 pb-2 text-right font-medium">Agendou</th>
                    <th scope="col" className="px-3 pb-2 text-right font-medium">Fechou</th>
                    <th scope="col" className="px-3 pb-2 text-right font-medium">Faturou</th>
                    <th scope="col" className="pb-2 pl-3 text-right font-medium">1ª resposta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {d.team.map((p, i) => (
                    <tr key={p.id}>
                      <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                        <span className="flex items-center gap-2.5">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold"
                            style={{
                              background: `color-mix(in srgb, ${i === 0 ? VERDE : AZUL} 16%, transparent)`,
                              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${i === 0 ? VERDE : AZUL} 45%, transparent)${i === 0 ? `, ${glow(VERDE, 10)}` : ''}`,
                            }}
                            aria-hidden="true"
                          >
                            {initials(p.name)}
                          </span>
                          <span className="max-w-[11rem] truncate">{p.name}</span>
                        </span>
                      </th>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCount(p.attended)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCount(p.scheduled)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCount(p.won)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="font-mono tabular-nums">{formatCents(p.revenueCents)}</span>
                        <span className="viz-track ml-auto mt-1 block h-1 w-20 overflow-hidden rounded-full" aria-hidden="true">
                          <span className="viz-grow-x block h-full rounded-full" style={{ width: `${(p.revenueCents / maiorFaturamento) * 100}%`, background: VERDE, boxShadow: glow(VERDE, 6) }} />
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono tabular-nums">{p.responseMinutes == null ? <span className="text-muted-foreground">–</span> : formatMinutes(p.responseMinutes)}</td>
                    </tr>
                  ))}
                  {d.bot.attended > 0 && (
                    <tr className="text-muted-foreground">
                      <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] font-mono text-[11px] ring-1 ring-inset ring-foreground/10" aria-hidden="true">
                            RB
                          </span>
                          Robô
                        </span>
                      </th>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCount(d.bot.attended)}</td>
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
      </div>

      <p className={`${CARD} flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground`}>
        <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-foreground">Tempo online de cada pessoa</span> · em breve
        </span>
      </p>
    </ReportFrame>
  );
}
