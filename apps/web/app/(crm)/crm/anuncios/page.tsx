import Link from 'next/link';
import { CloudOff, Megaphone, UsersRound } from 'lucide-react';
import { prisma } from '@clinicaiq/db';
import { requireCrm } from '@/crm/guard';
import { adsLoginConfig } from '@/crm/ads-account';
import { loadAdsPage } from '@/crm/ads-report';
import { readCrmPrefs } from '@/crm/crm-prefs';
import { asReportPeriod, DEFAULT_REPORT_PERIOD, REPORT_PERIODS } from '@/crm/report-period';
import { AdsConnect } from '@/components/ads-connect';
import { refreshAdsAction } from '../whatsapp/ads-actions';
import { ReportFrame } from '../_components/report/frame';
import { EmptyState } from '../_components/report/parts';
import { AdsReportView } from './_components/report-view';

export const metadata = { title: 'Anúncios' };

/**
 * Anúncios: o que a Meta sabe (gasto, alcance, conversas) junto com o que só o
 * CRM sabe (quem agendou, compareceu e fechou). Daí saem o custo por
 * agendamento, o custo por paciente e o retorno.
 */
export default async function AnunciosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCrm('crm');
  const sp = await searchParams;
  const period = asReportPeriod(typeof sp.periodo === 'string' ? sp.periodo : undefined);
  const campanha = typeof sp.campanha === 'string' && /^\d{5,25}$/.test(sp.campanha) ? sp.campanha : null;

  const frame = { title: 'Anúncios', basePath: '/crm/anuncios', periods: REPORT_PERIODS, period, defaultPeriod: DEFAULT_REPORT_PERIOD };

  // O gasto é da clínica inteira: quem vê só os próprios leads não tem como ler estes números direito.
  if (ctx.ownOnly) {
    return (
      <ReportFrame {...frame}>
        <EmptyState icon={<UsersRound className="h-5 w-5" />} title="Esta tela é para quem vê a clínica inteira">
          <p>
            Os números dos anúncios somam o investimento e os pacientes de toda a clínica. Seu acesso mostra só os seus negócios, então a
            conta não fecharia. Peça a um gestor do CRM para ver com você.
          </p>
        </EmptyState>
      </ReportFrame>
    );
  }

  const data = await loadAdsPage(ctx.tenantId, period, campanha);

  if (data.state === 'not_connected' || data.state === 'choosing') {
    const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { settings: true } });
    return (
      <ReportFrame {...frame}>
        <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <div className="viz-rise space-y-4 py-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <Megaphone className="h-5 w-5" />
            </span>
            <h2 className="text-2xl font-semibold tracking-tight">Descubra quanto custa cada paciente que vem dos anúncios</h2>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              O Gerenciador de Anúncios mostra quantas pessoas chamaram no WhatsApp. O CRM sabe quem agendou e quem fechou. Juntando os
              dois, você vê o que nenhum deles mostra sozinho:
            </p>
            <ul className="space-y-2 text-sm">
              {['Quanto custa cada agendamento e cada paciente novo', 'Qual campanha e qual anúncio trazem quem fecha', 'Quanto voltou para cada real investido'].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <AdsConnect
            connection={{ state: data.connection.state, accountId: data.connection.accountId, accountName: data.connection.accountName, connectedAt: data.connection.connectedAt }}
            login={adsLoginConfig()}
            metaEvents={readCrmPrefs(tenant?.settings).metaEvents}
            canManage={ctx.manager}
          />
        </div>
      </ReportFrame>
    );
  }

  if (data.state === 'error') {
    return (
      <ReportFrame {...frame} refresh={refreshAdsAction}>
        <EmptyState
          icon={<CloudOff className="h-5 w-5" />}
          title={data.kind === 'rate' ? 'A Meta pediu uma pausa' : data.kind === 'auth' || data.kind === 'permission' ? 'A conexão com a Meta precisa ser refeita' : 'Não deu para buscar os números'}
          action={
            data.kind === 'auth' || data.kind === 'permission' ? (
              ctx.manager ? (
                <Link href="/crm/whatsapp" className="btn-primary btn-md">
                  Reconectar em Canais
                </Link>
              ) : undefined
            ) : undefined
          }
        >
          <p>{data.message}</p>
          {data.kind !== 'auth' && data.kind !== 'permission' && <p>Use o botão Atualizar, ali em cima, para tentar de novo. Nada foi perdido: os números continuam na Meta e no CRM.</p>}
          {(data.kind === 'auth' || data.kind === 'permission') && !ctx.manager && <p>Peça a um gestor do CRM para reconectar o Gerenciador de Anúncios.</p>}
        </EmptyState>
      </ReportFrame>
    );
  }

  if (data.state !== 'ok') return null;

  return (
    <AdsReportView
      report={data.report}
      period={period}
      accountName={data.connection.accountName}
      range={data.range}
      fetchedAt={data.fetchedAt}
    />
  );
}
