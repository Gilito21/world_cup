// Lightweight haptic feedback helpers.
//
// navigator.vibrate works on Android Chrome / Edge / Firefox. iOS Safari does
// not expose the Taptic Engine to web apps, so it's silently a no-op there —
// which is fine: we want haptics where supported, not warnings where not.
//
// All functions swallow exceptions so they're safe to fire-and-forget anywhere
// in the UI without try/catch boilerplate at call sites.

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern) } catch {}
}

export const haptics = {
  // Light single tap — for stepper buttons, tab switches, copy actions.
  tap()     { vibrate(8) },
  // Slightly heavier — for confirmed actions (save draft, toggle).
  medium()  { vibrate(15) },
  // Double-pulse — for success (submit predictions, league joined).
  success() { vibrate([12, 40, 12]) },
  // Sharper pattern — for errors that need attention.
  error()   { vibrate([40, 30, 40]) },
}

export default haptics
