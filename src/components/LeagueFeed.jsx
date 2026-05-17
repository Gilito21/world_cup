import { useEffect, useState, useCallback } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getCache, setCache } from '../lib/dataCache'
import { useLang } from '../contexts/LangContext'
import { teamName } from '../utils/teams'
import { LeagueFeedSkeleton } from './Skeleton'

// Avatar reused from Clasificacion's style — kept local to avoid coupling.
function Avatar({ url, username }) {
  if (url) {
    return <img src={url} alt={username} className="w-8 h-8 rounded-full object-cover border border-stone-200 flex-shrink-0" />
  }
  return (
    <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-300 text-stone-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
      {username?.[0]?.toUpperCase()}
    </div>
  )
}

function timeAgo(ts, t) {
  const diff = Date.now() - new Date(ts).getTime()
  const min  = Math.floor(diff / 60000)
  if (min < 1)   return t('feed.justNow')
  if (min < 60)  return t('feed.minAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24)   return t('feed.hourAgo', { n: hr })
  const day = Math.floor(hr / 24)
  if (day < 7)   return t('feed.dayAgo',  { n: day, s: day === 1 ? '' : 's' })
  const wk = Math.floor(day / 7)
  return t('feed.weekAgo', { n: wk, s: wk === 1 ? '' : 's' })
}

function eventLabel(evt, t) {
  switch (evt.event_type) {
    case 'join':
      return { icon: '🎉', text: t('feed.evtJoin'),    accent: 'text-stone-700' }
    case 'submit_matches':
      return { icon: '📤', text: t('feed.evtSubmitMatches'), accent: 'text-blue-600' }
    case 'submit_extras':
      return { icon: '🎲', text: t('feed.evtSubmitExtras'),  accent: 'text-violet-600' }
    case 'exact':
      return {
        icon: '🎯',
        text: t('feed.evtExact', {
          home: teamName(evt.data?.home_team),
          away: teamName(evt.data?.away_team),
          hs:   evt.data?.home_score,
          as:   evt.data?.away_score,
        }),
        accent: 'text-amber-600',
      }
    case 'correct':
      return {
        icon: '✓',
        text: t('feed.evtCorrect', {
          home: teamName(evt.data?.home_team),
          away: teamName(evt.data?.away_team),
        }),
        accent: 'text-emerald-600',
      }
    default:
      return { icon: '•', text: '', accent: 'text-stone-500' }
  }
}

export default function LeagueFeed({ leagueId }) {
  const { t } = useLang()
  const cacheKey = leagueId ? `feed:${leagueId}` : null
  const [events,   setEvents]   = useState(() => cacheKey ? (getCache(cacheKey) ?? null) : null)
  const [loading,  setLoading]  = useState(() => !getCache(cacheKey))
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    if (!leagueId) { setEvents([]); setLoading(false); return }
    const { data, error } = await sq(
      supabase.rpc('league_feed_v1', { p_league_id: leagueId, p_limit: 30 })
    )
    if (error || !data) {
      // Keep cached results visible on transient failures.
      if (!getCache(cacheKey)) setEvents([])
    } else {
      setEvents(data)
      setCache(cacheKey, data)
    }
    setLoading(false)
  }, [leagueId, cacheKey])

  useEffect(() => { load() }, [load])

  // Realtime: when someone in the league submits a prediction or a match
  // gets resolved, refresh the feed in the background. Channel name is
  // bound to the league id so multiple league switches don't accumulate.
  useEffect(() => {
    if (!leagueId) return
    const channel = supabase
      .channel(`league-feed-${leagueId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'prediction_submissions' },
        () => load())
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId, load])

  if (loading) return <LeagueFeedSkeleton />


  if (!events || events.length === 0) {
    return (
      <div className="card p-4 text-center">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">{t('feed.title')}</p>
        <p className="text-sm text-stone-500">{t('feed.empty')}</p>
      </div>
    )
  }

  const visible = expanded ? events : events.slice(0, 6)

  return (
    <div className="card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📡</span>
          <span className="text-sm font-semibold text-stone-700">{t('feed.title')}</span>
        </div>
        <span className="text-[11px] text-stone-400">{t('feed.count', { n: events.length })}</span>
      </div>
      <ul className="divide-y divide-stone-100">
        {visible.map((evt, i) => {
          const { icon, text, accent } = eventLabel(evt, t)
          return (
            <li key={`${evt.event_type}-${evt.user_id}-${evt.event_time}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar url={evt.avatar_url} username={evt.username} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-800 truncate">
                  <span className="font-semibold">{evt.username}</span>{' '}
                  <span className={accent}>{icon}</span>{' '}
                  <span className="text-stone-600">{text}</span>
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">{timeAgo(evt.event_time, t)}</p>
              </div>
            </li>
          )
        })}
      </ul>
      {events.length > 6 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full text-center py-2 text-xs font-medium text-amber-600 hover:bg-stone-50 border-t border-stone-100"
        >
          {expanded ? t('feed.collapse') : t('feed.expand', { n: events.length - 6 })}
        </button>
      )}
    </div>
  )
}
