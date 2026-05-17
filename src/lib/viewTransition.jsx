// Thin wrapper around document.startViewTransition.
//
// Chrome 111+ and Safari 18+ ship the View Transitions API. When
// available, we call startViewTransition(fn) so the browser captures the
// before/after state and crossfades between them — see index.css for the
// animation definitions. On older browsers we just run `fn` synchronously.
//
// Used by Layout's NavLink onClick to make tab switches feel native. The
// guard is cheap (one feature-detect per call) so callers don't have to
// branch themselves.

import { NavLink, useNavigate } from 'react-router-dom'

export function withViewTransition(fn) {
  if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
    document.startViewTransition(fn)
    return
  }
  fn()
}

// Drop-in NavLink replacement that wraps the navigation in a View Transition
// when the browser supports it. Modifier-clicks (cmd/ctrl/shift) and
// middle-clicks are left alone so "open in new tab" still works.
export function ViewNavLink({ to, onClick, ...rest }) {
  const navigate = useNavigate()
  function handleClick(e) {
    if (onClick) onClick(e)
    if (e.defaultPrevented) return
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (typeof document.startViewTransition !== 'function') return
    e.preventDefault()
    document.startViewTransition(() => navigate(to))
  }
  return <NavLink to={to} onClick={handleClick} {...rest} />
}

