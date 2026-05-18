import { useEffect, useId, useState, useMemo } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getMatchCache, setMatchCache } from '../lib/matchCache'
import { useLang } from '../contexts/LangContext'
import Spinner from '../components/Spinner'
import { Flag, teamName } from '../utils/teams'
import {
  GROUPS,
  THIRD_PLACE_QUALIFIERS,
  computeAllStandings,
  filterCompleteGroups,
  getQualifiers,
  buildRoundOf32,
  advanceKnockoutRound,
  matchLabel,
  slotLabel,
} from '../utils/tournament'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ROUND_ORDER = ['round_of_32','round_of_16','quarter_final','semi_final','third_place','final']

function buildRoundInfo(t) {
  return {
    round_of_32:   { label: t('stages.round_of_32'),   short: 'R32',                           icon: '🎽' },
    round_of_16:   { label: t('stages.round_of_16'),   short: t('stages.round_of_16Short'),    icon: '🎯' },
    quarter_final: { label: t('stages.quarter_final'), short: t('stages.quarter_finalShort'),  icon: '⚔️' },
    semi_final:    { label: t('stages.semi_final'),    short: t('stages.semi_finalShort'),      icon: '⭐' },
    third_place:   { label: t('stages.third_place'),   short: t('stages.third_placeShort'),    icon: '🥉' },
    final:         { label: t('stages.final'),         short: t('stages.finalShort'),           icon: '🏆' },
  }
}

// Knockout match IDs per round (used to filter knockoutSlots into rounds)
const ROUND_MATCH_IDS = {
  round_of_32:   ['R32_M1','R32_M2','R32_M3','R32_M4','R32_M5','R32_M6','R32_M7','R32_M8',
                  'R32_M9','R32_M10','R32_M11','R32_M12','R32_M13','R32_M14','R32_M15','R32_M16'],
  round_of_16:   ['R16_M1','R16_M2','R16_M3','R16_M4','R16_M5','R16_M6','R16_M7','R16_M8'],
  quarter_final: ['QF_M1','QF_M2','QF_M3','QF_M4'],
  semi_final:    ['SF_M1','SF_M2'],
  third_place:   ['THIRD_PLACE'],
  final:         ['FINAL'],
}

// ─── SMALL UI COMPONENTS ──────────────────────────────────────────────────────

function TeamCell({ team, winner, loser }) {
  const { t } = useLang()
  const base = 'flex items-center gap-2 min-w-0'
  const color = winner ? 'text-ink font-semibold'
              : loser  ? 'text-ink/50'
              :           'text-ink/80'
  return (
    <div className={`${base} ${color}`}>
      {team
        ? <><Flag team={team} /><span className="truncate text-sm">{teamName(team)}</span></>
        : <span className="truncate text-sm text-ink/40 italic">{t('common.tbd')}</span>
      }
    </div>
  )
}

function ScoreBadge({ home, away, bold }) {
  if (home == null || away == null) return null
  const winH = home > away
  const winA = away > home
  return (
    <div className="flex items-center gap-1 bg-paper rounded-none px-2.5 py-1 flex-shrink-0">
      <span className={`text-sm font-mono ${winH && bold ? 'text-grass-500 font-bold' : 'text-ink/70'}`}>{home}</span>
      <span className="text-ink/50 text-xs">-</span>
      <span className={`text-sm font-mono ${winA && bold ? 'text-grass-500 font-bold' : 'text-ink/70'}`}>{away}</span>
    </div>
  )
}

// ─── GROUP STANDING TABLE ─────────────────────────────────────────────────────

function GroupTable({ group, standings, qualifyingThirds }) {
  const { t } = useLang()
  const thirdQualifies = standings[2] && qualifyingThirds.has(standings[2]?.team)

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-ink/15 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-paper-200 border border-ink/20 flex items-center justify-center text-xs font-bold text-ink">
          {group}
        </span>
        <span className="text-sm font-semibold text-ink/80">{t('common.group', { g: group })}</span>
      </div>

      <table className="w-full text-xs table-fixed">
        <thead>
          <tr className="text-ink/50 border-b border-ink/15">
            <th className="text-left pl-2 pr-1 py-2 font-medium">{t('bracket.colTeam')}</th>
            <th className="w-7 text-center py-2 font-medium" title="Partidos jugados">{t('bracket.colPlayed')}</th>
            <th className="w-6 text-center py-2 font-medium" title="Ganados">{t('bracket.colWon')}</th>
            <th className="w-6 text-center py-2 font-medium" title="Empatados">{t('bracket.colDrawn')}</th>
            <th className="w-6 text-center py-2 font-medium" title="Perdidos">{t('bracket.colLost')}</th>
            <th className="w-9 text-center py-2 font-medium" title="Diferencia de goles">{t('bracket.colGD')}</th>
            <th className="w-9 text-center pr-2 py-2 font-medium" title="Puntos">{t('bracket.colPts')}</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const qualifies = i < 2
            const thirdQ    = i === 2 && thirdQualifies

            return (
              <tr
                key={s.team}
                className={`border-b border-ink/10 last:border-0 transition-colors ${
                  qualifies ? 'bg-green-50/60'
                  : thirdQ  ? 'bg-paper-200'
                  :           ''
                }`}
              >
                <td className="pl-2 pr-1 py-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-[11px] font-bold flex-shrink-0 w-3.5 ${
                      qualifies ? 'text-green-500' : thirdQ ? 'text-ink/70' : 'text-ink/40'
                    }`}>
                      {i + 1}
                    </span>
                    <Flag team={s.team} />
                    <span className="font-medium text-ink truncate text-[11px] sm:text-xs">{teamName(s.team)}</span>
                  </div>
                </td>
                <td className="text-center py-2 text-ink/60 tabular-nums">{s.played}</td>
                <td className="text-center py-2 text-ink/60 tabular-nums">{s.won}</td>
                <td className="text-center py-2 text-ink/60 tabular-nums">{s.drawn}</td>
                <td className="text-center py-2 text-ink/60 tabular-nums">{s.lost}</td>
                <td className={`text-center py-2 font-medium tabular-nums ${
                  s.gd > 0 ? 'text-green-500' : s.gd < 0 ? 'text-red-400' : 'text-ink/50'
                }`}>
                  {s.gd > 0 ? `+${s.gd}` : s.gd}
                </td>
                <td className="text-center pr-2 py-2 font-bold text-ink tabular-nums">{s.points}</td>
              </tr>
            )
          })}
          {standings.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-center text-ink/40 italic text-xs">
                {t('common.noResults')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── THIRD-PLACE QUALIFIER PANEL ─────────────────────────────────────────────

function ThirdPlaceRanking({ thirds, totalGroupsComplete }) {
  const { t } = useLang()
  const needed = THIRD_PLACE_QUALIFIERS

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-ink/15 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🥉</span>
          <span className="text-sm font-semibold text-ink/80">{t('bracket.thirds')}</span>
        </div>
        <span className="text-xs text-ink/50">{t('bracket.thirdsCount', { n: thirds.length, total: needed })}</span>
      </div>

      <div className="divide-y divide-ink/10">
        {thirds.map((third, i) => (
          <div key={third.team} className="px-4 py-2.5 flex items-center gap-3">
            <span className={`text-xs font-bold w-5 text-center ${
              i < needed ? 'text-ink font-bold' : 'text-ink/40'
            }`}>{i + 1}</span>
            <Flag team={third.team} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-ink truncate block">{teamName(third.team)}</span>
              <span className="text-xs text-ink/50">{t('common.group', { g: third.group })}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink/60">
              <span className="font-bold text-ink/80">{third.points} pts</span>
              <span className={third.gd >= 0 ? 'text-green-500' : 'text-red-400'}>
                {third.gd > 0 ? `+${third.gd}` : third.gd} DG
              </span>
              <span>{third.gf} GF</span>
            </div>
          </div>
        ))}
        {thirds.length === 0 && (
          <p className="px-4 py-6 text-center text-ink/40 italic text-sm">
            {t('bracket.noThirds')}
          </p>
        )}
        {/* Placeholder rows for remaining spots */}
        {Array.from({ length: Math.max(0, needed - thirds.length) }).map((_, i) => (
          <div key={`tbd-${i}`} className="px-4 py-2.5 flex items-center gap-3 opacity-30">
            <span className="text-xs font-bold w-5 text-center text-ink/40">{thirds.length + i + 1}</span>
            <div className="w-7 h-5 bg-paper rounded-sm flex-shrink-0" />
            <span className="text-sm text-ink/40 italic">{t('common.tbd')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── KNOCKOUT MATCH CARD ─────────────────────────────────────────────────────

function KnockoutMatchCard({ matchId, homeTeam, awayTeam, dbMatch, homeSlot, awaySlot }) {
  const { t } = useLang()
  const hs = dbMatch?.home_score ?? null
  const as = dbMatch?.away_score ?? null
  const finished = dbMatch?.status === 'finished'
  const winHome  = finished && hs != null && hs > as
  const winAway  = finished && as != null && as > hs

  return (
    <div className="card p-3 space-y-2">
      <p className="text-xs text-ink/50 font-medium">{matchLabel(matchId)}</p>

      {/* Home team row */}
      <div className="flex items-center justify-between gap-2">
        <TeamCell team={homeTeam} winner={winHome} loser={winAway} />
        {!homeTeam && (
          <span className="text-xs text-ink/40 flex-shrink-0">{slotLabel(homeSlot ?? { type:'winner', group:'?' })}</span>
        )}
        {finished && hs != null && (
          <span className={`text-sm font-bold flex-shrink-0 ${winHome ? 'text-grass-500' : 'text-ink/50'}`}>{hs}</span>
        )}
      </div>

      <div className="border-t border-ink/15" />

      {/* Away team row */}
      <div className="flex items-center justify-between gap-2">
        <TeamCell team={awayTeam} winner={winAway} loser={winHome} />
        {!awayTeam && (
          <span className="text-xs text-ink/40 flex-shrink-0">{slotLabel(awaySlot ?? { type:'runner', group:'?' })}</span>
        )}
        {finished && as != null && (
          <span className={`text-sm font-bold flex-shrink-0 ${winAway ? 'text-grass-500' : 'text-ink/50'}`}>{as}</span>
        )}
      </div>

      {finished && winHome === false && winAway === false && hs != null && (
        <p className="text-xs text-center text-ink/60 italic">{t('bracket.overtime')}</p>
      )}
    </div>
  )
}

// ─── KNOCKOUT ROUND SECTION ───────────────────────────────────────────────────

function KnockoutRound({ roundKey, r32Matches, knockoutSlots, dbMatchesByBracketId }) {
  const { t } = useLang()
  const ROUND_INFO = buildRoundInfo(t)
  const info    = ROUND_INFO[roundKey]
  const matchIds = ROUND_MATCH_IDS[roundKey]

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink/70 uppercase tracking-wider mb-3">
        <span>{info.icon}</span>
        <span>{info.label}</span>
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {matchIds.map(id => {
          // Resolve home/away team names
          let homeTeam = null
          let awayTeam = null
          let homeSlot = null
          let awaySlot = null

          if (roundKey === 'round_of_32') {
            const tpl = r32Matches.find(m => m.id === id)
            homeTeam = tpl?.homeTeam ?? null
            awayTeam = tpl?.awayTeam ?? null
            homeSlot = tpl?.homeSlot
            awaySlot = tpl?.awaySlot
          } else {
            homeTeam = knockoutSlots[id]?.home ?? null
            awayTeam = knockoutSlots[id]?.away ?? null
          }

          return (
            <KnockoutMatchCard
              key={id}
              matchId={id}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              homeSlot={homeSlot}
              awaySlot={awaySlot}
              dbMatch={dbMatchesByBracketId[id] ?? null}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function Bracket() {
  const { t } = useLang()
  // useId() es estable entre renders pero único por instancia: evita
  // que dos pestañas Bracket abiertas en el mismo navegador colisionen
  // sobre el canal 'bracket-matches' (que era un nombre global fijo).
  const channelId    = useId()
  const [allMatches, setAllMatches] = useState(() => getMatchCache() ?? [])
  const [loading,    setLoading]    = useState(() => !getMatchCache())
  const [activeTab,  setActiveTab]  = useState('grupos')

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Only show the spinner if we have absolutely nothing to render.
      // When the page remounts after a tab switch we already have matches in
      // state from the cache — refresh in the background instead.
      if (allMatches.length === 0 && !getMatchCache()) setLoading(true)
      try {
        const hit = getMatchCache()
        const { data } = hit
          ? await Promise.resolve({ data: hit })
          : await sq(supabase.from('matches').select('*').order('match_date'))
        if (!cancelled && data) {
          setMatchCache(data)
          setAllMatches(data)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    // Real-time subscription: re-derive bracket whenever any match changes.
    // Nombre estable por instancia (useId) — no global — para que dos
    // pestañas no compitan por el mismo canal.
    const channel = supabase
      .channel(`bracket-matches-${channelId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => {
        if (!cancelled) load()
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Pure bracket derivation (recalculated on every render, no cache needed) ──
  // standings = raw partial results (used for group tables)
  // resolvedStandings = only groups where ALL matches are finished (used for bracket/thirds)
  const standings         = useMemo(() => computeAllStandings(allMatches), [allMatches])
  const resolvedStandings = useMemo(() => filterCompleteGroups(standings, allMatches), [standings, allMatches])
  const qualifiers        = useMemo(() => getQualifiers(resolvedStandings), [resolvedStandings])
  const r32Matches        = useMemo(() => buildRoundOf32(resolvedStandings), [resolvedStandings])

  // Advance knockout rounds based on finished DB matches
  const knockoutSlots = useMemo(() => {
    const finishedKO = allMatches
      .filter(m => m.stage !== 'group' && m.home_score != null && m.away_score != null)
      .map(m => ({
        ...m,
        // Map DB match to bracket ID via external_id or bracket_match_id field (future)
        // For now we rely on the bracket_match_id column if present, else skip
        id: m.bracket_match_id ?? null,
      }))
      .filter(m => m.id)

    return advanceKnockoutRound(finishedKO)
  }, [allMatches])

  // Build a quick lookup: bracketMatchId → DB match row (for scores)
  const dbMatchesByBracketId = useMemo(() => {
    const map = {}
    for (const m of allMatches) {
      if (m.bracket_match_id) map[m.bracket_match_id] = m
    }
    return map
  }, [allMatches])

  // Count of qualifying thirds per group (for highlighting)
  const qualifyingThirdTeams = useMemo(
    () => new Set(qualifiers.thirds.map(third => third.team)),
    [qualifiers.thirds]
  )

  const groupsComplete = useMemo(
    () => GROUPS.filter(g => standings[g]?.every(s => s.played === 3)).length,
    [standings]
  )

  if (loading) {
    return <div className="flex justify-center items-center py-20"><Spinner size="lg" /></div>
  }

  const tabs = [
    { key: 'grupos',   label: t('bracket.tabGroups'), icon: '⚽' },
    { key: 'terceros', label: t('bracket.tabThirds'), icon: '🥉' },
    { key: 'bracket',  label: t('bracket.tabElim'),   icon: '🏆' },
  ]

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div>
        <span className="ed-mono text-terracotta text-[10px] block mb-1.5">// {t('bracket.chapter')}</span>
            <h2 className="font-display text-xl sm:text-2xl text-ink leading-none">{t('bracket.title')}</h2>
        <p className="font-serif italic text-ink/70 text-sm mt-1">
          {t('bracket.subtitle', { n: groupsComplete })}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-none text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-ink text-cream'
                : 'bg-paper text-ink/60 hover:text-ink'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB: GRUPOS ──────────────────────────────────────────────────── */}
      {activeTab === 'grupos' && (
        <div className="space-y-6">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-ink/60 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 inline-block" />
              {t('bracket.legendDirect')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-paper-200 border border-ink/30 inline-block" />
              {t('bracket.legendThird')}
            </span>
          </div>

          {/* Group grids: 2 cols on mobile, 3 on md, 4 on lg */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {GROUPS.map(g => (
              <GroupTable
                key={g}
                group={g}
                standings={standings[g] ?? []}
                qualifyingThirds={qualifyingThirdTeams}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: TERCEROS ────────────────────────────────────────────────── */}
      {activeTab === 'terceros' && (
        <div className="max-w-xl">
          <ThirdPlaceRanking
            thirds={qualifiers.thirds}
            totalGroupsComplete={groupsComplete}
          />

          <div className="mt-4 card p-4 text-xs text-ink/60 space-y-1">
            <p className="font-semibold text-ink/70">{t('bracket.tiebreakerTitle')}</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>{t('bracket.tb1')}</li>
              <li>{t('bracket.tb2')}</li>
              <li>{t('bracket.tb3')}</li>
              <li>{t('bracket.tb4')}</li>
              <li>{t('bracket.tb5')}</li>
            </ol>
            <p className="text-ink/50 mt-2">
              {t('bracket.thirdsNote')}
            </p>
          </div>
        </div>
      )}

      {/* ── TAB: BRACKET (eliminatoria) ───────────────────────────────────── */}
      {activeTab === 'bracket' && (
        <div className="space-y-8">
          {ROUND_ORDER.map(round => (
            <KnockoutRound
              key={round}
              roundKey={round}
              r32Matches={r32Matches}
              knockoutSlots={knockoutSlots}
              dbMatchesByBracketId={dbMatchesByBracketId}
            />
          ))}

          <div className="card p-4 text-xs text-ink/50 space-y-1">
            <p className="font-semibold text-ink/60">{t('bracket.bracketAssignTitle')}</p>
            <p>
              {t('bracket.bracketAssignBody')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
