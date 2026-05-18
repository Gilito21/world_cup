import { useEffect, useState } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getCache, setCache } from '../lib/dataCache'
import { useLang } from '../contexts/LangContext'
import { SkeletonBox } from './Skeleton'

// Renders a side-by-side comparison of league vs global accuracy for a
// finished match. Used inside the expanded panel of FinishedMatchCard.
//
// One RPC call per match, cached for 5 min. The data is small enough
// (single jsonb row) that we can refetch eagerly on expand without
// worrying about request volume.

function Bar({ pct, color }) {
  return (
    <div className="h-1.5 bg-paper rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

function AccuracyColumn({ label, stats, t }) {
  const pctExact   = stats.total > 0 ? Math.round((stats.exact   / stats.total) * 100) : 0
  const pctCorrect = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0

  return (
    <div className="flex-1 min-w-0 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">{label}</span>
        <span className="text-[11px] text-ink/50">{t('postmortem.nPreds', { n: stats.total })}</span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink/70">🎯 {t('postmortem.exactPct')}</span>
          <span className="font-bold text-ink tabular-nums">{pctExact}%</span>
        </div>
        <Bar pct={pctExact} color="bg-ink" />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink/70">✓ {t('postmortem.correctPct')}</span>
          <span className="font-bold text-blue-500 tabular-nums">{pctCorrect}%</span>
        </div>
        <Bar pct={pctCorrect} color="bg-blue-500" />
      </div>

      {stats.top_score && (
        <p className="text-[11px] text-ink/60 pt-1">
          {t('postmortem.topScore', { score: stats.top_score })}
        </p>
      )}
    </div>
  )
}

function PostmortemSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonBox className="h-3 w-32" />
      <div className="flex gap-4">
        <SkeletonBox className="flex-1 h-20" />
        <SkeletonBox className="flex-1 h-20" />
      </div>
    </div>
  )
}

export default function MatchPostmortem({ matchId, leagueId }) {
  const { t } = useLang()
  const cacheKey = `postmortem:${matchId}:${leagueId ?? 'global'}`
  const [data,    setData]    = useState(() => getCache(cacheKey) ?? null)
  const [loading, setLoading] = useState(() => !getCache(cacheKey))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: pm, error } = await sq(
        supabase.rpc('match_postmortem_v1', {
          p_match_id:  matchId,
          p_league_id: leagueId ?? null,
        })
      )
      if (cancelled) return
      if (!error && pm) {
        setData(pm)
        setCache(cacheKey, pm, 5 * 60 * 1000)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [matchId, leagueId, cacheKey])

  if (loading) return <PostmortemSkeleton />
  if (!data) return null

  const hasLeague = !!data.league && data.league.total > 0
  const hasGlobal = data.global?.total > 0

  if (!hasGlobal && !hasLeague) {
    return (
      <p className="text-xs text-ink/50 italic text-center py-2">{t('postmortem.empty')}</p>
    )
  }

  // Tiny tagline summarising who got it more often. Helps the user spot
  // whether their league outperformed the average or not without parsing
  // the bars themselves.
  let summary = null
  if (hasLeague && hasGlobal && data.league.total > 0 && data.global.total > 0) {
    const lp = (data.league.exact / data.league.total) * 100
    const gp = (data.global.exact / data.global.total) * 100
    const diff = Math.round(lp - gp)
    if (Math.abs(diff) >= 5) {
      summary = diff > 0
        ? { text: t('postmortem.leagueBeatsGlobal', { n: diff }),  cls: 'text-grass-600' }
        : { text: t('postmortem.globalBeatsLeague', { n: -diff }), cls: 'text-ink/60' }
    } else {
      summary = { text: t('postmortem.even'), cls: 'text-ink/60' }
    }
  }

  return (
    <div className="rounded-none border border-ink/20 bg-paper p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink/80">{t('postmortem.title')}</p>
        {summary && (
          <p className={`text-[11px] font-medium ${summary.cls}`}>{summary.text}</p>
        )}
      </div>
      <div className="flex gap-4">
        {hasLeague && (
          <AccuracyColumn label={t('postmortem.colLeague')} stats={data.league} t={t} />
        )}
        {hasLeague && hasGlobal && <div className="w-px bg-paper-200" />}
        {hasGlobal && (
          <AccuracyColumn label={t('postmortem.colGlobal')} stats={data.global} t={t} />
        )}
      </div>
    </div>
  )
}
