import { useRef, useEffect } from 'react'

// Drives the landing "header pass" animation inside a sticky scroll section.
// The caller provides a ref to the outer section element; scroll progress is
// computed relative to that section so the animation runs while the section
// is pinned to the viewport.
//
// Layout contract:
//   section (ref)  → tall element (e.g. 250vh) that creates the scroll range
//   sticky inner   → position:sticky, fills the viewport height
//   ballRef        → absolute, left:50%, bottom:<x>%, transform:translate(-50%,0)
//   leftPlayerRef  → absolute, bottom:0, left:0
//   rightPlayerRef → absolute, bottom:0, right:0
//
// All transforms are written directly to the DOM (no React re-renders).

const SCENE_MAX = 1200  // cap spread on ultra-wide screens
const ROT_DEG   = 720   // two full ball spins per pass

// Player visual widths matching CSS (w-32 / w-44 / w-56)
const PLAYER_SM = 128
const PLAYER_MD = 176
const PLAYER_LG = 224

const LEFT_ACTIVE_MAX  = 0.18  // left player leans in while progress < this
const RIGHT_ACTIVE_MIN = 0.82  // right player leans in while progress > this

export default function useBallScene(sectionRef) {
  const ballRef        = useRef(null)
  const leftPlayerRef  = useRef(null)
  const rightPlayerRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    let raf = null
    let sectionTop   = 0
    let sectionRange = 1   // px of scroll that drives 0→1 progress
    let leftLeanY    = 0, leftLeanR  = 0
    let rightLeanY   = 0, rightLeanR = 0

    function measure() {
      const el = sectionRef?.current
      if (!el) return
      sectionTop   = el.getBoundingClientRect().top + window.scrollY
      sectionRange = Math.max(1, el.offsetHeight - window.innerHeight)
    }

    function compute() {
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Player width in px — must match CSS classes on the elements
      const playerW = vw < 640 ? PLAYER_SM : vw < 1024 ? PLAYER_MD : PLAYER_LG

      const sceneW  = Math.min(vw, SCENE_MAX)
      const spread  = (sceneW - playerW) * 0.88   // horizontal travel of the ball
      const arc     = vh * 0.44                    // peak height of the arc

      const raw      = (window.scrollY - sectionTop) / sectionRange
      const progress = Math.min(1, Math.max(0, raw))

      // ── Ball ────────────────────────────────────────────────────────────
      const x   = (progress - 0.5) * spread
      const y   = -Math.sin(progress * Math.PI) * arc
      const rot = progress * ROT_DEG
      const ballEl = ballRef.current
      if (ballEl) {
        // Fade ball in together with players sliding in (first 18% of scroll)
        const slideIn = Math.min(1, progress / 0.18)
        ballEl.style.opacity   = slideIn.toFixed(3)
        ballEl.style.transform =
          `translate(calc(-50% + ${x.toFixed(2)}px), ${y.toFixed(2)}px) ` +
          `rotate(${rot.toFixed(2)}deg)`
      }

      // ── Players: slide in from edges, then lean when ball is near ───────
      const slideIn     = Math.min(1, progress / 0.18)
      const slideOffset = (1 - slideIn) * 100   // 100 = fully off-screen

      // Lerp lean toward target state (gives smooth spring-like transition)
      const tLeftY = progress < LEFT_ACTIVE_MAX ? -8 : 0
      const tLeftR = progress < LEFT_ACTIVE_MAX ? 10 : 0
      leftLeanY += (tLeftY - leftLeanY) * 0.14
      leftLeanR += (tLeftR - leftLeanR) * 0.14

      const leftEl = leftPlayerRef.current
      if (leftEl) leftEl.style.transform =
        `translateX(${(-slideOffset).toFixed(1)}%) ` +
        `translateY(${leftLeanY.toFixed(2)}px) ` +
        `rotate(${leftLeanR.toFixed(2)}deg)`

      const tRightY = progress > RIGHT_ACTIVE_MIN ? -8 : 0
      const tRightR = progress > RIGHT_ACTIVE_MIN ? -10 : 0
      rightLeanY += (tRightY - rightLeanY) * 0.14
      rightLeanR += (tRightR - rightLeanR) * 0.14

      const rightEl = rightPlayerRef.current
      if (rightEl) rightEl.style.transform =
        `translateX(${slideOffset.toFixed(1)}%) ` +
        `translateY(${rightLeanY.toFixed(2)}px) ` +
        `rotate(${rightLeanR.toFixed(2)}deg)`
    }

    if (reducedMotion) {
      measure()
      compute()
      return
    }

    function loop() {
      compute()
      raf = requestAnimationFrame(loop)
    }

    measure()
    window.addEventListener('resize', measure, { passive: true })
    raf = requestAnimationFrame(loop)

    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [sectionRef])

  return { ballRef, leftPlayerRef, rightPlayerRef }
}
