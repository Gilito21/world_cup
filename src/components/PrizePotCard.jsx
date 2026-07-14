import { useState } from 'react'
import { getTriggerInfo } from '../utils/prizeRules'

export default function PrizePotCard({ activeLeague, memberCount, prizeResults = [] }) {
  const [open, setOpen] = useState(false)

  const entryFee   = activeLeague?.entry_fee
  const prizeRules = Array.isArray(activeLeague?.prize_rules) ? activeLeague.prize_rules : []

  if (!entryFee && prizeRules.length === 0) return null

  const totalPot     = entryFee && memberCount > 0 ? entryFee * memberCount : null
  const totalPct     = prizeRules.reduce((s, r) => s + (Number(r.pct) || 0), 0)
  const resultByRule = Object.fromEntries(prizeResults.map(r => [r.rule_id, r]))
  const fmtEur       = n => n % 1 === 0 ? `€${n}` : `€${n.toFixed(2)}`

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Pill */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-ink/20 bg-paper text-xs font-semibold text-ink/70 hover:border-ink/40 hover:text-ink transition-colors"
      >
        <span>💰</span>
        {totalPot != null
          ? <span>{fmtEur(totalPot)}</span>
          : <span>Bote</span>
        }
        <span className={`text-[9px] text-ink/30 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 card shadow-xl z-20 p-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-ink/50 uppercase tracking-wide">Bote de la liga</span>
            {totalPot != null && (
              <span className="font-black text-ink text-base tabular-nums">{fmtEur(totalPot)}</span>
            )}
          </div>
          {totalPot != null && (
            <p className="text-[11px] text-ink/40 -mt-1">{memberCount} personas × {fmtEur(entryFee)}/persona</p>
          )}

          {prizeRules.length > 0 ? (
            <div className="space-y-2 pt-2 border-t border-ink/10">
              {prizeRules.map((rule, i) => {
                const info    = getTriggerInfo(rule.trigger)
                const amount  = totalPot ? Math.round(totalPot * Number(rule.pct) / 100) : null
                const result  = resultByRule[rule.id]
                const winners = result?.winner_usernames ?? []
                // Empate real: el importe se reparte a partes iguales.
                const perWinner = amount != null && winners.length > 1
                  ? amount / winners.length
                  : amount
                return (
                  <div key={rule.id ?? i} className="flex items-start gap-2">
                    <span className="text-sm w-5 text-center flex-shrink-0 leading-none mt-0.5">{info.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-ink">{rule.label}</span>
                      {winners.length > 0 && (
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="text-[11px] font-semibold text-emerald-700">
                            → {winners.join(', ')}
                          </span>
                          {winners.length > 1 && (
                            <span className="text-[10px] text-ink/40">(a medias)</span>
                          )}
                          {result.locked && <span className="text-[10px] text-ink/30">🔒</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-[11px] font-bold text-ink/50 tabular-nums">{rule.pct}%</span>
                      {amount != null && (
                        <p className="text-xs font-bold text-ink tabular-nums">{fmtEur(amount)}</p>
                      )}
                      {perWinner != null && winners.length > 1 && (
                        <p className="text-[10px] text-ink/40 tabular-nums">{fmtEur(perWinner)} c/u</p>
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
            </div>
          ) : (
            <p className="text-xs text-ink/40 pt-2 border-t border-ink/10">Las reglas de reparto aún no están configuradas</p>
          )}
        </div>
      )}
    </div>
  )
}
