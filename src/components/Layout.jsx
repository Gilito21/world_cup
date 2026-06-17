import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import { supabase } from '../lib/supabase'
import haptics from '../lib/haptics'
import { PullRefreshContext } from '../lib/usePullRefresh'
import { ScrollChromeContext } from '../lib/scrollChrome'
import { ViewNavLink } from '../lib/viewTransition'
import LeagueSwitcher from './LeagueSwitcher'
import LangToggle from './LangToggle'
import PaymentModal from './PaymentModal'
import ReportButton from './ReportButton'
import { BrandMark, BrandTile } from './Brand'

// ── Avatar/menú del usuario para móvil (perfil + salir) ────────────────────
function MobileUserMenu({ profile, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { t } = useLang()

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey  = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden"
        aria-label={t('nav.profile')}
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.username} className="w-9 h-9 rounded-full object-cover border border-ink/30" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-ink flex items-center justify-center text-cream font-display text-sm">
            {profile?.username?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-60 bg-paper border border-ink/30 shadow-xl shadow-ink/15 py-1.5 z-50 animate-fade-in">
          <Link
            to="/perfil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-cream"
          >
            <span className="text-base">👤</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-ink truncate">{profile?.username ?? t('nav.profile')}</div>
              <div className="text-xs text-ink/60">{t('nav.totalPts', { n: profile?.total_points ?? 0 })}</div>
            </div>
          </Link>
          <Link
            to="/reglas"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-cream"
          >
            <span className="text-base">📖</span>
            <span className="text-sm text-ink/80">{t('nav.rules')}</span>
          </Link>
          <div className="border-t border-ink/15 my-1" />
          <button
            onClick={() => { setOpen(false); onSignOut() }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
          >
            <span className="text-base">🚪</span>
            <span>{t('nav.signOutFull')}</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, profile, signOut } = useAuth()
  const { activeLeague, leagues, onLeagueCreated } = useLeague()
  const isLeagueAdmin = leagues.some(l => l.role === 'admin')
  const { t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  // Cierra el menú "Más" al cambiar de ruta (ej. botón atrás del SO)
  useEffect(() => { setShowMoreMenu(false) }, [location.pathname])

  // ── Pull-to-refresh ─────────────────────────────────────────────────────
  // Pages register a handler via PullRefreshContext. While the user pulls
  // down at scrollTop=0, we track the distance and show a circular spinner
  // that fills as the pull progresses. Release past the threshold fires
  // the registered handler.
  const mainRef = useRef(null)
  const refreshHandlerRef = useRef(null)
  const [pullDist, setPullDist] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const setRefreshHandler = useCallback((fn) => { refreshHandlerRef.current = fn }, [])
  const pullCtx = useMemo(() => ({ setRefreshHandler }), [setRefreshHandler])

  // Ocultar la bottom-nav / minimizar FABs al bajar; mostrar al subir o arriba.
  const [hideChrome, setHideChrome] = useState(false)
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    let last = el.scrollTop
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = el.scrollTop
        const delta = y - last
        if (y < 64)          setHideChrome(false)
        else if (delta > 8)  setHideChrome(true)
        else if (delta < -8) setHideChrome(false)
        last = y
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  // Al cambiar de página el scroll vuelve arriba: restaura el chrome.
  useEffect(() => { setHideChrome(false) }, [location.pathname])

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    let startY = 0
    let pulling = false
    let lastDist = 0
    const THRESHOLD = 70
    const MAX_PULL  = 120

    function onTouchStart(e) {
      if (refreshing) return
      if (el.scrollTop > 0) return
      if (e.touches.length !== 1) return
      startY = e.touches[0].clientY
      pulling = true
      lastDist = 0
    }
    function onTouchMove(e) {
      if (!pulling) return
      if (el.scrollTop > 0) { pulling = false; setPullDist(0); return }
      const dy = e.touches[0].clientY - startY
      if (dy <= 0) { pulling = false; setPullDist(0); return }
      // Rubber-band resistance: pull feels heavier the further it goes.
      const resistance = Math.min(MAX_PULL, dy * 0.45)
      lastDist = resistance
      setPullDist(resistance)
    }
    async function onTouchEnd() {
      if (!pulling) return
      pulling = false
      const passed = lastDist >= THRESHOLD
      if (passed && refreshHandlerRef.current) {
        haptics.medium()
        setRefreshing(true)
        setPullDist(THRESHOLD * 0.7)
        try { await Promise.resolve(refreshHandlerRef.current()) } catch {}
        setRefreshing(false)
        setPullDist(0)
      } else {
        setPullDist(0)
      }
    }

    el.addEventListener('touchstart',  onTouchStart, { passive: true })
    el.addEventListener('touchmove',   onTouchMove,  { passive: true })
    el.addEventListener('touchend',    onTouchEnd,   { passive: true })
    el.addEventListener('touchcancel', onTouchEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [refreshing])

  const pullProgress = Math.min(1, pullDist / 70)

  // Desktop header tabs
  const NAV = [
    { to: '/pronosticos',   label: t('nav.predictions'), short: t('nav.predictionsShort'), icon: '🎯' },
    { to: '/extras',        label: t('nav.extras'),      short: t('nav.extras'),           icon: '🎲' },
    { to: '/clasificacion', label: t('nav.standings'),   short: t('nav.standingsShort'),   icon: '🏆' },
    { to: '/resultados',    label: t('nav.results'),     short: t('nav.resultsShort'),     icon: '📋' },
    { to: '/bracket',       label: t('nav.bracket'),     short: t('nav.bracket'),          icon: '⚽' },
    { to: '/reglas',        label: t('nav.rules'),       short: t('nav.rulesShort'),       icon: '📖' },
    ...(isLeagueAdmin ? [{ to: '/admin-liga', label: t('nav.adminLeague'), short: t('nav.adminLeague'), icon: '⚙️' }] : []),
  ]

  // Mobile bottom bar: 4 tabs primarios + botón "Más"
  const MOBILE_PRIMARY = [
    { to: '/pronosticos',   short: t('nav.predictionsShort'), icon: '🎯' },
    { to: '/clasificacion', short: t('nav.standingsShort'),   icon: '🏆' },
    { to: '/resultados',    short: t('nav.resultsShort'),     icon: '📋' },
    { to: '/extras',        short: t('nav.extras'),           icon: '🎲' },
  ]
  const MOBILE_MORE = [
    { to: '/bracket',   label: t('nav.bracket'),     icon: '⚽' },
    ...(isLeagueAdmin ? [{ to: '/admin-liga', label: t('nav.adminLeague'), icon: '⚙️' }] : []),
    { to: '/reglas',    label: t('nav.rules'),        icon: '📖' },
  ]
  const isMoreActive = MOBILE_MORE.some(n => location.pathname === n.to)

  // Pending payment intent: si el usuario eligió "Crear liga" durante el
  // signup, Auth.jsx dejó el nombre en localStorage y aquí abrimos el
  // modal de pago una vez ya está autenticado.
  const [pendingPaymentName, setPendingPaymentName] = useState(() => {
    try { return localStorage.getItem('porra-pending-league-create') } catch { return null }
  })
  const [freeLeagueError, setFreeLeagueError]   = useState(false)
  const [freeLeagueAttempt, setFreeLeagueAttempt] = useState(0)

  // Si el usuario logueado es founder y hay intención pendiente, crea la
  // liga directo sin pasar por el modal de pago. Retry transient failures
  // (backoff 0→1.5s→4s) before surfacing the error to the user.
  useEffect(() => {
    if (!pendingPaymentName) return
    if (!profile?.is_founder) return
    let cancelled = false
    setFreeLeagueError(false)
    ;(async () => {
      const BACKOFFS_MS = [0, 1500, 4000]
      for (const wait of BACKOFFS_MS) {
        if (cancelled) return
        if (wait) await new Promise(r => setTimeout(r, wait))
        const { data, error } = await supabase.functions.invoke('create-league-free', {
          body: { league_name: pendingPaymentName },
        })
        if (cancelled) return
        if (!error && data?.league) {
          localStorage.removeItem('porra-pending-league-create')
          setPendingPaymentName(null)
          if (onLeagueCreated) await onLeagueCreated(data.league)
          return
        }
        console.error('create-league-free attempt failed:', error)
      }
      if (!cancelled) setFreeLeagueError(true)
    })()
    return () => { cancelled = true }
  }, [pendingPaymentName, profile?.is_founder, onLeagueCreated, freeLeagueAttempt])

  function dismissFreeLeagueError() {
    setFreeLeagueError(false)
    localStorage.removeItem('porra-pending-league-create')
    setPendingPaymentName(null)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  async function handleBallRefresh() {
    haptics.tap()
    if (!refreshHandlerRef.current || refreshing) return
    setRefreshing(true)
    try { await Promise.resolve(refreshHandlerRef.current()) } catch {}
    setRefreshing(false)
  }

  async function handlePaymentSuccess(league) {
    localStorage.removeItem('porra-pending-league-create')
    setPendingPaymentName(null)
    if (onLeagueCreated) await onLeagueCreated(league)
  }

  function handlePaymentClose() {
    // Si cancelan, limpiamos la intención para que no reaparezca
    // en cada recarga. Pueden volver a intentar desde el menú de ligas.
    localStorage.removeItem('porra-pending-league-create')
    setPendingPaymentName(null)
  }

  return (
    <div className="h-dvh flex flex-col bg-cream overflow-hidden">
      {/* ── HEADER ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur-md border-b border-ink/15 pt-safe">
        <div className="absolute top-0 inset-x-0 h-px bg-terracotta" />
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
          {/* Logo: tile is always visible (it's the refresh button), the
              wordmark slides in from the left when the user hovers the
              group — keeps the header tight while still exposing the
              full brand on intent. */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 group">
            <BrandTile
              size={32}
              onClick={handleBallRefresh}
              ariaLabel="Actualizar"
              spinning={refreshing}
            />
            <Link
              to="/pronosticos"
              className="hidden sm:flex items-baseline opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto"
              tabIndex={-1}
              aria-hidden="true"
            >
              <BrandMark compact size={0.45} />
            </Link>
          </div>

          {/* Centro: selector de liga */}
          <div className="flex-1 flex justify-center min-w-0">
            <LeagueSwitcher />
          </div>

          {/* Derecha: en desktop perfil + salir, en móvil avatar con menú */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Desktop: perfil completo */}
            {profile && (
              <Link
                to="/perfil"
                className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 hover:bg-paper transition-colors duration-150"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.username} className="w-8 h-8 rounded-full object-cover border border-ink/20" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-ink flex items-center justify-center text-cream font-display text-xs">
                    {profile.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-ink text-sm font-medium">{profile.username}</span>
                <span className="bg-ink text-cream text-[10px] font-mono tracking-wider px-2 py-0.5 uppercase">
                  {profile.total_points ?? 0} pts
                </span>
              </Link>
            )}
            <LangToggle className="ml-1 hidden sm:flex" />
            <button
              onClick={handleSignOut}
              className="hidden sm:inline-flex text-ink/50 hover:text-red-600 text-sm px-2.5 py-1.5 hover:bg-red-50 transition-colors duration-150"
            >
              {t('nav.signOut')}
            </button>

            {/* Móvil: avatar compacto con menú */}
            <div className="sm:hidden">
              <MobileUserMenu profile={profile} onSignOut={handleSignOut} />
            </div>
          </div>
        </div>

        {/* Tabs (solo desktop, en móvil hay bottom nav) */}
        <div className="hidden sm:block max-w-6xl mx-auto px-3 sm:px-4">
          <nav className="flex gap-1">
            {NAV.map(({ to, label, icon }) => (
              <ViewNavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-all duration-150 ${
                    isActive ? 'tab-active' : 'tab-inactive'
                  }`
                }
              >
                <span>{icon}</span>
                <span>{label}</span>
              </ViewNavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Banda de contexto de liga activa */}
      {activeLeague && (
        <div className="bg-paper border-b border-ink/15">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-1 sm:py-1.5 flex items-center gap-2 overflow-hidden">
            {activeLeague.role === 'admin' && <span className="text-[11px] sm:text-xs">👑</span>}
            <span className="text-[11px] sm:text-xs text-ink/70 font-medium truncate">{activeLeague.name}</span>
            {activeLeague.role === 'admin' && (
              <span className="text-[11px] sm:text-xs text-ink/50 truncate hidden min-[420px]:inline">
                · <span className="font-mono text-ink tracking-wider">{activeLeague.invite_code}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <ScrollChromeContext.Provider value={hideChrome}>
      <PullRefreshContext.Provider value={pullCtx}>
        <main
          ref={mainRef}
          className="relative flex-1 overflow-y-auto max-w-6xl mx-auto w-full px-3 sm:px-4 py-3 sm:py-4 pb-mobile-nav animate-fade-in"
        >
          {/* Pull-to-refresh indicator (mobile only) */}
          {(pullDist > 0 || refreshing) && (
            <div
              className="sm:hidden absolute top-0 inset-x-0 flex justify-center z-30 pointer-events-none"
              style={{
                transform: `translateY(${Math.max(0, pullDist - 18)}px)`,
                opacity:   refreshing ? 1 : Math.min(1, pullDist / 30),
                transition: refreshing ? 'transform 200ms ease-out' : 'none',
              }}
            >
              <div className="w-9 h-9 bg-cream border border-ink/30 rounded-full shadow-md shadow-ink/15 flex items-center justify-center text-terracotta">
                {refreshing ? (
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="22 10" />
                  </svg>
                ) : (
                  <svg
                    width="16" height="16" viewBox="0 0 16 16" fill="none"
                    style={{ transform: `rotate(${pullProgress * 180}deg)`, transition: 'transform 80ms linear' }}
                    aria-hidden="true"
                  >
                    <path d="M8 2.5v9m-3-3 3 3 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
          )}
          <Outlet />
        </main>
      </PullRefreshContext.Provider>
      </ScrollChromeContext.Provider>

      {/* Modal de pago para crear liga (disparado tras signup).
          Se renderiza salvo que el perfil esté cargado y sea founder
          — para founders el effect de arriba crea la liga gratis.
          Si profile aún no cargó, mostramos el modal igualmente: el
          peor caso para un founder es que el modal aparezca un instante
          antes de que el effect del bypass lo cierre. */}
      {pendingPaymentName && !profile?.is_founder && !freeLeagueError && (
        <PaymentModal
          leagueName={pendingPaymentName}
          onSuccess={handlePaymentSuccess}
          onClose={handlePaymentClose}
        />
      )}

      {/* Founder free-league creation failed after retries — let the user
          retry manually or dismiss to recover state. */}
      {freeLeagueError && (
        <div className="fixed inset-x-0 top-4 z-[70] flex justify-center px-3 pointer-events-none">
          <div className="pointer-events-auto bg-red-50 border border-red-300 shadow-xl shadow-ink/15 px-4 py-3 max-w-sm w-full space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-700">{t('layout.freeLeagueErrorTitle')}</p>
                <p className="text-xs text-ink/70 mt-0.5">{t('layout.freeLeagueErrorDesc', { name: pendingPaymentName })}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setFreeLeagueError(false); setFreeLeagueAttempt(n => n + 1) }}
                className="flex-1 text-xs font-semibold bg-red-600 text-cream py-2 hover:bg-red-700 transition-colors"
              >
                {t('layout.freeLeagueRetry')}
              </button>
              <button
                onClick={dismissFreeLeagueError}
                className="flex-1 text-xs font-semibold bg-transparent text-ink border border-ink py-2 hover:bg-ink hover:text-cream transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportButton username={profile?.username} userEmail={user?.email} />

      {/* ── MENÚ "MÁS" (móvil) ───────────────────────────────── */}
      {showMoreMenu && (
        <div className="sm:hidden fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
      )}
      {showMoreMenu && (
        <div
          className="sm:hidden fixed right-3 z-40 bg-paper border border-ink/30 shadow-xl shadow-ink/15 overflow-hidden min-w-[210px] animate-slide-up"
          style={{ bottom: 'calc(60px + env(safe-area-inset-bottom) + 8px)' }}
        >
          {MOBILE_MORE.map(({ to, label, icon }, idx) => (
            <div key={to}>
              {idx > 0 && MOBILE_MORE[idx - 1].to === '/admin-liga' && (
                <div className="mx-3 border-t border-ink/15" />
              )}
              <ViewNavLink
                to={to}
                onClick={() => { haptics.tap(); setShowMoreMenu(false) }}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-colors ${
                    isActive ? 'text-terracotta bg-terracotta/10' : 'text-ink active:bg-cream'
                  }`
                }
              >
                <span className="text-lg flex-shrink-0">{icon}</span>
                <span>{label}</span>
              </ViewNavLink>
            </div>
          ))}
        </div>
      )}

      {/* ── BOTTOM NAV (solo móvil) ──────────────────────────── */}
      <nav
        className={`sm:hidden shrink-0 min-h-0 bg-cream/95 backdrop-blur-md border-t border-ink/15 pb-safe overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          hideChrome ? 'max-h-0 opacity-0 border-t-0 pointer-events-none' : 'max-h-32 opacity-100'
        }`}
        aria-label="Navegación principal"
      >
        <div className="grid grid-cols-5">
          {MOBILE_PRIMARY.map(({ to, short, icon }) => (
            <ViewNavLink
              key={to}
              to={to}
              onClick={() => { if (location.pathname !== to) haptics.tap() }}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors min-h-[60px] ${
                  isActive ? 'text-terracotta' : 'text-ink/55 active:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`text-xl leading-none transition-transform ${isActive ? 'scale-110' : ''}`}>
                    {icon}
                  </span>
                  <span className="leading-none truncate max-w-full px-1">{short}</span>
                </>
              )}
            </ViewNavLink>
          ))}

          {/* Botón "Más" */}
          <button
            onClick={() => { haptics.tap(); setShowMoreMenu(o => !o) }}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium min-h-[60px] transition-colors ${
              showMoreMenu || isMoreActive ? 'text-terracotta' : 'text-ink/55 active:text-ink'
            }`}
          >
            <span className={`leading-none transition-transform ${showMoreMenu ? 'scale-110 text-terracotta' : ''}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5"  cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </span>
            <span className="leading-none">{t('nav.more')}</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
