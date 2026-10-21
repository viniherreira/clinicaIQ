import { NextResponse } from 'next/server';
import { prisma } from '@clinicaiq/db';
import { bearerMatches } from '@/lib/bearer';
import { reconcileSubscriptions } from '@/lib/subscription-sync';
import { refreshAgendaTemplates } from '@/lib/agenda-templates-sync';
import { sendDueReminders } from '@/lib/reminder-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily reminder job. Vercel Cron hits this once a day (see vercel.json); it
 * sends the confirmation/reminder WhatsApp for every appointment that falls on
 * one of the clinic's chosen reminder days (1 week, 3, 2, 1 day before, or the
 * day itself; clinic timezone) and hasn't had that reminder yet. Runs across
 * all tenants. Replaces the BullMQ delayed job, which is a no-op without a worker.
 */
/**
 * Falha fechada, e só pelo cabeçalho.
 *
 * Two things were wrong here. A missing CRON_SECRET used to mean "allow", which
 * left an unauthenticated endpoint that fans out WhatsApp messages to every
 * patient of every clinic — the fastest way to get the clinics' numbers banned,
 * and reachable by anyone who guessed the path. And the secret was also accepted
 * from the query string, where it lands in Vercel's request logs, in any proxy
 * in between, and in browser history.
 */
function authorized(req: Request): boolean {
  return bearerMatches(req, process.env.CRON_SECRET);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Pega carona neste cron porque o plano Hobby da Vercel só permite dois por
  // projeto, e os dois já estão em uso. Roda antes dos lembretes — que podem
  // levar até um minuto e estourar o tempo — e num try próprio, porque uma
  // falha na cobrança não pode impedir a clínica de avisar os pacientes.
  let subscriptions: { checked: number; changed: number } | { error: string };
  try {
    const { checked, changed } = await reconcileSubscriptions();
    subscriptions = { checked, changed };
  } catch {
    subscriptions = { error: 'falhou' };
  }

  // Textos da agenda em análise na Meta: pergunta antes de mandar, para o que
  // foi aprovado desde ontem já sair hoje (o webhook também avisa, mas pode falhar).
  const emAnalise = await prisma.messageTemplate.findMany({
    where: { purpose: { not: null }, status: 'PENDING' },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });
  for (const t of emAnalise) await refreshAgendaTemplates(t.tenantId).catch(() => undefined);

  const porDia = await sendDueReminders();

  return NextResponse.json({
    ok: true,
    reminders: porDia,
    candidates: porDia.reduce((n, d) => n + d.candidates, 0),
    sent: porDia.reduce((n, d) => n + d.sent, 0),
    failed: porDia.reduce((n, d) => n + d.failed, 0),
    subscriptions,
  });
}
