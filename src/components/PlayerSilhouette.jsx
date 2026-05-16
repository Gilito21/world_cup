import { forwardRef } from 'react'

// Minimal navy head+shoulders silhouette. Symmetric viewBox so it reads as
// "facing forward" without flipping — the brain fills in that two players
// on opposite sides are facing each other.
//
// transform-origin: center bottom so lean rotation pivots at the player's
// feet. All animation is rAF-driven by useBallScene (no CSS transition).
const PlayerSilhouette = forwardRef(function PlayerSilhouette(
  { className = '' }, ref
) {
  return (
    <div
      ref={ref}
      className={`${className} pointer-events-none will-change-transform`}
      style={{ transformOrigin: 'center bottom' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 130" className="w-full h-full block">
        <defs>
          <linearGradient id="player-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#1a2d52" />
            <stop offset="100%" stopColor="#0b1530" />
          </linearGradient>
        </defs>
        <g fill="url(#player-grad)">
          {/* Head */}
          <circle cx="50" cy="32" r="22" />
          {/* Neck + shoulders flowing off bottom of canvas */}
          <path d="M 0 130 L 0 80 Q 8 62 28 56 L 72 56 Q 92 62 100 80 L 100 130 Z" />
        </g>
      </svg>
    </div>
  )
})

export default PlayerSilhouette
