import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import { supabase } from '../lib/supabase'
import LeagueSwitcher from './LeagueSwitcher'
import LangToggle from './LangToggle'
import PaymentModal from './PaymentModal'
import ReportButton from './ReportButton'

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
          <img src={profile.avatar_url} alt={profile.username} className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            {profile?.username?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-60 card shadow-2xl shadow-stone-300/50 py-1.5 z-50 animate-fade-in">
          <Link
            to="/perfil"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-stone-100"
          >
            <span className="text-base">👤</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-stone-900 truncate">{profile?.username ?? t('nav.profile')}</div>
              <div className="text-xs text-stone-500">{t('nav.totalPts', { n: profile?.total_points ?? 0 })}</div>
            </div>
          </Link>
          <Link
            to="/reglas"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-stone-100"
          >
            <span className="text-base">📖</span>
            <span className="text-sm text-stone-700">{t('nav.rules')}</span>
          </Link>
          <div className="border-t border-stone-200 my-1" />
          <button
            onClick={() => { setOpen(false); onSignOut() }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-50"
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

  // Pestañas principales. En móvil mostramos las 5 que también aparecen
  // en MOBILE_NAV; "Reglas" se accede desde el menú del avatar para no
  // saturar la barra inferior con 6 elementos.
  const NAV = [
    { to: '/pronosticos',   label: t('nav.predictions'), short: t('nav.predictionsShort'), icon: '🎯' },
    { to: '/extras',        label: t('nav.extras'),      short: t('nav.extras'),           icon: '🎲' },
    { to: '/clasificacion', label: t('nav.standings'),   short: t('nav.standingsShort'),   icon: '🏆' },
    { to: '/resultados',    label: t('nav.results'),     short: t('nav.resultsShort'),     icon: '📋' },
    { to: '/bracket',       label: t('nav.bracket'),     short: t('nav.bracket'),          icon: '⚽' },
    { to: '/reglas',        label: t('nav.rules'),       short: t('nav.rulesShort'),       icon: '📖' },
    ...(isLeagueAdmin ? [{ to: '/admin-liga', label: t('nav.adminLeague'), short: t('nav.adminLeague'), icon: '⚙️' }] : []),
  ]

  // Bottom-bar (móvil): un máximo de 5 ítems para no saturar (excluir reglas y admin).
  const MOBILE_NAV = NAV.filter(n => n.to !== '/reglas' && n.to !== '/admin-liga')

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
    <div className="h-dvh flex flex-col bg-stone-50 overflow-hidden">
      {/* ── HEADER ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-sm pt-safe">
        <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500" />
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
          {/* Logo */}
          <Link to="/pronosticos" className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xl sm:text-2xl">⚽</span>
            <div className="hidden sm:block">
              <span className="font-bold text-stone-900 text-lg leading-tight">Porra</span>
              <span className="font-bold text-amber-500 text-lg leading-tight"> Mundial 2026</span>
            </div>
          </Link>

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
                className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-stone-100 transition-all duration-150"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.username} className="w-8 h-8 rounded-full object-cover shadow-sm" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-amber-500/30">
                    {profile.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-stone-700 text-sm font-medium">{profile.username}</span>
                <span className="bg-gradient-to-r from-amber-500/15 to-orange-400/10 text-amber-600 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-500/20">
                  {profile.total_points ?? 0} pts
                </span>
              </Link>
            )}
            <LangToggle className="ml-1 hidden sm:flex" />
            <button
              onClick={handleSignOut}
              className="hidden sm:inline-flex text-stone-400 hover:text-red-500 text-sm px-2.5 py-1.5 rounded-xl hover:bg-red-50 transition-all duration-150"
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
        <div className="hidden sm:block max-w-5xl mx-auto px-3 sm:px-4">
          <nav className="flex gap-1">
            {NAV.map(({ to, label, icon }) => (
              <NavLink
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
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Banda de contexto de liga activa */}
      {activeLeague && (
        <div className="bg-gradient-to-r from-amber-500/8 via-amber-500/5 to-transparent border-b border-amber-500/15">
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1 sm:py-1.5 flex items-center gap-2 overflow-hidden">
            {activeLeague.role === 'admin' && <span className="text-[11px] sm:text-xs">👑</span>}
            <span className="text-[11px] sm:text-xs text-amber-500/70 font-medium truncate">{activeLeague.name}</span>
            {activeLeague.role === 'admin' && (
              <span className="text-[11px] sm:text-xs text-stone-400 truncate hidden min-[420px]:inline">
                · <span className="font-mono text-amber-500/60 tracking-wider">{activeLeague.invite_code}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto max-w-5xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 pb-mobile-nav animate-fade-in">
        <Outlet />
      </main>

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
          <div className="pointer-events-auto bg-red-50 border border-red-200 rounded-2xl shadow-lg shadow-red-900/10 px-4 py-3 max-w-sm w-full space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-700">{t('layout.freeLeagueErrorTitle')}</p>
                <p className="text-xs text-red-600 mt-0.5">{t('layout.freeLeagueErrorDesc', { name: pendingPaymentName })}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setFreeLeagueError(false); setFreeLeagueAttempt(n => n + 1) }}
                className="flex-1 text-xs font-semibold bg-red-600 text-white rounded-lg py-2 hover:bg-red-700 transition-colors"
              >
                {t('layout.freeLeagueRetry')}
              </button>
              <button
                onClick={dismissFreeLeagueError}
                className="flex-1 text-xs font-semibold bg-white text-red-700 border border-red-200 rounded-lg py-2 hover:bg-red-100 transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportButton username={profile?.username} userEmail={user?.email} />

      {/* ── BOTTOM NAV (solo móvil) ──────────────────────────── */}
      <nav
        className="sm:hidden shrink-0 bg-white/95 backdrop-blur-md border-t border-stone-200 pb-safe"
        aria-label="Navegación principal"
      >
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map(({ to, short, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors min-h-[60px] ${
                  isActive
                    ? 'text-amber-600'
                    : 'text-stone-500 active:text-stone-700'
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
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
