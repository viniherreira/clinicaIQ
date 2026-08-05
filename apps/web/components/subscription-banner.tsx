import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { Access } from '@/lib/subscription';

/**
 * Sits above every screen when the subscription needs attention.
 *
 * Deliberately loud when access is already limited and merely present while
 * there is still time: a clinic that loses the ability to book an appointment
 * mid-morning with no prior warning blames the software, not the invoice.
 */
export function SubscriptionBanner({ access }: { access: Access }) {
  if (!access.warning) return null;

  const blocked = access.level === 'readonly';

  return (
    <div
      role={blocked ? 'alert' : 'status'}
      className={`flex flex-wrap items-center justify-between gap-3 border-b px-6 py-2.5 text-sm ${
        blocked
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
      }`}
    >
      <p className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{access.warning}</span>
      </p>
      <Link
        href="/planos"
        className={`shrink-0 rounded-md px-3 py-1 font-medium underline-offset-2 hover:underline ${
          blocked ? 'bg-destructive text-destructive-foreground no-underline hover:opacity-90' : ''
        }`}
      >
        {blocked ? 'Regularizar agora' : 'Ver planos'}
      </Link>
    </div>
  );
}
