import { useState, useRef, useEffect } from 'react'
import { useLeague } from '../contexts/LeagueContext'
import LeagueModal from './LeagueModal'

export default function LeagueSwitcher() {
  const { leagues, activeLeague, setActiveLeague } = useLeague()
  const [open, setOpen]           = useState(false)
  const [showModal, setShowModal] = useState(false)
  const ref = useRef(null)

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (leagues.length === 0) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
        >
          <span>+</span>
          <span className="hidden sm:inline">Unirse a liga</span>
        </button>
        {showModal && <LeagueModal onClose={() => setShowModal(false)} />}
      </>
    )
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-100 border border-stone-300 hover:border-stone-400 transition-colors max-w-[180px] sm:max-w-[220px]"
        >
          {/* Badge de admin */}
          {activeLeague?.role === 'admin' && (
            <span className="text-xs">👑</span>
          )}
          <span className="text-sm font-medium text-stone-800 truncate">
            {activeLeague?.name ?? 'Seleccionar liga'}
          </span>
          <svg
            className={`w-3.5 h-3.5 text-stone-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-64 card shadow-2xl shadow-stone-300/50 py-1.5 z-40 animate-fade-in">
            <div className="px-3 py-1.5 text-xs font-semibold text-stone-400 uppercase tracking-wider">
              Tus ligas
            </div>

            {leagues.map(league => (
              <button
                key={league.id}
                onClick={() => { setActiveLeague(league); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-stone-100 transition-colors ${
                  activeLeague?.id === league.id ? 'bg-stone-100' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {league.role === 'admin' && <span className="text-xs">👑</span>}
                    <span className="text-sm font-medium text-stone-900 truncate">{league.name}</span>
                  </div>
                  {league.role === 'admin' && (
                    <div className="text-xs text-stone-400 font-mono mt-0.5">
                      Código: <span className="text-amber-500/80 tracking-wider">{league.invite_code}</span>
                    </div>
                  )}
                </div>
                {activeLeague?.id === league.id && (
                  <span className="text-amber-400 text-sm flex-shrink-0">✓</span>
                )}
              </button>
            ))}

            <div className="border-t border-stone-200 mt-1.5 pt-1.5">
              <button
                onClick={() => { setOpen(false); setShowModal(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-400 hover:bg-stone-100 transition-colors rounded-lg mx-0"
              >
                <span className="text-base">+</span>
                <span>Crear o unirme a otra liga</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && <LeagueModal onClose={() => { setShowModal(false) }} />}
    </>
  )
}
