import { useEffect, useRef } from 'react'

// Returns a ref. Attach it to any element and it will rotate continuously
// in lockstep with the page's scroll position — `degreesPerPixel` degrees
// of rotation per pixel scrolled. Updates run inside requestAnimationFrame
// so we never flush more than once per frame, and the transform is written
// directly to the DOM element (no React re-renders) for buttery scroll
// performance. Respects prefers-reduced-motion: users who have it on get
// no rotation at all.
export default function useScrollRotation(degreesPerPixel = 0.25) {
  const ref = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return

    let raf = null

    function apply() {
      const el = ref.current
      if (el) {
        const deg = window.scrollY * degreesPerPixel
        el.style.transform = `rotate(${deg.toFixed(2)}deg)`
      }
      raf = null
    }

    function onScroll() {
      if (raf != null) return
      raf = requestAnimationFrame(apply)
    }

    apply() // initial position so SSR-rendered 0 isn't visible mid-scroll
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [degreesPerPixel])

  return ref
}
