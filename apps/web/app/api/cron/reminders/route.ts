import { NextResponse } from 'next/server';
import { addDays, format, parseISO } from 'date-fns';
import { prisma } from '@clinicaiq/db';
import { WHATSAPP_TEMPLATES } from '@clinicaiq/whatsapp';
import { dispatchAppointmentMessage } from '@/lib/whatsapp';
import { clinicToday } from '@/lib/tz';
import { bearerMatches } from '@/lib/bearer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily reminder job. Vercel Cron hits this once a day (see vercel.json); it
 * sends the confirmation/reminder WhatsApp for every appointment happening
 * *tomorrow* (clinic timezone) that hasn't been reminded yet. Runs across all
 * tenants. Replaces the BullMQ delayed job, which is a no-op without a worker.
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

  // Appointments are stored as wall-clock-in-UTC, so "tomorrow in the clinic"
  // is the UTC calendar day matching tomorrow's clinic date.
  const tomorrow = format(addDays(parseISO(clinicToday()), 1), 'yyyy-MM-dd');
  const from = new Date(`${tomorrow}T00:00:00.000Z`);
  const to = new Date(`${tomorrow}T23:59:59.999Z`);

  const appointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: from, lte: to },
      status: { in: ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] },
      messages: {
        none: { direction: 'OUTBOUND', templateName: WHATSAPP_TEMPLATES.appointmentConfirmation },
      },
    },
    select: { id: true },
    take: 500,
  });

  let sent = 0;
  let failed = 0;
  for (const appt of appointments) {
    try {
      const res = await dispatchAppointmentMessage(appt.id, 'reminder');
      if (res.success) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, date: tomorrow, candidates: appointments.length, sent, failed });
}
