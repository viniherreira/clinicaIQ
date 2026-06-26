'use server';

import { auth } from '@clerk/nextjs/server';
import { prisma, getTenantClient } from '@clinicaiq/db';
import { redirect } from 'next/navigation';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

async function requireTenant() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const tenant = await prisma.tenant.findFirst({
    where: { users: { some: { clerkUserId: userId } } },
    select: { id: true },
  });
  if (!tenant) redirect('/onboarding');
  return { tenantId: tenant.id };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function getDashboardData() {
  const { tenantId } = await requireTenant();
  const db = getTenantClient(tenantId);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfDay(subDays(now, 6)); // 7-day window incl. today
  const monthStart = subDays(now, 30);

  const [todayAppointments, weekAppointments, quotes] = await Promise.all([
    db.appointment.findMany({
      where: { startTime: { gte: todayStart, lte: todayEnd } },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        patient: { select: { name: true } },
        professional: { select: { name: true, color: true } },
        procedure: { select: { name: true } },
      },
    }),
    db.appointment.findMany({
      where: { startTime: { gte: weekStart, lte: todayEnd } },
      select: { startTime: true, status: true },
    }),
    db.quote.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { status: true, total: true },
    }),
  ]);

  // ── Today's counts ──────────────────────────────────────────────
  const ACTIVE = ['SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'ATTENDED', 'MISSED'];
  const active = todayAppointments.filter((a) => ACTIVE.includes(a.status));
  const confirmed = todayAppointments.filter((a) => a.status === 'CONFIRMED' || a.status === 'ATTENDED').length;
  const counts = {
    total: active.length,
    confirmed,
    toConfirm: todayAppointments.filter((a) => a.status === 'SCHEDULED' || a.status === 'RESCHEDULED').length,
    attended: todayAppointments.filter((a) => a.status === 'ATTENDED').length,
    missed: todayAppointments.filter((a) => a.status === 'MISSED').length,
    confirmedPct: active.length ? Math.round((confirmed / active.length) * 100) : 0,
  };

  // ── 7-day series ────────────────────────────────────────────────
  const series = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(now, 6 - i);
    const key = format(d, 'yyyy-MM-dd');
    const dayAppts = weekAppointments.filter(
      (a) => format(new Date(a.startTime), 'yyyy-MM-dd') === key && a.status !== 'CANCELLED',
    );
    return {
      label: format(d, 'EEEEEE', { locale: ptBR }).replace('.', ''),
      total: dayAppts.length,
      confirmed: dayAppts.filter((a) => a.status === 'CONFIRMED' || a.status === 'ATTENDED').length,
      isToday: key === format(now, 'yyyy-MM-dd'),
    };
  });

  // ── Quotes (30 days) ────────────────────────────────────────────
  const sentLike = ['SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
  const sent = quotes.filter((q) => sentLike.includes(q.status)).length;
  const accepted = quotes.filter((q) => q.status === 'ACCEPTED');
  const quoteStats = {
    sent,
    accepted: accepted.length,
    conversion: sent ? Math.round((accepted.length / sent) * 100) : 0,
    acceptedValue: accepted.reduce((sum, q) => sum + Number(q.total), 0),
  };

  return {
    today: todayAppointments.map((a) => ({
      id: a.id,
      status: a.status,
      time: format(new Date(a.startTime), 'HH:mm'),
      patient: a.patient.name,
      professional: a.professional.name,
      professionalColor: a.professional.color,
      procedure: a.procedure?.name ?? null,
    })),
    counts,
    series,
    quoteStats,
    dateLabel: format(now, "EEEE, d 'de' MMMM", { locale: ptBR }),
  };
}
