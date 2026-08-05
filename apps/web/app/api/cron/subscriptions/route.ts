import { NextResponse } from 'next/server';
import { prisma } from '@clinicaiq/db';
import { resolveAccess } from '@/lib/subscription';

/**
 * Daily reconciliation of subscription statuses.
 *
 * The stored status is a convenience, not the source of truth — `resolveAccess`
 * decides from the dates on every request, so a day this job does not run costs
 * nothing in correctness. What it buys is a status column that matches reality
 * for anyone reading the table directly, and a single place to hang reminders.
 */

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron signs its calls with this header. No secret configured means
  // the endpoint stays shut rather than open to anyone who guesses the path.
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: { status: { notIn: ['CANCELLED'] } },
    select: {
      id: true,
      tenantId: true,
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      graceEndsAt: true,
      cancelledAt: true,
    },
  });

  let changed = 0;
  const transitions: { tenantId: string; from: string; to: string }[] = [];

  for (const sub of subscriptions) {
    const access = resolveAccess(sub, now);
    if (access.status === sub.status) continue;

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: access.status,
        // Pin the grace window the first time we notice the due date passed, so
        // it cannot drift if the clinic's period end is later edited.
        ...(access.status === 'PAST_DUE' && !sub.graceEndsAt
          ? { graceEndsAt: new Date(sub.currentPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1000) }
          : {}),
      },
    });
    transitions.push({ tenantId: sub.tenantId, from: sub.status, to: access.status });
    changed += 1;
  }

  return NextResponse.json({ ok: true, checked: subscriptions.length, changed, transitions });
}
