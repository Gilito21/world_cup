import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'

const INSTALL_DISMISSED_KEY = 'pwa-install-dismissed-until'
const SNOOZE_DAYS = 14

function isStandalone() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS PWA
  return !!window.navigator.standalone
}

function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
}

// ── Banner de "nueva versión disponible" ───────────────────────────────────
function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Comprueba si hay una versión nueva cada hora.
      if (!registration) return
      setInterval(() => { registration.update().catch(() => {}) }, 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-20 sm:bottom-4 inset-x-3 sm:inset-x-auto sm:right-4 sm:left-auto sm:max-w-sm z-50 animate-slide-up pb-safe">
      <div className="card p-4 flex items-start gap-3 shadow-2xl shadow-stone-300/60 border-amber-500/30">
        <span className="text-xl flex-shrink-0">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-stone-900">Nueva versión disponible</p>
          <p className="text-xs text-stone-500 mt-0.5">Recarga para tener las últimas mejoras.</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => updateServiceWorker(true)}
              className="btn-primary text-sm px-3 py-1.5 min-h-0"
            >
              Actualizar
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="text-stone-500 hover:text-stone-700 text-sm px-3 py-1.5"
            >
              Más tarde
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Banner de "Añadir a pantalla de inicio" ───────────────────────────────
function InstallBanner() {
  const [deferred, setDeferred] = useState(null)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return

    const until = Number(localStorage.getItem(INSTALL_DISMISSED_KEY) || 0)
    if (until > Date.now()) return

    const handler = (e) => {
      e.preventDefault()
      setDeferred(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS no dispara beforeinstallprompt; mostramos hint manual tras 30s.
    if (isIos()) {
      const t = setTimeout(() => setShowIosHint(true), 30_000)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', handler)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    const until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(until))
    setDeferred(null)
    setShowIosHint(false)
  }

  async function install() {
    if (!deferred) return
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') {
      setDeferred(null)
    } else {
      dismiss()
    }
  }

  if (deferred) {
    return (
      <div className="fixed bottom-20 sm:bottom-4 inset-x-3 sm:inset-x-auto sm:right-4 sm:left-auto sm:max-w-sm z-40 animate-slide-up pb-safe">
        <div className="card p-4 flex items-start gap-3 shadow-2xl shadow-stone-300/60 border-amber-500/30">
          <span className="text-2xl flex-shrink-0">⚽</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-stone-900">Instala la app</p>
            <p className="text-xs text-stone-500 mt-0.5">Acceso rápido desde tu pantalla de inicio.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={install} className="btn-primary text-sm px-3 py-1.5 min-h-0">Instalar</button>
              <button onClick={dismiss} className="text-stone-500 hover:text-stone-700 text-sm px-3 py-1.5">
                Ahora no
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (showIosHint) {
    return (
      <div className="fixed bottom-20 inset-x-3 z-40 animate-slide-up pb-safe">
        <div className="card p-4 flex items-start gap-3 shadow-2xl shadow-stone-300/60 border-amber-500/30">
          <span className="text-2xl flex-shrink-0">📲</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-stone-900">Instala la app en tu iPhone</p>
            <p className="text-xs text-stone-500 mt-0.5">
              Toca <span className="inline-block px-1 font-mono">⎙</span> Compartir y luego{' '}
              <span className="font-semibold">«Añadir a pantalla de inicio»</span>.
            </p>
            <button onClick={dismiss} className="text-stone-500 hover:text-stone-700 text-xs mt-2">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default function PWAPrompts() {
  const { pathname } = useLocation()
  if (pathname === '/auth') return null
  return (
    <>
      <UpdateBanner />
      <InstallBanner />
    </>
  )
}
