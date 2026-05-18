// Editorial primitives shared across pages. Both are pure presentation —
// pages pass content as props, no data fetching here.
//
// `EditorialBand` is the thin mono strip used right under the page title
// to show the equivalent of the landing's "ISSUE N° · LOCATION · DATE"
// header. Pass an array of short uppercase strings; we draw `·` between
// them with thin hairlines top/bottom.
//
// `EditorialStats` is the landing's stats foot pattern: big Boldonse
// numbers with mono labels below, separated by hairline cell dividers.
// Pass `items` as `[{ label, value }, …]`. 2-column at mobile, up to
// 4-column on desktop.

export function EditorialBand({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="border-y border-ink/15 py-2 mt-3 mb-5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/60 flex flex-wrap items-center">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-2 text-ink/30">·</span>}
          {it}
        </span>
      ))}
    </div>
  )
}

export function EditorialStats({ items }) {
  if (!items || items.length === 0) return null
  const n = items.length
  // Mobile drops to 2 cols, ≥sm uses N columns up to 4.
  const cols = Math.min(n, 4)
  const smGrid = ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3', 'sm:grid-cols-4'][cols]
  return (
    <div className={`grid grid-cols-2 ${smGrid} border-y border-ink/20`}>
      {items.map((it, i) => {
        // Cell separators: left border on cols >0 within the same row;
        // top border on the second mobile row (i >= 2 when 4 items, 2 cols).
        const leftBorder = (i % cols !== 0) ? 'border-l border-ink/15' : ''
        const smLeft = (i % cols !== 0) ? 'sm:border-l sm:border-ink/15' : 'sm:border-l-0'
        const mobLeft = (i % 2 !== 0) ? 'border-l border-ink/15' : ''
        const mobTop  = (i >= 2 && n > 2) ? 'border-t border-ink/15 sm:border-t-0' : ''
        return (
          <div key={i} className={`p-3 sm:p-4 ${mobLeft} ${smLeft} ${mobTop}`}>
            <div className="font-display text-2xl sm:text-3xl text-ink leading-none tabular-nums">{it.value}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/60 mt-1.5">{it.label}</div>
          </div>
        )
      })}
    </div>
  )
}
