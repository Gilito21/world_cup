import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Spinner from '../components/Spinner'

export default function Perfil() {
  const { user, profile } = useAuth()
  const [stats, setStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    loadStats()
  }, [user])

  async function loadStats() {
    const { data } = await supabase
      .from('predictions')
      .select('points_earned, league_id')
      .eq('user_id', user.id)

    if (data) {
      const allScored = data.filter(p => p.points_earned !== null)
      setStats({
        totalPredictions: data.length,
        exact:   allScored.filter(p => p.points_earned === 3).length,
        correct: allScored.filter(p => p.points_earned === 1).length,
        accuracy: allScored.length > 0
          ? Math.round((allScored.filter(p => p.points_earned > 0).length / allScored.length) * 100)
          : null,
      })
    }
    setLoadingStats(false)
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Mi perfil</h2>
        <p className="text-stone-400 text-sm mt-1">Tu cuenta</p>
      </div>

      {/* Tarjeta de identidad */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-500 font-bold text-2xl flex-shrink-0">
          {profile?.username?.[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-stone-900 truncate">{profile?.username}</p>
          {profile?.company && (
            <p className="text-stone-500 text-sm truncate">🏢 {profile.company}</p>
          )}
          <p className="text-stone-400 text-sm truncate">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
              {profile?.total_points ?? 0} pts globales
            </span>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div>
        <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-wider mb-3">Estadísticas</h3>
        {loadingStats ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Pronósticos', value: stats.totalPredictions, icon: '📝', color: 'text-stone-700' },
              { label: 'Exactos',     value: stats.exact,            icon: '🎯', color: 'text-amber-500' },
              { label: 'Correctos',   value: stats.correct,          icon: '✓',  color: 'text-blue-500'  },
              { label: 'Precisión',   value: stats.accuracy !== null ? `${stats.accuracy}%` : '—', icon: '📊', color: 'text-green-500' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="card p-4 text-center">
                <div className="text-xl mb-1">{icon}</div>
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-stone-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
