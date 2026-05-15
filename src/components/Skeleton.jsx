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

// Standings row — avatar + name + score, used in Clasificacion
export function StandingsRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 border-b border-stone-100 last:border-0">
      <SkeletonBox className="w-6 h-4" />
      <SkeletonCircle size={36} />
      <div className="flex-1 space-y-1.5">
        <SkeletonBox className="h-3 w-32" />
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
        <StandingsRowSkeleton key={i} />
      ))}
    </div>
  )
}

// Match card — used in Pronosticos / Resultados
export function MatchCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SkeletonBox className="h-3 w-24" />
        <SkeletonBox className="h-3 w-16" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <SkeletonCircle size={32} />
          <SkeletonBox className="h-4 w-20" />
        </div>
        <SkeletonBox className="h-8 w-16" />
        <div className="flex items-center gap-2 flex-1 justify-end">
          <SkeletonBox className="h-4 w-20" />
          <SkeletonCircle size={32} />
        </div>
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
