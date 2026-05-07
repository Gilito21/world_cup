import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { Flag, teamName } from '../utils/teams'

const WINDOW_HOURS = 24

function timeLeft(dateStr) {
  const diff = new Date(dateStr) - new Date()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 1) return `${h}h ${m}m`
  return `${m} min`
}

export default function UpcomingAlert() {
  const { user }         = useAuth()
  const { activeLeague } = useLeague()
  const [missing, setMissing]     = useState([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(false)
    fetchMissing()
  }, [user?.id, activeLeague?.id])

  async function fetchMissing() {
    if (!activeLeague) { setMissing([]); return }

    const now       = new Date()
    const windowEnd = new Date(now.getTime() + WINDOW_HOURS * 3_600_000)

    const { data: upcoming } = await supabase
      .from('matches')
      .select('id, home_team, away_team, home_flag, away_flag, match_date')
      .eq('status', 'scheduled')
      .gt('match_date', now.toISOString())
      .lte('match_date', windowEnd.toISOString())
      .order('match_date')

    if (!upcoming || upcoming.length === 0) { setMissing([]); return }

    const { data: preds } = await supabase
      .from('predictions').select('match_id').eq('user_id', user.id).eq('league_id', activeLeague.id)
    const predictedIds = new Set((preds ?? []).map(p => p.match_id))

    setMissing(upcoming.filter(m => !predictedIds.has(m.id)))
  }

  if (dismissed || missing.length === 0) return null

  const urgentCount = missing.filter(m => {
    const h = (new Date(m.match_date) - new Date()) / 3_600_000
    return h < 3
  }).length

  return (
    <div className={`rounded-2xl border p-4 flex gap-3 ${
      urgentCount > 0
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-amber-500/10 border-amber-500/30'
    }`}>
      <div className="text-xl flex-shrink-0 mt-0.5">
        {urgentCount > 0 ? '🚨' : '⏰'}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${urgentCount > 0 ? 'text-red-300' : 'text-amber-300'}`}>
          {urgentCount > 0
            ? `¡${urgentCount} partido${urgentCount > 1 ? 's' : ''} a punto de empezar sin pronóstico!`
            : `${missing.length} partido${missing.length > 1 ? 's' : ''} en las próximas ${WINDOW_HOURS}h sin pronóstico`}
        </p>

        <ul className="mt-2 space-y-1">
          {missing.slice(0, 3).map(m => {
            const t = timeLeft(m.match_date)
            return (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <Flag team={m.home_team} />
                <span className="text-stone-700 truncate">
                  {teamName(m.home_team)} vs {teamName(m.away_team)}
                </span>
                {t && (
                  <span className={`ml-auto flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                    parseFloat(t) < 3 && t.includes('h') === false
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-stone-200 text-stone-500'
                  }`}>
                    en {t}
                  </span>
                )}
              </li>
            )
          })}
          {missing.length > 3 && (
            <li className="text-xs text-stone-400">y {missing.length - 3} más…</li>
          )}
        </ul>
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="text-stone-500 hover:text-stone-700 transition-colors flex-shrink-0 self-start text-lg leading-none"
        aria-label="Cerrar aviso"
      >
        ✕
      </button>
    </div>
  )
}
