import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import LeagueSwitcher from './LeagueSwitcher'

const NAV = [
  { to: '/pronosticos',   label: 'Pronósticos',  icon: '🎯' },
  { to: '/clasificacion', label: 'Clasificación', icon: '🏆' },
  { to: '/resultados',    label: 'Resultados',    icon: '📋' },
  { to: '/bracket',       label: 'Bracket',       icon: '⚽' },
  { to: '/reglas',        label: 'Cómo funciona', icon: '📖' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { activeLeague }     = useLeague()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-stone-50/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <span className="text-2xl">⚽</span>
            <div className="hidden sm:block">
              <span className="font-bold text-stone-900 text-lg leading-tight">Porra</span>
              <span className="font-bold text-amber-500 text-lg leading-tight"> Mundial 2026</span>
            </div>
          </div>

          {/* Centro: selector de liga */}
          <div className="flex-1 flex justify-center">
            <LeagueSwitcher />
          </div>

          {/* Derecha: perfil + salir */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {profile && (
              <Link to="/perfil" className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-semibold text-xs">
                  {profile.username?.[0]?.toUpperCase()}
                </div>
                <span className="text-stone-700 text-sm">{profile.username}</span>
                <span className="bg-amber-500/10 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/20">
                  {profile.total_points ?? 0} pts
                </span>
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="text-stone-500 hover:text-stone-900 text-sm px-2.5 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Nav tabs */}
        <div className="max-w-5xl mx-auto px-4">
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
        <div className="bg-amber-500/5 border-b border-amber-500/10">
          <div className="max-w-5xl mx-auto px-4 py-1.5 flex items-center gap-2">
            {activeLeague.role === 'admin' && <span className="text-xs">👑</span>}
            <span className="text-xs text-amber-500/70 font-medium">{activeLeague.name}</span>
            {activeLeague.role === 'admin' && (
              <span className="text-xs text-stone-400">
                · Código: <span className="font-mono text-amber-500/50 tracking-wider">{activeLeague.invite_code}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 animate-fade-in">
        <Outlet />
      </main>

      <footer className="border-t border-stone-200 py-4 text-center text-stone-400 text-xs">
        Mundial 2026 · USA · México · Canadá
      </footer>
    </div>
  )
}
