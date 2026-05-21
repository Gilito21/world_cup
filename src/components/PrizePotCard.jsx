import { useState } from 'react'
import { getTriggerInfo } from '../utils/prizeRules'

export default function PrizePotCard({ activeLeague, memberCount, prizeResults = [] }) {
  const [open, setOpen] = useState(false)

  const entryFee   = activeLeague?.entry_fee
  const prizeRules = Array.isArray(activeLeague?.prize_rules) ? activeLeague.prize_rules : []

  if (!entryFee && prizeRules.length === 0) return null

  const totalPot = entryFee && memberCount > 0 ? entryFee * memberCount : null
  const totalPct = prizeRules.reduce((s, r) => s + (Number(r.pct) || 0), 0)
  const resultByRule = Object.fromEntries(prizeResults.map(r => [r.rule_id, r]))

  const fmtEur = n => n % 1 === 0 ? `€${n}` : `€${n.toFixed(2)}`

  return (
    <div className="card overflow-hidden">
      {/* Header — siempre visible, clic para expandir */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 sm:px-5 text-left"
      >
        <span className="text-base flex-shrink-0">💰</span>
        <span className="font-semibold text-ink text-sm flex-1">Bote de la liga</span>
        {totalPot != null && (
          <span className="font-black text-ink text-base tabular-nums flex-shrink-0">{fmtEur(totalPot)}</span>
        )}
        {!totalPot && entryFee && (
          <span className="text-sm font-semibold text-ink/60 flex-shrink-0">{fmtEur(entryFee)}/persona</span>
        )}
        <span
          className={`text-ink/40 text-xs flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >▼</span>
      </button>

      {/* Cuerpo expandible */}
      {open && (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5 border-t border-ink/10 pt-3 space-y-2">
          {totalPot != null && (
            <p className="text-[11px] text-ink/40 -mt-1">{memberCount} personas × {fmtEur(entryFee)}/persona</p>
          )}

          {prizeRules.length > 0 ? (
            <>
              {prizeRules.map((rule, i) => {
                const info   = getTriggerInfo(rule.trigger)
                const amount = totalPot ? Math.round(totalPot * Number(rule.pct) / 100) : null
                const result = resultByRule[rule.id]
                return (
                  <div key={rule.id ?? i} className="flex items-start gap-2.5">
                    <span className="text-sm w-5 text-center flex-shrink-0 leading-none mt-0.5">{info.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-ink">{rule.label}</span>
                      {result?.winner_username && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[11px] font-semibold text-emerald-700">→ {result.winner_username}</span>
                          {result.locked && <span className="text-[10px] text-ink/30">🔒</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-xs font-bold text-ink/50 tabular-nums">{rule.pct}%</span>
                      {amount != null && (
                        <p className="text-xs font-bold text-ink tabular-nums">{fmtEur(amount)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
              {totalPot != null && totalPct > 0 && (
                <div className="flex justify-between pt-2 border-t border-ink/10 text-[11px] text-ink/40">
                  <span>{totalPct}% del bote</span>
                  <span>{fmtEur(Math.round(totalPot * totalPct / 100))} de {fmtEur(totalPot)}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-ink/40">Las reglas de reparto aún no están configuradas</p>
          )}
        </div>
      )}
    </div>
  )
}
