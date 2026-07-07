import { NextResponse } from 'next/server';
import { addDays, format, parseISO } from 'date-fns';
import { prisma } from '@clinicaiq/db';
import { WHATSAPP_TEMPLATES } from '@clinicaiq/whatsapp';
import { dispatchAppointmentMessage } from '@/lib/whatsapp';
import { clinicToday } from '@/lib/tz';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily reminder job. Vercel Cron hits this once a day (see vercel.json); it
 * sends the confirmation/reminder WhatsApp for every appointment happening
 * *tomorrow* (clinic timezone) that hasn't been reminded yet. Runs across all
 * tenants. Replaces the BullMQ delayed job, which is a no-op without a worker.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured — allow (set CRON_SECRET to lock down)
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get('key') === secret;
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
