import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getMatchCache, setMatchCache } from '../lib/matchCache'
import { getCache, setCache } from '../lib/dataCache'
import usePullRefresh from '../lib/usePullRefresh'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import Spinner from '../components/Spinner'
import { MatchListSkeleton } from '../components/Skeleton'
import MatchPostmortem from '../components/MatchPostmortem'
import { EditorialBand, EditorialStats } from '../components/Editorial'
import { Flag, teamName } from '../utils/teams'
import { computePredictedKnockout } from '../utils/tournament'

function isTbd(name) {
  return !name || name === 'TBD' || name === 'TBA' || name === 'Por determinar'
}

function formatDate(dateStr, locale) {
  return new Date(dateStr).toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function getWinner(home, away) {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

// ── Fila de un pronóstico en la tabla expandida ─────────────────────────────
function PredRow({ entry, realHome, realAway }) {
  const pts        = entry.points_earned ?? 0
  const exact      = entry.home_score === realHome && entry.away_score === realAway
  const realWinner = getWinner(realHome, realAway)
  const predWinner = getWinner(entry.home_score, entry.away_score)
  const correct    = !exact && predWinner === realWinner

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-none text-sm ${
      exact   ? 'bg-grass-500/10'
      : correct ? 'bg-blue-500/10'
      : 'bg-paper'
    }`}>
      {/* Avatar + nombre */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
        exact ? 'bg-grass-500/20 text-grass-600' : correct ? 'bg-blue-500/20 text-blue-500' : 'bg-paper-200 text-ink/60'
      }`}>
        {entry.username?.[0]?.toUpperCase()}
      </div>
      <span className="font-medium text-ink truncate flex-1">{entry.username}</span>

      {/* Pronóstico */}
      <span className="font-mono text-ink/80 flex-shrink-0">
        {entry.home_score} - {entry.away_score}
      </span>

      {/* Puntos */}
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
        pts === 3 ? 'bg-grass-500/15 text-grass-600 border-grass-500/30'
        : pts === 1 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        : 'bg-paper-200 text-ink/60 border-ink/30'
      }`}>
        {pts === 3 ? '🎯 +3' : pts === 1 ? '✓ +1' : '✗ 0'}
      </span>
    </div>
  )
}

// ── Tarjeta de partido finalizado ────────────────────────────────────────────
function FinishedMatchCard({ match, myPrediction, league, realHome, realAway }) {
  const { user }   = useAuth()
  const { t, dateLocale } = useLang()
  const effectiveHome = (isTbd(match.home_team) && realHome) ? realHome : match.home_team
  const effectiveAway = (isTbd(match.away_team) && realAway) ? realAway : match.away_team
  const winner     = getWinner(match.home_score, match.away_score)
  const [expanded, setExpanded]     = useState(false)
  const [allPreds, setAllPreds]     = useState(null)
  const [loadingPreds, setLoadingPreds] = useState(false)

  async function loadAllPredictions() {
    if (allPreds !== null) { setExpanded(e => !e); return }
    setExpanded(true)
    setLoadingPreds(true)

    let preds = []
    if (league) {
      const [{ data: memberRows }, { data: rawPreds }] = await Promise.all([
        supabase.from('league_members').select('user_id, prediction_mode').eq('league_id', league.id),
        supabase.from('predictions')
          .select('user_id, home_score, away_score, points_earned, league_id')
          .eq('match_id', match.id)
          .or(`league_id.eq.${league.id},league_id.is.null`),
      ])
      const modeByUser = Object.fromEntries((memberRows ?? []).map(m => [m.user_id, m.prediction_mode ?? 'global']))
      const memberIds  = new Set(Object.keys(modeByUser))
      preds = (rawPreds ?? []).filter(p => {
        if (!memberIds.has(p.user_id)) return false
        const expected = (modeByUser[p.user_id] ?? 'global') === 'per_league' ? league.id : null
        return p.league_id === expected
      })
    } else {
      const { data } = await supabase.from('predictions')
        .select('user_id, home_score, away_score, points_earned')
        .eq('match_id', match.id).is('league_id', null)
      preds = data ?? []
    }

    // Perfiles para obtener usernames
    const userIds = [...new Set((preds ?? []).map(p => p.user_id))]
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, username').in('id', userIds)
      : { data: [] }

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    const enriched = (preds ?? [])
      .map(p => ({ ...p, username: profileMap[p.user_id]?.username ?? '?' }))
      .sort((a, b) => (b.points_earned ?? 0) - (a.points_earned ?? 0))

    setAllPreds(enriched)
    setLoadingPreds(false)
  }

  const stats = allPreds
    ? {
        total:   allPreds.length,
        exact:   allPreds.filter(p => p.points_earned === 3).length,
        correct: allPreds.filter(p => p.points_earned === 1).length,
        wrong:   allPreds.filter(p => (p.points_earned ?? 0) === 0).length,
      }
    : null

  return (
    <div className="card overflow-hidden">
      {/* Cabecera del partido */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/60 capitalize">{formatDate(match.match_date, dateLocale)}</span>
            {match.group_name && (
              <span className="text-xs text-ink/50 bg-paper px-1.5 py-0.5 rounded">{t('resultados.stageGroupPrefix')}{match.group_name}</span>
            )}
          </div>
          <span className="text-xs text-ink/50 bg-paper px-2 py-0.5 rounded-full border border-ink/30">
            {t(`stages.${match.stage}`) ?? match.stage}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex-1 flex items-center justify-end gap-2 min-w-0 ${winner !== 'home' ? 'opacity-60' : ''}`}>
            <span className={`text-sm font-semibold truncate text-right ${winner === 'home' ? 'text-ink' : 'text-ink/50'}`}>
              {teamName(effectiveHome)}
            </span>
            <Flag team={effectiveHome} />
          </div>

          <div className="flex-shrink-0 flex items-center gap-2 bg-paper rounded-none px-4 py-2 border border-ink/30">
            <span className={`text-xl font-bold ${winner === 'home' ? 'text-grass-500' : 'text-ink/80'}`}>{match.home_score}</span>
            <span className="text-ink/50 text-sm">-</span>
            <span className={`text-xl font-bold ${winner === 'away' ? 'text-grass-500' : 'text-ink/80'}`}>{match.away_score}</span>
          </div>

          <div className={`flex-1 flex items-center justify-start gap-2 min-w-0 ${winner !== 'away' ? 'opacity-60' : ''}`}>
            <Flag team={effectiveAway} />
            <span className={`text-sm font-semibold truncate ${winner === 'away' ? 'text-ink' : 'text-ink/50'}`}>
              {teamName(effectiveAway)}
            </span>
          </div>
        </div>

        {/* Mi pronóstico + botón ver todos */}
        <div className="mt-3 pt-3 border-t border-ink/20 flex items-center justify-between gap-3">
          <div className="text-xs text-ink/60">
            {myPrediction ? (
              <>
                {t('resultados.myPrediction')}{' '}
                <span className="text-ink/80 font-medium font-mono">
                  {myPrediction.home_score} - {myPrediction.away_score}
                </span>
                {' · '}
                <span className={
                  myPrediction.points_earned === 3 ? 'text-grass-600 font-semibold' :
                  myPrediction.points_earned === 1 ? 'text-blue-400' : 'text-ink/60'
                }>
                  {myPrediction.points_earned === 3 ? '🎯 +3 pts' :
                   myPrediction.points_earned === 1 ? '✓ +1 pt' : '✗ 0 pts'}
                </span>
              </>
            ) : (
              <span className="italic">{t('resultados.noPrediction')}</span>
            )}
          </div>

          <button
            onClick={loadAllPredictions}
            className="flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors flex-shrink-0"
          >
            <span>{expanded ? '▲' : '▼'}</span>
            <span>{expanded ? t('resultados.hide') : t('resultados.seeAll')}</span>
          </button>
        </div>
      </div>

      {/* Panel expandido: pronósticos de todos */}
      {expanded && (
        <div className="border-t border-ink/20 bg-cream px-4 pb-4 pt-3 space-y-3">
          {/* Post-mortem: comparativa liga vs mundo, una llamada RPC */}
          <MatchPostmortem matchId={match.id} leagueId={league?.id ?? null} />

          {loadingPreds ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : allPreds && allPreds.length > 0 ? (
            <>
              {/* Resumen rápido */}
              <div className="flex gap-3 text-xs text-ink/60">
                <span>{t('resultados.quickTotal', { n: stats.total })}</span>
                <span className="text-ink">{t('resultados.quickExact', { n: stats.exact })}</span>
                <span className="text-blue-400">{t('resultados.quickCorrect', { n: stats.correct })}</span>
                <span>{t('resultados.quickWrong', { n: stats.wrong })}</span>
              </div>
              {/* Lista de pronósticos */}
              <div className="space-y-1.5">
                {allPreds.map(p => (
                  <PredRow
                    key={p.user_id}
                    entry={p}
                    realHome={match.home_score}
                    realAway={match.away_score}
                  />
                ))}
            </div>
            </>
          ) : (
            <p className="text-ink/60 text-sm text-center py-3 italic">
              {t('resultados.noPredictions')}
            </p>
          )}
        </div>
      )}

      {match.venue && (
        <div className="px-4 pb-3 text-center text-xs text-ink/50">📍 {match.venue}</div>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function Resultados() {
  const { user }                   = useAuth()
  const { activeLeague }           = useLeague()
  const { t, dateLocale }          = useLang()

  const STAGES = useMemo(() => ({
    group:         t('stages.group'),
    round_of_32:   t('stages.round_of_32'),
    round_of_16:   t('stages.round_of_16'),
    quarter_final: t('stages.quarter_final'),
    semi_final:    t('stages.semi_final'),
    third_place:   t('stages.third_place'),
    final:         t('stages.final'),
  }), [t])

  const [allMatches, setAllMatches]   = useState(() => getMatchCache() ?? [])
  const [matches, setMatches]         = useState(() => {
    const cached = getMatchCache()
    // Cache canónico = ascendente. En esta página presentamos los partidos
    // finalizados de más reciente a más antiguo, así que revertimos aquí.
    return cached ? cached.filter(m => m.status === 'finished').slice().reverse() : []
  })
  const [predictions, setPredictions] = useState({})
  const [loading, setLoading]         = useState(() => !getMatchCache())
  const [filter, setFilter]           = useState('all')

  const realKnockoutOverlay = useMemo(() => {
    if (!allMatches.length) return {}
    const realPredMap = {}
    for (const m of allMatches) {
      if (m.home_score != null && m.away_score != null) {
        realPredMap[m.id] = { home_score: m.home_score, away_score: m.away_score, tiebreaker: m.winner ?? null }
      }
    }
    return computePredictedKnockout(allMatches, realPredMap)
  }, [allMatches])

  const load = useCallback(async ({ force = false } = {}) => {
    const predictionMode = activeLeague?.prediction_mode ?? 'global'
    const leagueKey = (predictionMode === 'per_league' && activeLeague) ? activeLeague.id : 'global'
    const predCacheKey = `preds:${user.id}:${leagueKey}`
    const cachedPreds = getCache(predCacheKey)
    if (!force) {
      if (cachedPreds) setPredictions(cachedPreds)
      else setPredictions({})
    }
    const hasCachedView = matches.length > 0 && cachedPreds
    if (!hasCachedView && !force) setLoading(true)
    try {
      const cachedMatches = !force ? getMatchCache() : null
      const [{ data: allMatchData }, { data: predData }] = await Promise.all([
        cachedMatches
          ? Promise.resolve({ data: cachedMatches })
          // El cache compartido espera orden ascendente (ver matchCache.js).
          // Pedimos ascendente y revertimos solo para la presentación local
          // de "últimos partidos primero".
          : sq(supabase.from('matches').select('*').order('match_date')),
        sq(predictionMode === 'per_league' && activeLeague
          ? supabase.from('predictions').select('*').eq('user_id', user.id).eq('league_id', activeLeague.id)
          : supabase.from('predictions').select('*').eq('user_id', user.id).is('league_id', null)),
      ])
      if (allMatchData) {
        setMatchCache(allMatchData)
        setAllMatches(allMatchData)
        // Mostrar los finalizados de más reciente a más antiguo.
        setMatches(allMatchData.filter(m => m.status === 'finished').slice().reverse())
      }
      if (predData) {
        const map = {}
        predData.forEach(p => { map[p.match_id] = p })
        setPredictions(map)
        setCache(predCacheKey, map)
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeLeague?.id, activeLeague?.prediction_mode])

  useEffect(() => { load() }, [load])

  // Pull-to-refresh: bypass the in-memory match/pred caches.
  usePullRefresh(useCallback(() => load({ force: true }), [load]))

  // Realtime: when any match resolves or its score changes, refresh quietly
  // in the background so the page reflects new finished matches without
  // requiring the user to pull-to-refresh.
  //
  // El nombre de canal incluye user.id para evitar colisiones entre
  // pestañas distintas del mismo navegador (un nombre global compartido
  // generaría carreras subscribe/removeChannel cuando hay 2 pestañas
  // abiertas y `load` cambia de identidad por un cambio de liga).
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`resultados-matches-${user.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        () => load({ force: true }))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, load])

  const stats = matches.reduce(
    (acc, m) => {
      const p = predictions[m.id]
      if (!p) return acc
      acc.total++
      if (p.points_earned === 3) acc.exact++
      else if (p.points_earned === 1) acc.correct++
      else acc.wrong++
      acc.points += p.points_earned ?? 0
      return acc
    },
    { total: 0, exact: 0, correct: 0, wrong: 0, points: 0 }
  )

  const filtered = filter === 'all'
    ? matches
    : filter === 'predicted'
    ? matches.filter(m => predictions[m.id])
    : matches.filter(m => !predictions[m.id])

  const grouped = filtered.reduce((acc, m) => {
    const key = STAGES[m.stage] ?? m.stage
    ;(acc[key] = acc[key] ?? []).push(m)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="space-y-3 py-2">
        <MatchListSkeleton count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <span className="ed-mono text-terracotta text-[10px] block mb-1.5">// {t('resultados.chapter')}</span>
            <h2 className="font-display text-xl sm:text-2xl text-ink leading-none">{t('resultados.title')}</h2>
        <p className="font-serif italic text-ink/70 text-sm mt-1">
          {t('resultados.subtitle')}
        </p>
            <EditorialBand items={['CRÓNICA', '104 PARTIDOS', 'EDICIÓN 2026']} />
      </div>

      {matches.length > 0 && (
        <EditorialStats items={[
          { label: t('resultados.statPointsShort'),  value: stats.points },
          { label: t('resultados.statExactShort'),   value: stats.exact },
          { label: t('resultados.statCorrectShort'), value: stats.correct },
          { label: t('resultados.statWrongShort'),   value: stats.wrong },
        ]} />
      )}

      {matches.length === 0 ? (
        <div className="card p-6 sm:p-10 text-center">
          <div className="text-3xl sm:text-4xl mb-3">⏳</div>
          <p className="text-ink/50 text-sm">{t('resultados.noMatchesYet')}</p>
          <p className="text-ink/50 text-xs sm:text-sm mt-1">{t('resultados.worldCupStart')}</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all',         label: t('resultados.filterAll', { n: matches.length }) },
              { key: 'predicted',   label: t('resultados.filterWith', { n: matches.filter(m => predictions[m.id]).length }) },
              { key: 'unpredicted', label: t('resultados.filterWithout', { n: matches.filter(m => !predictions[m.id]).length }) },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-none text-sm font-medium transition-colors ${
                  filter === key ? 'bg-ink text-cream' : 'bg-paper text-ink/50 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {Object.entries(grouped).map(([stage, stageMatches]) => (
            <div key={stage}>
              <h3 className="text-xs font-semibold text-ink/60 uppercase tracking-wider mb-3">
                {stage} · {t('resultados.stageMatchCount', { n: stageMatches.length, s: stageMatches.length !== 1 ? 's' : '' })}
              </h3>
              <div className="space-y-3">
                {stageMatches.map(m => (
                  <FinishedMatchCard
                    key={m.id}
                    match={m}
                    myPrediction={predictions[m.id]}
                    league={activeLeague ?? null}
                    realHome={realKnockoutOverlay[m.id]?.homeTeam ?? null}
                    realAway={realKnockoutOverlay[m.id]?.awayTeam ?? null}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
