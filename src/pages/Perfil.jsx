import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Spinner from '../components/Spinner'

export default function Perfil() {
  const { user, profile, refreshProfile } = useAuth()
  const [emailReminders, setEmailReminders] = useState(profile?.email_reminders ?? true)
  const [savingReminders, setSavingReminders] = useState(false)
  const [remindersSaved, setRemindersSaved]   = useState(false)
  const [stats, setStats] = useState(null)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    if (profile) setEmailReminders(profile.email_reminders ?? true)
  }, [profile])

  useEffect(() => {
    loadStats()
  }, [user])

  async function loadStats() {
    const { data } = await supabase
      .from('predictions')
      .select('points_earned, league_id')
      .eq('user_id', user.id)

    if (data) {
      const global    = data.filter(p => p.league_id === null)
      const perLeague = data.filter(p => p.league_id !== null)
      const allScored = data.filter(p => p.points_earned !== null)
      setStats({
        totalPredictions: data.length,
        globalPredictions: global.length,
        perLeaguePredictions: perLeague.length,
        exact:   allScored.filter(p => p.points_earned === 3).length,
        correct: allScored.filter(p => p.points_earned === 1).length,
        wrong:   allScored.filter(p => p.points_earned === 0).length,
        accuracy: allScored.length > 0
          ? Math.round(((allScored.filter(p => p.points_earned > 0).length) / allScored.length) * 100)
          : null,
      })
    }
    setLoadingStats(false)
  }

  async function toggleReminders() {
    const newVal = !emailReminders
    setEmailReminders(newVal)
    setSavingReminders(true)
    setRemindersSaved(false)

    const { error } = await supabase
      .from('profiles')
      .update({ email_reminders: newVal })
      .eq('id', user.id)

    setSavingReminders(false)
    if (!error) {
      setRemindersSaved(true)
      await refreshProfile()
      setTimeout(() => setRemindersSaved(false), 2500)
    } else {
      setEmailReminders(!newVal) // revertir en caso de error
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-2xl font-bold text-stone-100">Mi perfil</h2>
        <p className="text-stone-400 text-sm mt-1">Ajustes de tu cuenta</p>
      </div>

      {/* Tarjeta de identidad */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-2xl flex-shrink-0">
          {profile?.username?.[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-stone-100 truncate">{profile?.username}</p>
          <p className="text-stone-400 text-sm truncate">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
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
              { label: 'Pronósticos',  value: stats.totalPredictions, icon: '📝', color: 'text-stone-300' },
              { label: 'Exactos',      value: stats.exact,            icon: '🎯', color: 'text-amber-400' },
              { label: 'Correctos',    value: stats.correct,          icon: '✓',  color: 'text-blue-400'  },
              { label: 'Precisión',    value: stats.accuracy !== null ? `${stats.accuracy}%` : '—', icon: '📊', color: 'text-green-400' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="card p-4 text-center">
                <div className="text-xl mb-1">{icon}</div>
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-stone-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Notificaciones */}
      <div>
        <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-wider mb-3">Notificaciones</h3>
        <div className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-stone-100 font-medium">Recordatorios por email</p>
              <p className="text-stone-400 text-sm mt-1">
                Recibe un email cuando un partido empiece en menos de 2 horas y todavía no hayas pronosticado.
              </p>
              {remindersSaved && (
                <p className="text-green-400 text-xs mt-2 font-medium">✓ Guardado</p>
              )}
            </div>
            {/* Toggle */}
            <button
              onClick={toggleReminders}
              disabled={savingReminders}
              className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none mt-0.5 ${
                emailReminders ? 'bg-amber-500' : 'bg-stone-700'
              } disabled:opacity-60`}
              role="switch"
              aria-checked={emailReminders}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                emailReminders ? 'translate-x-6' : 'translate-x-0'
              }`} />
              {savingReminders && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Spinner size="sm" />
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
