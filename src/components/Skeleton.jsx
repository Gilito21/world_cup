// Reusable skeleton placeholders for loading states.
// Use these instead of full-page spinners on data-heavy screens so the user
// sees the page structure immediately and only the data-bound parts shimmer.

const shimmer = 'bg-gradient-to-r from-stone-100 via-stone-200/70 to-stone-100 bg-[length:200%_100%] animate-skeleton'

export function SkeletonBox({ className = '' }) {
  return <div className={`${shimmer} rounded-md ${className}`} />
}

export function SkeletonCircle({ size = 40, className = '' }) {
  return <div className={`${shimmer} rounded-full ${className}`} style={{ width: size, height: size }} />
}

// Standings row — avatar + name + score, used in Clasificacion.
// The width of the name bar varies subtly per row so the skeleton doesn't
// feel like a stamped pattern (a common "this looks fake" tell).
const NAME_WIDTHS = ['w-32', 'w-28', 'w-36', 'w-24', 'w-32', 'w-30', 'w-28', 'w-32']
export function StandingsRowSkeleton({ idx = 0 }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-stone-100 last:border-0">
      <SkeletonBox className="w-6 h-4" />
      <SkeletonCircle size={36} />
      <div className="flex-1 space-y-1.5">
        <SkeletonBox className={`h-3 ${NAME_WIDTHS[idx % NAME_WIDTHS.length]}`} />
        <SkeletonBox className="h-2.5 w-20" />
      </div>
      <SkeletonBox className="h-5 w-12" />
    </div>
  )
}

export function StandingsSkeleton({ rows = 8 }) {
  return (
    <div className="card overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <StandingsRowSkeleton key={i} idx={i} />
      ))}
    </div>
  )
}

// Activity feed skeleton — used by LeagueFeed while the RPC is in flight.
export function LeagueFeedSkeleton({ rows = 5 }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-stone-100 flex items-center justify-between">
        <SkeletonBox className="h-3 w-24" />
        <SkeletonBox className="h-3 w-12" />
      </div>
      <ul className="divide-y divide-stone-100">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5">
            <SkeletonCircle size={32} />
            <div className="flex-1 space-y-1.5">
              <SkeletonBox className={`h-3 ${NAME_WIDTHS[i % NAME_WIDTHS.length]}`} />
              <SkeletonBox className="h-2.5 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Match card — used in Pronosticos / Resultados.
// Mirrors the real MatchCard layout closely: header row (date + group +
// countdown), team-score-team row, and the auto-save status line. The goal
// is that the skeleton occupies the same vertical space as the actual card
// so the first render doesn't shift everything once data lands.
export function MatchCardSkeleton() {
  return (
    <div className="card p-3 sm:p-4 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SkeletonBox className="h-3 w-28" />
          <SkeletonBox className="h-3 w-8 rounded" />
        </div>
        <SkeletonBox className="h-4 w-12 rounded-full" />
      </div>
      {/* Teams + score stepper */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <SkeletonBox className="h-3.5 w-20" />
          <SkeletonBox className="h-5 w-7 rounded-sm" />
        </div>
        <div className="flex items-center gap-1.5">
          <SkeletonBox className="h-11 w-[5.5rem] rounded-xl" />
          <SkeletonBox className="h-3 w-1" />
          <SkeletonBox className="h-11 w-[5.5rem] rounded-xl" />
        </div>
        <div className="flex-1 flex items-center justify-start gap-2 min-w-0">
          <SkeletonBox className="h-5 w-7 rounded-sm" />
          <SkeletonBox className="h-3.5 w-20" />
        </div>
      </div>
      {/* Auto-save footer */}
      <div className="pt-2 border-t border-stone-100 flex justify-end">
        <SkeletonBox className="h-3 w-12" />
      </div>
    </div>
  )
}

export function MatchListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </div>
  )
}

// Extras question — used in Extras
export function ExtrasQuestionSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="space-y-2">
        <SkeletonBox className="h-4 w-3/4" />
        <SkeletonBox className="h-3 w-1/2" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SkeletonBox className="h-10" />
        <SkeletonBox className="h-10" />
        <SkeletonBox className="h-10" />
        <SkeletonBox className="h-10" />
      </div>
    </div>
  )
}

export function ExtrasSkeleton({ count = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <ExtrasQuestionSkeleton key={i} />
      ))}
    </div>
  )
}
