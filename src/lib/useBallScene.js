import { useRef, useEffect } from 'react'

// Drives the landing-hero "header pass" animation: a soccer ball traveling
// in a parabolic arc between two stationary players, with each player
// leaning into the ball as it arrives at them. Scroll position drives the
// progress; the hook writes transforms directly to the DOM (zero React
// re-renders) so we hold 60fps even while the rest of the page paints.
//
// Layout contract the caller is responsible for:
//   • ballRef          → absolute, top: <y>, left: 50%, transform: translate(-50%, 0)
//   • leftPlayerRef    → absolute, top: <y>, left: 0
//   • rightPlayerRef   → absolute, top: <y>, right: 0
// The hook overwrites `transform` on each, so any CSS transform you set
// initially is replaced once the first frame runs.

const SPREAD_RATIO  = 1     // we use the full scene width up to its cap
const SCENE_MAX     = 640   // px — cap so the ball doesn't fly across 4K monitors
const ARC_MOBILE    = 28    // peak height of the arc (mobile)
const ARC_DESKTOP   = 52    // peak height (≥sm)
const ROT_DEG       = 720   // two full ball spins per pass
const RANGE_VH      = 0.7   // pass completes by 70% of one viewport scroll
const PLAYER_M      = 56    // px — silhouette width on mobile
const PLAYER_D      = 88    // px — silhouette width on desktop

// Active-state thresholds. Past these, the player on that side leans into
// the ball. Asymmetric so the user gets a clear "ball just left" / "ball is
// arriving" cue rather than both leaning around mid-arc.
const LEFT_ACTIVE_MAX  = 0.16
const RIGHT_ACTIVE_MIN = 0.84

export default function useBallScene() {
  const ballRef        = useRef(null)
  const leftPlayerRef  = useRef(null)
  const rightPlayerRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let raf = null
    let lastProgress    = -1
    let lastLeftActive  = null
    let lastRightActive = null

    function compute() {
      raf = null
      const vw          = window.innerWidth
      const vh          = window.innerHeight
      const sceneWidth  = Math.min(vw, SCENE_MAX)
      const playerWidth = vw < 640 ? PLAYER_M : PLAYER_D
      const spread      = (sceneWidth - playerWidth) * SPREAD_RATIO
      const arc         = vw < 640 ? ARC_MOBILE : ARC_DESKTOP

      const raw      = window.scrollY / (vh * RANGE_VH)
      const progress = Math.min(1, Math.max(0, raw))

      // Ball — written every frame the user is mid-scroll; the threshold
      // here is just to skip identical frames after we've fully settled.
      if (Math.abs(progress - lastProgress) > 0.0008) {
        const x   = (progress - 0.5) * spread
        const y   = -Math.sin(progress * Math.PI) * arc
        const rot = progress * ROT_DEG
        const el  = ballRef.current
        if (el) {
          el.style.transform =
            `translate(calc(-50% + ${x.toFixed(2)}px), ${y.toFixed(2)}px) ` +
            `rotate(${rot.toFixed(2)}deg)`
        }
        lastProgress = progress
      }

      // Player leans — only written on state crossings so the CSS
      // transition (300ms) can interpolate without JS overwriting it
      // every frame.
      const leftActive = progress < LEFT_ACTIVE_MAX
      if (leftActive !== lastLeftActive) {
        lastLeftActive = leftActive
        const el = leftPlayerRef.current
        if (el) el.style.transform = leftActive
          ? 'translateY(-4px) rotate(8deg)'
          : 'translateY(0) rotate(0deg)'
      }

      const rightActive = progress > RIGHT_ACTIVE_MIN
      if (rightActive !== lastRightActive) {
        lastRightActive = rightActive
        const el = rightPlayerRef.current
        if (el) el.style.transform = rightActive
          ? 'translateY(-4px) rotate(-8deg)'
          : 'translateY(0) rotate(0deg)'
      }
    }

    function schedule() {
      if (raf != null) return
      raf = requestAnimationFrame(compute)
    }

    // Set initial transform immediately so the ball doesn't pop from
    // CSS-base to JS-computed on the first scroll.
    compute()

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return // honor user preference: no scroll-coupled animation

    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [])

  return { ballRef, leftPlayerRef, rightPlayerRef }
}
