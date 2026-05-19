import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useLang } from '../contexts/LangContext'

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
// Guardamos el intervalId a nivel de módulo porque `onRegisteredSW` no
// devuelve un cleanup y el SW persiste entre montajes. Si se reinicializara
// (HMR, remount), evitamos acumular timers.
let swUpdateInterval = null

function UpdateBanner() {
  const { t } = useLang()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      if (swUpdateInterval) clearInterval(swUpdateInterval)
      // Comprueba si hay una versión nueva cada hora.
      swUpdateInterval = setInterval(() => { registration.update().catch(() => {}) }, 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-20 sm:bottom-4 inset-x-3 sm:inset-x-auto sm:right-4 sm:left-auto sm:max-w-sm z-50 animate-slide-up pb-safe">
      <div className="card p-4 flex items-start gap-3 shadow-2xl shadow-ink/60 border-ink/20">
        <span className="text-xl flex-shrink-0">🔄</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-ink">{t('pwa.updateTitle')}</p>
          <p className="text-xs text-ink/60 mt-0.5">{t('pwa.updateDesc')}</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => updateServiceWorker(true)}
              className="btn-primary text-sm px-3 py-1.5 min-h-0"
            >
              {t('pwa.update')}
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="text-ink/60 hover:text-ink/80 text-sm px-3 py-1.5"
            >
              {t('pwa.later')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Banner de "Añadir a pantalla de inicio" ───────────────────────────────
function InstallBanner() {
  const { t } = useLang()
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
      const timer = setTimeout(() => setShowIosHint(true), 30_000)
      return () => {
        clearTimeout(timer)
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
        <div className="card p-4 flex items-start gap-3 shadow-2xl shadow-ink/60 border-ink/20">
          <span className="text-2xl flex-shrink-0">⚽</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-ink">{t('pwa.installTitle')}</p>
            <p className="text-xs text-ink/60 mt-0.5">{t('pwa.installDesc')}</p>
            <div className="flex gap-2 mt-3">
              <button onClick={install} className="btn-primary text-sm px-3 py-1.5 min-h-0">{t('pwa.install')}</button>
              <button onClick={dismiss} className="text-ink/60 hover:text-ink/80 text-sm px-3 py-1.5">
                {t('pwa.notNow')}
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
        <div className="card p-4 flex items-start gap-3 shadow-2xl shadow-ink/60 border-ink/20">
          <span className="text-2xl flex-shrink-0">📲</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-ink">{t('pwa.iosTitle')}</p>
            <p className="text-xs text-ink/60 mt-0.5">
              <span className="inline-block px-1 font-mono">⎙</span> {t('pwa.iosHintShare')} →{' '}
              <span className="font-semibold">«{t('pwa.iosHintAction')}»</span>
            </p>
            <button onClick={dismiss} className="text-ink/60 hover:text-ink/80 text-xs mt-2">
              {t('pwa.iosClose')}
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
