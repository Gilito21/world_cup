import { getTriggerInfo } from '../utils/prizeRules'

export default function PrizePotCard({ activeLeague, memberCount }) {
  const entryFee   = activeLeague?.entry_fee
  const prizeRules = Array.isArray(activeLeague?.prize_rules) ? activeLeague.prize_rules : []

  if (!entryFee && prizeRules.length === 0) return null

  const totalPot = entryFee && memberCount > 0 ? entryFee * memberCount : null
  const totalPct = prizeRules.reduce((s, r) => s + (Number(r.pct) || 0), 0)

  return (
    <div className="card p-4 sm:p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">💰</span>
          <h3 className="font-bold text-ink text-sm sm:text-base">Bote de la liga</h3>
        </div>
        {totalPot != null ? (
          <div className="text-right flex-shrink-0">
            <p className="font-black text-ink text-lg sm:text-2xl">€{totalPot % 1 === 0 ? totalPot : totalPot.toFixed(2)}</p>
            <p className="text-[10px] text-ink/50">{memberCount} × €{entryFee}/persona</p>
          </div>
        ) : entryFee ? (
          <p className="text-sm font-semibold text-ink/60 flex-shrink-0">€{entryFee}<span className="text-xs font-normal">/persona</span></p>
        ) : null}
      </div>

      {prizeRules.length > 0 && (
        <div className="space-y-1.5 pt-3 border-t border-ink/15">
          {prizeRules.map((rule, i) => {
            const info   = getTriggerInfo(rule.trigger)
            const amount = totalPot ? Math.round(totalPot * Number(rule.pct) / 100) : null
            return (
              <div key={rule.id ?? i} className="flex items-center gap-2.5">
                <span className="text-base w-6 text-center flex-shrink-0 leading-none">{info.emoji}</span>
                <span className="text-sm text-ink flex-1 truncate">{rule.label}</span>
                <span className="text-xs font-bold text-ink/60 tabular-nums flex-shrink-0">{rule.pct}%</span>
                {amount != null && (
                  <span className="text-xs font-bold text-ink tabular-nums flex-shrink-0 w-14 text-right">€{amount}</span>
                )}
              </div>
            )
          })}
          {totalPot != null && totalPct > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-ink/10 text-[11px] text-ink/50">
              <span>{totalPct}% del bote</span>
              <span>€{Math.round(totalPot * totalPct / 100)} de €{totalPot}</span>
            </div>
          )}
        </div>
      )}
      {prizeRules.length === 0 && entryFee && (
        <p className="text-xs text-ink/40 mt-1">Las reglas de reparto aún no están configuradas</p>
      )}
    </div>
  )
}
