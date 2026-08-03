/**
 * Decides what a clinic may do based on its subscription.
 *
 * Deliberately pure and date-driven: it never trusts the stored status on its
 * own. A row says ACTIVE until something updates it, and if a cron misses a run
 * — or never ran, as on the day this shipped — a clinic that stopped paying
 * months ago would still read as in good standing. Recomputing from the dates
 * means the worst a missed job can cause is a late e-mail, never free access or
 * a wrongful block.
 */

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED';

/**
 * Days a clinic keeps working after the due date. A dental clinic with a full
 * schedule cannot lose its system mid-morning over a boleto that is one day
 * late — the support call costs more than the invoice.
 */
export const GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessLevel =
  /** Everything works. */
  | 'full'
  /** Can read and print, cannot create or change. Data stays visible. */
  | 'readonly';

export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  /** Explicit grace end. When absent it is derived from the due date. */
  graceEndsAt: Date | null;
  cancelledAt: Date | null;
}

export interface Access {
  level: AccessLevel;
  /** Recomputed from the dates — may differ from what is stored. */
  status: SubscriptionStatus;
  /** Whole days until the next transition; null when nothing is pending. */
  daysLeft: number | null;
  /** What to show the clinic, already in plain Portuguese. Null when in order. */
  warning: string | null;
  /** True while payment is overdue but access continues. */
  inGrace: boolean;
}

/** Rounds up: half a day left still reads as "1 dia". */
const daysBetween = (from: Date, to: Date) => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function graceEnd(snapshot: SubscriptionSnapshot): Date {
  if (snapshot.graceEndsAt) return snapshot.graceEndsAt;
  return new Date(snapshot.currentPeriodEnd.getTime() + GRACE_DAYS * DAY_MS);
}

export function resolveAccess(snapshot: SubscriptionSnapshot, now: Date = new Date()): Access {
  // Cancelling is the clinic's own decision, so there is no warning to give and
  // nothing to chase — but the records stay readable. Their patient history is
  // theirs, and locking them out of it would be indefensible.
  if (snapshot.status === 'CANCELLED' || snapshot.cancelledAt) {
    return {
      level: 'readonly',
      status: 'CANCELLED',
      daysLeft: null,
      warning: 'Assinatura encerrada. Seus dados seguem disponíveis para consulta.',
      inGrace: false,
    };
  }

  if (snapshot.status === 'TRIALING' && snapshot.trialEndsAt) {
    const left = daysBetween(now, snapshot.trialEndsAt);
    if (left > 0) {
      return {
        level: 'full',
        status: 'TRIALING',
        daysLeft: left,
        // Silent until the end is close enough to matter.
        warning:
          left <= 5
            ? `Seu teste termina em ${left} ${plural(left, 'dia', 'dias')}. Escolha um plano para não perder o acesso.`
            : null,
        inGrace: false,
      };
    }
    // Trial ran out: same treatment as an unpaid invoice, grace included.
  }

  const due = snapshot.status === 'TRIALING' ? (snapshot.trialEndsAt ?? snapshot.currentPeriodEnd) : snapshot.currentPeriodEnd;

  if (now < due) {
    return { level: 'full', status: 'ACTIVE', daysLeft: daysBetween(now, due), warning: null, inGrace: false };
  }

  const limit =
    snapshot.status === 'TRIALING' && snapshot.trialEndsAt
      ? new Date(snapshot.trialEndsAt.getTime() + GRACE_DAYS * DAY_MS)
      : graceEnd(snapshot);

  if (now < limit) {
    const left = daysBetween(now, limit);
    return {
      level: 'full',
      status: 'PAST_DUE',
      daysLeft: left,
      warning: `Pagamento em atraso. O acesso será limitado em ${left} ${plural(left, 'dia', 'dias')}.`,
      inGrace: true,
    };
  }

  return {
    level: 'readonly',
    status: 'SUSPENDED',
    daysLeft: null,
    warning: 'Acesso limitado por falta de pagamento. Regularize para voltar a usar o sistema.',
    inGrace: false,
  };
}

/** A clinic with no subscription row at all — never onboarded to billing. */
export const NO_SUBSCRIPTION: Access = {
  level: 'readonly',
  status: 'SUSPENDED',
  daysLeft: null,
  warning: 'Nenhum plano ativo. Escolha um plano para usar o sistema.',
  inGrace: false,
};

export const canWrite = (access: Access): boolean => access.level === 'full';
