import { useEffect, useState, useMemo } from 'react'
import { supabase, sq } from '../lib/supabase'
import { getMatchCache, setMatchCache } from '../lib/matchCache'
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

const ROUND_INFO = {
  round_of_32:   { label:'Ronda de 32',        short:'R32',    icon:'🎽' },
  round_of_16:   { label:'Octavos de final',   short:'Octavos',icon:'🎯' },
  quarter_final: { label:'Cuartos de final',   short:'Cuartos',icon:'⚔️' },
  semi_final:    { label:'Semifinales',         short:'Semis',  icon:'⭐' },
  third_place:   { label:'Tercer puesto',       short:'3er',    icon:'🥉' },
  final:         { label:'Gran Final',          short:'Final',  icon:'🏆' },
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
  const base = 'flex items-center gap-2 min-w-0'
  const color = winner ? 'text-stone-900 font-semibold'
              : loser  ? 'text-stone-400'
              :           'text-stone-700'
  return (
    <div className={`${base} ${color}`}>
      {team
        ? <><Flag team={team} /><span className="truncate text-sm">{teamName(team)}</span></>
        : <span className="truncate text-sm text-stone-300 italic">Por determinar</span>
      }
    </div>
  )
}

function ScoreBadge({ home, away, bold }) {
  if (home == null || away == null) return null
  const winH = home > away
  const winA = away > home
  return (
    <div className="flex items-center gap-1 bg-stone-100 rounded-lg px-2.5 py-1 flex-shrink-0">
      <span className={`text-sm font-mono ${winH && bold ? 'text-amber-500 font-bold' : 'text-stone-600'}`}>{home}</span>
      <span className="text-stone-400 text-xs">-</span>
      <span className={`text-sm font-mono ${winA && bold ? 'text-amber-500 font-bold' : 'text-stone-600'}`}>{away}</span>
    </div>
  )
}

// ─── GROUP STANDING TABLE ─────────────────────────────────────────────────────

function GroupTable({ group, standings, qualifyingThirds }) {
  const thirdQualifies = standings[2] && qualifyingThirds.has(standings[2]?.team)

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center text-xs font-bold text-amber-500">
          {group}
        </span>
        <span className="text-sm font-semibold text-stone-700">Grupo {group}</span>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-stone-400 border-b border-stone-100">
            <th className="text-left px-3 py-2 font-medium">Equipo</th>
            <th className="text-center px-1 py-2 font-medium" title="Partidos jugados">PJ</th>
            <th className="text-center px-1 py-2 font-medium" title="Ganados">G</th>
            <th className="text-center px-1 py-2 font-medium" title="Empatados">E</th>
            <th className="text-center px-1 py-2 font-medium" title="Perdidos">P</th>
            <th className="text-center px-1 py-2 font-medium" title="Diferencia de goles">DG</th>
            <th className="text-center px-1 py-2 font-medium" title="Puntos">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const qualifies = i < 2
            const thirdQ    = i === 2 && thirdQualifies

            return (
              <tr
                key={s.team}
                className={`border-b border-stone-50 last:border-0 transition-colors ${
                  qualifies ? 'bg-green-50/60'
                  : thirdQ  ? 'bg-amber-50/60'
                  :           ''
                }`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold w-4 ${
                      qualifies ? 'text-green-500' : thirdQ ? 'text-amber-500' : 'text-stone-300'
                    }`}>
                      {i + 1}
                    </span>
                    <Flag team={s.team} />
                    <span className="font-medium text-stone-800 truncate">{teamName(s.team)}</span>
                  </div>
                </td>
                <td className="text-center px-1 py-2 text-stone-500">{s.played}</td>
                <td className="text-center px-1 py-2 text-stone-500">{s.won}</td>
                <td className="text-center px-1 py-2 text-stone-500">{s.drawn}</td>
                <td className="text-center px-1 py-2 text-stone-500">{s.lost}</td>
                <td className={`text-center px-1 py-2 font-medium ${
                  s.gd > 0 ? 'text-green-500' : s.gd < 0 ? 'text-red-400' : 'text-stone-400'
                }`}>
                  {s.gd > 0 ? `+${s.gd}` : s.gd}
                </td>
                <td className="text-center px-1 py-2 font-bold text-stone-800">{s.points}</td>
              </tr>
            )
          })}
          {standings.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-center text-stone-300 italic text-xs">
                Sin resultados aún
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
  const needed = THIRD_PLACE_QUALIFIERS

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🥉</span>
          <span className="text-sm font-semibold text-stone-700">Mejores terceros</span>
        </div>
        <span className="text-xs text-stone-400">{thirds.length} / {needed} clasificados</span>
      </div>

      <div className="divide-y divide-stone-50">
        {thirds.map((t, i) => (
          <div key={t.team} className="px-4 py-2.5 flex items-center gap-3">
            <span className={`text-xs font-bold w-5 text-center ${
              i < needed ? 'text-amber-500' : 'text-stone-300'
            }`}>{i + 1}</span>
            <Flag team={t.team} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-stone-800 truncate block">{teamName(t.team)}</span>
              <span className="text-xs text-stone-400">Grupo {t.group}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-500">
              <span className="font-bold text-stone-700">{t.points} pts</span>
              <span className={t.gd >= 0 ? 'text-green-500' : 'text-red-400'}>
                {t.gd > 0 ? `+${t.gd}` : t.gd} DG
              </span>
              <span>{t.gf} GF</span>
            </div>
          </div>
        ))}
        {thirds.length === 0 && (
          <p className="px-4 py-6 text-center text-stone-300 italic text-sm">
            Aún no hay resultados en fase de grupos.
          </p>
        )}
        {/* Placeholder rows for remaining spots */}
        {Array.from({ length: Math.max(0, needed - thirds.length) }).map((_, i) => (
          <div key={`tbd-${i}`} className="px-4 py-2.5 flex items-center gap-3 opacity-30">
            <span className="text-xs font-bold w-5 text-center text-stone-300">{thirds.length + i + 1}</span>
            <div className="w-7 h-5 bg-stone-100 rounded-sm flex-shrink-0" />
            <span className="text-sm text-stone-300 italic">Por determinar</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── KNOCKOUT MATCH CARD ─────────────────────────────────────────────────────

function KnockoutMatchCard({ matchId, homeTeam, awayTeam, dbMatch, homeSlot, awaySlot }) {
  const hs = dbMatch?.home_score ?? null
  const as = dbMatch?.away_score ?? null
  const finished = dbMatch?.status === 'finished'
  const winHome  = finished && hs != null && hs > as
  const winAway  = finished && as != null && as > hs

  return (
    <div className="card p-3 space-y-2">
      <p className="text-xs text-stone-400 font-medium">{matchLabel(matchId)}</p>

      {/* Home team row */}
      <div className="flex items-center justify-between gap-2">
        <TeamCell team={homeTeam} winner={winHome} loser={winAway} />
        {!homeTeam && (
          <span className="text-xs text-stone-300 flex-shrink-0">{slotLabel(homeSlot ?? { type:'winner', group:'?' })}</span>
        )}
        {finished && hs != null && (
          <span className={`text-sm font-bold flex-shrink-0 ${winHome ? 'text-amber-500' : 'text-stone-400'}`}>{hs}</span>
        )}
      </div>

      <div className="border-t border-stone-100" />

      {/* Away team row */}
      <div className="flex items-center justify-between gap-2">
        <TeamCell team={awayTeam} winner={winAway} loser={winHome} />
        {!awayTeam && (
          <span className="text-xs text-stone-300 flex-shrink-0">{slotLabel(awaySlot ?? { type:'runner', group:'?' })}</span>
        )}
        {finished && as != null && (
          <span className={`text-sm font-bold flex-shrink-0 ${winAway ? 'text-amber-500' : 'text-stone-400'}`}>{as}</span>
        )}
      </div>

      {finished && winHome === false && winAway === false && hs != null && (
        <p className="text-xs text-center text-amber-500">Prórroga / Penaltis</p>
      )}
    </div>
  )
}

// ─── KNOCKOUT ROUND SECTION ───────────────────────────────────────────────────

function KnockoutRound({ roundKey, r32Matches, knockoutSlots, dbMatchesByBracketId }) {
  const info    = ROUND_INFO[roundKey]
  const matchIds = ROUND_MATCH_IDS[roundKey]

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-600 uppercase tracking-wider mb-3">
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
    // Use a stable channel name so React StrictMode / fast remounts don't
    // accumulate orphan channels.
    const channel = supabase
      .channel('bracket-matches')
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
    () => new Set(qualifiers.thirds.map(t => t.team)),
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
    { key: 'grupos',    label: 'Grupos',      icon: '⚽' },
    { key: 'terceros',  label: 'Terceros',     icon: '🥉' },
    { key: 'bracket',   label: 'Eliminatoria', icon: '🏆' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-stone-900">Bracket Mundial 2026</h2>
        <p className="text-stone-400 text-sm mt-1">
          Clasificación en tiempo real · {groupsComplete} de 12 grupos completados
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === t.key
                ? 'bg-amber-500 text-stone-950'
                : 'bg-stone-100 text-stone-500 hover:text-stone-800'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB: GRUPOS ──────────────────────────────────────────────────── */}
      {activeTab === 'grupos' && (
        <div className="space-y-6">
          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-stone-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 inline-block" />
              Clasificado directo (1º / 2º)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-200 inline-block" />
              3er clasificado (si está en los 8 mejores)
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

          <div className="mt-4 card p-4 text-xs text-stone-500 space-y-1">
            <p className="font-semibold text-stone-600">Criterios de desempate (terceros)</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Puntos</li>
              <li>Diferencia de goles</li>
              <li>Goles a favor</li>
              <li>Juego limpio / rendimiento disciplinario</li>
              <li>Orden alfabético (desempate de pantalla)</li>
            </ol>
            <p className="text-stone-400 mt-2">
              Los 8 mejores terceros de los 12 grupos avanzan al Partido de Ronda de 32.
              El escenario de bracket depende de qué grupos produzcan equipos clasificados.
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

          <div className="card p-4 text-xs text-stone-400 space-y-1">
            <p className="font-semibold text-stone-500">Sobre la asignación de terceros al bracket</p>
            <p>
              El slot de cada equipo tercero en Ronda de 32 se determina mediante
              escenarios predefinidos según qué grupos produzcan los 8 mejores terceros.
              Un algoritmo de restricciones garantiza que ningún equipo se enfrente
              a un rival de su propio grupo en esta ronda.
            </p>
            <p>
              Los escenarios oficiales de FIFA WC 2026 reemplazarán la tabla
              <code className="bg-stone-100 px-1 rounded mx-1">BRACKET_SCENARIOS</code>
              en <code className="bg-stone-100 px-1 rounded">src/utils/tournament.js</code>
              cuando se publiquen.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
