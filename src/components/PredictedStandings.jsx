import { useMemo, useState } from 'react'
import { useLang } from '../contexts/LangContext'
import { useChromeHidden } from '../lib/scrollChrome'
import { GroupTable, ThirdPlaceRanking } from './GroupStandings'
import { GROUPS, computeAllStandings, getQualifiers } from '../utils/tournament'

// Floating button on /pronosticos that opens a live, predicted group-stage
// table. It recomputes standings from the user's own picks (saved predictions
// overridden by in-progress drafts) so they can see how each group would end
// up — who qualifies — as they fill the bracket in.
export default function PredictedStandings({ matches, predictions, drafts }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const minimized = useChromeHidden()

  const { standings, qualifyingThirds, thirds, groupsComplete } = useMemo(() => {
    const groupMatches = matches.filter(m => m.stage === 'group')

    // Effective score per match: saved prediction, overridden by a live draft.
    const predMap = {}
    for (const [id, p] of Object.entries(predictions)) {
      predMap[id] = { home: p.home_score, away: p.away_score }
    }
    for (const [id, d] of Object.entries(drafts)) {
      if (d && d.home !== '' && d.away !== '') predMap[id] = { home: Number(d.home), away: Number(d.away) }
    }

    const synthetic = groupMatches.map(m => {
      const pr = predMap[m.id]
      return { ...m, home_score: pr ? pr.home : null, away_score: pr ? pr.away : null }
    })
    const standings = computeAllStandings(synthetic)

    // Only feed the thirds ranking (and the 3rd-row highlight) from groups the
    // user has fully predicted — same idea as the live bracket, which only
    // resolves thirds from groups whose matches are all finished.
    const total = {}, filled = {}
    for (const m of groupMatches) {
      const g = m.group_name
      if (!g) continue
      total[g] = (total[g] ?? 0) + 1
      if (predMap[m.id]) filled[g] = (filled[g] ?? 0) + 1
    }
    const resolved = Object.fromEntries(
      Object.entries(standings).map(([g, s]) =>
        [g, total[g] > 0 && total[g] === (filled[g] ?? 0) ? s : []]
      )
    )
    const qualifiers = getQualifiers(resolved)
    return {
      standings,
      qualifyingThirds: new Set(qualifiers.thirds.map(x => x.team)),
      thirds: qualifiers.thirds,
      groupsComplete: GROUPS.filter(g => resolved[g]?.length > 0).length,
    }
  }, [matches, predictions, drafts])

  return (
    <>
      {/* Floating button — sits above the report button (bottom-right). */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-32 sm:bottom-16 right-3 sm:right-4 z-40 flex items-center rounded-full bg-ink text-cream shadow-lg hover:bg-terracotta transition-all duration-300 text-xs font-bold py-2.5 ${
          minimized ? 'gap-0 px-2.5' : 'gap-1.5 px-3.5'
        } sm:gap-1.5 sm:px-3.5`}
        aria-label={t('pronosticos.standingsFab')}
      >
        <span className="text-sm leading-none" aria-hidden="true">📊</span>
        <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
          minimized ? 'max-w-0 opacity-0' : 'max-w-[8rem] opacity-100'
        } sm:max-w-[8rem] sm:opacity-100`}>{t('pronosticos.standingsFab')}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-3 pb-3 sm:pb-0 bg-ink/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-paper rounded-none shadow-2xl shadow-ink/15 border border-ink/20 overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink/15 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="font-semibold text-ink text-base">{t('pronosticos.standingsTitle')}</h2>
                <p className="text-ink/50 text-xs mt-0.5">
                  {t('pronosticos.standingsSubtitle')} · {t('pronosticos.standingsComplete', { n: groupsComplete })}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-ink/50 hover:text-ink/80 w-10 h-10 flex items-center justify-center hover:bg-paper active:bg-paper-200 transition-colors text-sm -mr-2 flex-shrink-0"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {GROUPS.map(g => (
                  <GroupTable
                    key={g}
                    group={g}
                    standings={standings[g] ?? []}
                    qualifyingThirds={qualifyingThirds}
                  />
                ))}
              </div>
              <ThirdPlaceRanking thirds={thirds} totalGroupsComplete={groupsComplete} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
