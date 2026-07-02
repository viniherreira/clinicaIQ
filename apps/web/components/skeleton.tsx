/** Building blocks for route-level loading states. Pure CSS pulse — shown
 *  instantly on navigation so pages never feel frozen. */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-alt ${className}`} />;
}

export function PageSkeleton({ cards = 4, rows = 6 }: { cards?: number; rows?: number }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {cards > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border p-4 last:border-0">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgendaSkeleton() {
  return (
    <div className="flex h-full" aria-busy="true" aria-label="Carregando agenda">
      <div className="hidden w-60 shrink-0 space-y-4 border-r border-border bg-surface p-4 lg:block">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <div className="flex-1 space-y-0">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-52" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-12" />
              <Skeleton className={`h-10 flex-1 ${i % 3 === 1 ? 'opacity-60' : i % 3 === 2 ? 'opacity-30' : ''}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
