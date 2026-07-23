import { NextResponse } from 'next/server';
import { prisma } from '@clinicaiq/db';
import { WHATSAPP_TEMPLATES } from '@clinicaiq/whatsapp';
import { dispatchBirthdayMessage } from '@/lib/whatsapp';
import { clinicToday } from '@/lib/tz';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured — allow (set CRON_SECRET to lock down)
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get('key') === secret;
}

/**
 * Daily birthday job. Only clinics that paired their own WhatsApp line and
 * switched the automation on are considered — Meta would reject a non-
 * transactional greeting without an approved template.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const today = clinicToday(); // yyyy-MM-dd in the clinic timezone
  const [, month, day] = today.split('-').map(Number);

  const tenants = await prisma.whatsAppSession.findMany({
    where: { status: 'CONNECTED', notifyBirthday: true },
    select: { tenantId: true },
  });
  if (tenants.length === 0) {
    return NextResponse.json({ ok: true, date: today, tenants: 0, candidates: 0, sent: 0, failed: 0 });
  }

  const startOfDay = new Date(`${today}T00:00:00.000Z`);

  const candidates = await prisma.patient.findMany({
    where: {
      tenantId: { in: tenants.map((t) => t.tenantId) },
      active: true,
      deletedAt: null,
      birthDate: { not: null },
      // Don't greet the same person twice if the cron runs more than once.
      messages: {
        none: {
          direction: 'OUTBOUND',
          templateName: WHATSAPP_TEMPLATES.birthday,
          createdAt: { gte: startOfDay },
        },
      },
    },
    select: { id: true, birthDate: true },
    take: 2000,
  });

  const birthdayToday = candidates.filter((p) => {
    if (!p.birthDate) return false;
    // birthDate is stored as a plain calendar date (wall clock as UTC).
    return p.birthDate.getUTCMonth() + 1 === month && p.birthDate.getUTCDate() === day;
  });

  let sent = 0;
  let failed = 0;
  for (const patient of birthdayToday) {
    try {
      const res = await dispatchBirthdayMessage(patient.id);
      if (res.success) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    date: today,
    tenants: tenants.length,
    candidates: birthdayToday.length,
    sent,
    failed,
  });
}
