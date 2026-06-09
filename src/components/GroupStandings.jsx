import { useLang } from '../contexts/LangContext'
import { Flag, teamName } from '../utils/teams'
import { THIRD_PLACE_QUALIFIERS } from '../utils/tournament'

// Single group standings table. Top-2 highlighted as qualifiers; the 3rd row
// is highlighted when that group's third-placed team is among the qualifying
// best thirds (passed in via `qualifyingThirds`).
export function GroupTable({ group, standings, qualifyingThirds }) {
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

// Ranking of the best third-placed teams (top THIRD_PLACE_QUALIFIERS advance).
export function ThirdPlaceRanking({ thirds, totalGroupsComplete }) {
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
