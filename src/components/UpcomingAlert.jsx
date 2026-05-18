import { useEffect, useState } from 'react'
import { supabase, sq } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
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
  const { t }            = useLang()
  const [missing, setMissing]     = useState([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDismissed(false)

    async function fetchMissing() {
      if (!activeLeague) { if (!cancelled) setMissing([]); return }

      const predictionMode = activeLeague.prediction_mode ?? 'global'
      const now       = new Date()
      const windowEnd = new Date(now.getTime() + WINDOW_HOURS * 3_600_000)

      const { data: upcoming } = await sq(
        supabase
          .from('matches')
          .select('id, home_team, away_team, home_flag, away_flag, match_date')
          .eq('status', 'scheduled')
          .gt('match_date', now.toISOString())
          .lte('match_date', windowEnd.toISOString())
          .order('match_date')
      )

      if (cancelled) return
      if (!upcoming || upcoming.length === 0) { setMissing([]); return }

      const predQuery = predictionMode === 'per_league'
        ? supabase.from('predictions').select('match_id').eq('user_id', user.id).eq('league_id', activeLeague.id)
        : supabase.from('predictions').select('match_id').eq('user_id', user.id).is('league_id', null)

      const { data: preds } = await sq(predQuery)
      if (cancelled) return

      const predictedIds = new Set((preds ?? []).map(p => p.match_id))
      setMissing(upcoming.filter(m => !predictedIds.has(m.id)))
    }

    fetchMissing()
    return () => { cancelled = true }
  }, [user?.id, activeLeague?.id, activeLeague?.prediction_mode])

  if (dismissed || missing.length === 0) return null

  const urgentCount = missing.filter(m => {
    const h = (new Date(m.match_date) - new Date()) / 3_600_000
    return h < 3
  }).length

  return (
    <div className={`rounded-none border p-4 flex gap-3 ${
      urgentCount > 0
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-paper-200 border-ink/20'
    }`}>
      <div className="text-xl flex-shrink-0 mt-0.5">
        {urgentCount > 0 ? '🚨' : '⏰'}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${urgentCount > 0 ? 'text-grass-500' : 'text-grass-500'}`}>
          {urgentCount > 0
            ? t('upcoming.urgentTitle', { n: urgentCount, s: urgentCount > 1 ? 's' : '' })
            : t('upcoming.normalTitle', { n: missing.length, s: missing.length > 1 ? 's' : '', h: WINDOW_HOURS })}
        </p>

        <ul className="mt-2 space-y-1">
          {missing.slice(0, 3).map(m => {
            const timeStr = timeLeft(m.match_date)
            const hoursLeft = (new Date(m.match_date) - new Date()) / 3_600_000
            return (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <Flag team={m.home_team} />
                <span className="text-ink/80 truncate">
                  {teamName(m.home_team)} vs {teamName(m.away_team)}
                </span>
                {timeStr && (
                  <span className={`ml-auto flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                    hoursLeft < 3
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-paper-200 text-ink/60'
                  }`}>
                    en {timeStr}
                  </span>
                )}
              </li>
            )
          })}
          {missing.length > 3 && (
            <li className="text-xs text-ink/50">{t('upcoming.moreMatches', { n: missing.length - 3 })}</li>
          )}
        </ul>
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="text-ink/60 hover:text-ink/80 transition-colors flex-shrink-0 self-start text-lg leading-none"
        aria-label={t('upcoming.closeBtn')}
      >
        ✕
      </button>
    </div>
  )
}
