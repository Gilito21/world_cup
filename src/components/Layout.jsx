import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { to: '/pronosticos',  label: 'Pronósticos', icon: '🎯' },
  { to: '/clasificacion', label: 'Clasificación', icon: '🏆' },
  { to: '/resultados',   label: 'Resultados',   icon: '📋' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-stone-950/80 backdrop-blur-md border-b border-stone-800">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">⚽</span>
            <div>
              <span className="font-bold text-stone-100 text-lg leading-tight">Porra</span>
              <span className="font-bold text-amber-500 text-lg leading-tight"> Mundial 2026</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {profile && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-semibold text-sm">
                  {profile.username?.[0]?.toUpperCase()}
                </div>
                <span className="text-stone-300 text-sm font-medium">{profile.username}</span>
                <span className="bg-amber-500/10 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/20">
                  {profile.total_points ?? 0} pts
                </span>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="text-stone-400 hover:text-stone-100 text-sm px-3 py-1.5 rounded-lg hover:bg-stone-800 transition-colors"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Tab navigation */}
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

      {/* Main content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 animate-fade-in">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-800 py-4 text-center text-stone-600 text-xs">
        Mundial 2026 · USA · México · Canadá
      </footer>
    </div>
  )
}
