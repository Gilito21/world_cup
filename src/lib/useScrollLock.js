import { useEffect } from 'react'

// Lock the body scroll while a modal/drawer is mounted. Prevents the page
// underneath from scrolling on iOS when the user reaches the end of the
// modal's own scroll container and keeps dragging.
//
// We track an open-count on document.body so multiple modals stacked at
// the same time only restore the original overflow once the last one
// unmounts.
export default function useScrollLock() {
  useEffect(() => {
    const body = document.body
    const count = parseInt(body.dataset.scrollLockCount ?? '0', 10)
    if (count === 0) {
      body.dataset.scrollLockPrevOverflow = body.style.overflow
      body.style.overflow = 'hidden'
    }
    body.dataset.scrollLockCount = String(count + 1)

    return () => {
      const next = parseInt(body.dataset.scrollLockCount ?? '1', 10) - 1
      body.dataset.scrollLockCount = String(Math.max(0, next))
      if (next <= 0) {
        body.style.overflow = body.dataset.scrollLockPrevOverflow ?? ''
        delete body.dataset.scrollLockCount
        delete body.dataset.scrollLockPrevOverflow
      }
    }
  }, [])
}
