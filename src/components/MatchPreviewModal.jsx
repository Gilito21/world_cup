import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase, sq } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLang } from '../contexts/LangContext'
import { Flag, teamName } from '../utils/teams'
import useScrollLock from '../lib/useScrollLock'
import Spinner from './Spinner'

function formatDateTime(date, locale) {
  return new Date(date).toLocaleString(locale, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function scoreLine(p) {
  return p?.home_score != null && p?.away_score != null ? `${p.home_score}–${p.away_score}` : null
}

export default function MatchPreviewModal({ match, userPrediction, league, onClose }) {
  useScrollLock()
  const { user } = useAuth()
  const { t, dateLocale } = useLang()
  const [members, setMembers] = useState(null)
  const [predictions, setPredictions] = useState(null)
  const [loading, setLoading] = useState(true)

  const matchStart = new Date(match.match_date).getTime()
  const hasStarted = Date.now() >= matchStart
  const isFinished = match.status === 'finished'

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Load league members + their predictions for this match (only after kickoff)
  useEffect(() => {
    if (!league) { setLoading(false); return }
    if (!hasStarted) { setLoading(false); return }

    let cancelled = false
    ;(async () => {
      const { data: memberRows } = await sq(
        supabase.from('league_members')
          .select('user_id, prediction_mode, profiles(username, avatar_url)')
          .eq('league_id', league.id)
      )
      if (cancelled || !memberRows) { setLoading(false); return }

      const userIds    = memberRows.map(m => m.user_id)
      const modeByUser = Object.fromEntries(memberRows.map(m => [m.user_id, m.prediction_mode ?? 'global']))

      const { data: allPredRows } = await sq(
        supabase.from('predictions')
          .select('user_id, home_score, away_score, tiebreaker, points_earned, league_id')
          .eq('match_id', match.id)
          .or(`league_id.eq.${league.id},league_id.is.null`)
          .in('user_id', userIds)
      )
      if (cancelled) return

      const predRows = (allPredRows ?? []).filter(p => {
        const mode     = modeByUser[p.user_id] ?? 'global'
        const expected = mode === 'per_league' ? league.id : null
        return p.league_id === expected
      })

      setMembers(memberRows)
      setPredictions(predRows)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [league?.id, match.id, hasStarted])

  // Aggregate consensus
  const consensus = useMemo(() => {
    if (!predictions || predictions.length === 0) return null
    const outcomes = { home: 0, draw: 0, away: 0 }
    const scoreCounts = {}
    for (const p of predictions) {
      if (p.home_score == null || p.away_score == null) continue
      const outcome = p.home_score > p.away_score ? 'home' : p.home_score < p.away_score ? 'away' : 'draw'
      outcomes[outcome]++
      const key = `${p.home_score}-${p.away_score}`
      scoreCounts[key] = (scoreCounts[key] ?? 0) + 1
    }
    const total = predictions.length
    const topScore = Object.entries(scoreCounts).sort((a, b) => b[1] - a[1])[0]
    return { outcomes, total, topScore: topScore ? { score: topScore[0], count: topScore[1] } : null }
  }, [predictions])

  // Build member rows with their predictions joined
  const memberRows = useMemo(() => {
    if (!members || !predictions) return []
    const predByUser = Object.fromEntries(predictions.map(p => [p.user_id, p]))
    return members
      .map(m => ({
        userId:    m.user_id,
        username:  m.profiles?.username ?? '—',
        avatarUrl: m.profiles?.avatar_url ?? null,
        pred:      predByUser[m.user_id] ?? null,
        isMe:      m.user_id === user?.id,
      }))
      .sort((a, b) => {
        if (a.isMe) return -1
        if (b.isMe) return 1
        if (a.pred && !b.pred) return -1
        if (!a.pred && b.pred) return 1
        return a.username.localeCompare(b.username)
      })
  }, [members, predictions, user?.id])

  const userScore  = scoreLine(userPrediction)
  const actualScore = isFinished && match.home_score != null
    ? `${match.home_score}–${match.away_score}`
    : null
  const pointsEarned = userPrediction?.points_earned ?? null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-stone-900/60 backdrop-blur-md animate-fade-in px-3 sm:px-4 sm:py-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden animate-slide-up max-h-[85dvh] sm:max-h-[calc(100dvh-4rem)] flex flex-col">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-stone-900 via-stone-800 to-stone-900 p-5 text-white">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center text-white transition-colors"
            aria-label={t('common.close')}
          >
            ✕
          </button>
          <div className="flex items-center gap-1.5 mb-3 text-[11px] uppercase tracking-wider text-amber-400/80 font-semibold">
            {match.group_name && <span>{t('common.group', { g: match.group_name })}</span>}
            {match.group_name && <span className="text-stone-500">·</span>}
            <span>{formatDateTime(match.match_date, dateLocale)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0 flex flex-col items-center text-center">
              <Flag team={match.home_team} className="w-10 h-10 text-3xl" />
              <p className="text-sm font-bold mt-1 truncate w-full">{teamName(match.home_team)}</p>
            </div>
            <div className="flex-shrink-0 text-center px-2">
              {actualScore ? (
                <>
                  <p className="text-3xl font-black text-amber-400">{actualScore}</p>
                  <p className="text-[10px] uppercase tracking-wider text-stone-400 mt-0.5">{t('pronosticos.finishedLabel')}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-stone-300">vs</p>
                  {!hasStarted && (
                    <p className="text-[10px] uppercase tracking-wider text-stone-400 mt-0.5">{t('preview.upcoming')}</p>
                  )}
                </>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col items-center text-center">
              <Flag team={match.away_team} className="w-10 h-10 text-3xl" />
              <p className="text-sm font-bold mt-1 truncate w-full">{teamName(match.away_team)}</p>
            </div>
          </div>
          {match.venue && (
            <p className="text-center text-[11px] text-stone-400 mt-3">📍 {match.venue}</p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4">
          {/* User's prediction summary */}
          {userPrediction ? (
            <div className={`rounded-2xl border p-3 ${
              isFinished
                ? pointsEarned > 0
                  ? 'bg-green-50 border-green-200'
                  : 'bg-stone-50 border-stone-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">{t('preview.yourPrediction')}</p>
                  <p className="text-xl font-bold text-stone-900 mt-0.5">{userScore}</p>
                </div>
                {isFinished && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">{t('preview.pointsEarned')}</p>
                    <p className={`text-2xl font-black ${pointsEarned > 0 ? 'text-green-600' : 'text-stone-400'}`}>
                      +{pointsEarned ?? 0}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3 text-center">
              <p className="text-sm text-stone-500">{t('preview.noPrediction')}</p>
            </div>
          )}

          {/* Consensus + member list (only after kickoff) */}
          {!hasStarted ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-center space-y-1">
              <p className="text-2xl">🔒</p>
              <p className="text-sm font-semibold text-stone-700">{t('preview.lockedTitle')}</p>
              <p className="text-xs text-stone-500">{t('preview.lockedDesc')}</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : consensus && consensus.total > 0 ? (
            <>
              {/* Consensus */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 mb-2">
                  {t('preview.leagueConsensus', { n: consensus.total })}
                </p>
                <ConsensusBar outcomes={consensus.outcomes} total={consensus.total} homeTeam={match.home_team} awayTeam={match.away_team} t={t} />
                {consensus.topScore && (
                  <p className="text-xs text-stone-500 mt-2 text-center">
                    {t('preview.topScore', { score: consensus.topScore.score.replace('-', '–'), n: consensus.topScore.count })}
                  </p>
                )}
              </div>

              {/* Member-by-member */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 mb-2">{t('preview.members')}</p>
                <div className="rounded-2xl border border-stone-200 overflow-hidden">
                  {memberRows.map(m => (
                    <MemberRow
                      key={m.userId}
                      m={m}
                      actual={actualScore ? { home: match.home_score, away: match.away_score } : null}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-center text-sm text-stone-400 py-4">{t('preview.noLeaguePredictions')}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function ConsensusBar({ outcomes, total, homeTeam, awayTeam, t }) {
  const homePct = Math.round((outcomes.home / total) * 100)
  const drawPct = Math.round((outcomes.draw / total) * 100)
  const awayPct = 100 - homePct - drawPct
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 rounded-full overflow-hidden bg-stone-100">
        {homePct > 0 && <div style={{ width: `${homePct}%` }} className="bg-amber-500" />}
        {drawPct > 0 && <div style={{ width: `${drawPct}%` }} className="bg-stone-400" />}
        {awayPct > 0 && <div style={{ width: `${awayPct}%` }} className="bg-blue-500" />}
      </div>
      <div className="flex justify-between text-[11px] text-stone-500">
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />{teamName(homeTeam)} {homePct}%</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-stone-400 mr-1" />{t('preview.draw')} {drawPct}%</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />{teamName(awayTeam)} {awayPct}%</span>
      </div>
    </div>
  )
}

function MemberRow({ m, actual, t }) {
  const score = scoreLine(m.pred)
  const isExact = actual && m.pred && m.pred.home_score === actual.home && m.pred.away_score === actual.away
  const isCorrect = actual && m.pred && !isExact && (
    (m.pred.home_score > m.pred.away_score && actual.home > actual.away) ||
    (m.pred.home_score < m.pred.away_score && actual.home < actual.away) ||
    (m.pred.home_score === m.pred.away_score && actual.home === actual.away)
  )
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 border-b border-stone-100 last:border-0 ${
      m.isMe ? 'bg-amber-50/60' : ''
    }`}>
      {m.avatarUrl ? (
        <img src={m.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0">
          {m.username[0]?.toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <p className={`text-sm truncate ${m.isMe ? 'font-bold text-stone-900' : 'font-medium text-stone-700'}`}>
          {m.username}
        </p>
        {m.isMe && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">{t('common.you').toUpperCase()}</span>}
      </div>
      {score ? (
        <span className={`text-sm font-bold tabular-nums px-2 py-0.5 rounded ${
          isExact ? 'bg-green-100 text-green-700'
          : isCorrect ? 'bg-amber-100 text-amber-700'
          : 'text-stone-500'
        }`}>
          {score}
        </span>
      ) : (
        <span className="text-xs text-stone-300">—</span>
      )}
    </div>
  )
}
