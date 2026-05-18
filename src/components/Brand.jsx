// The Porra de Empresas brand mark — direct port of logo-03.html (the
// design the user signed off on).
//
//   <BrandMark size={1.8} sub />   →   full hero version with "Atlas …" mono line
//   <BrandMark size={0.6} compact />  →  one-line nav: P●RRA + "de empresas" italic
//   <BrandTile size={32} onClick={...} />  →  the green favicon tile with a soccer ball,
//                                             used as the in-app refresh button.
//
// Tone variants (cream / ink / terracotta backgrounds) are picked up
// automatically when the consumer wraps the mark in `.on-dark` or
// `.on-terra`. See styles for `.pdm.on-dark` / `.pdm.on-terra` in
// index.css.

export function BrandMark({
  size = 1,
  compact = false,
  sub = false,
  tone = 'default', // 'default' | 'dark' | 'terra' — applies the corresponding stage class
  className = '',
}) {
  const classes = [
    'pdm',
    compact && 'compact',
    tone === 'dark' && 'on-dark-self',
    tone === 'terra' && 'on-terra-self',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} style={{ '--logo-size': size }}>
      <span className="row">
        <span className="word">P<span className="ball" aria-hidden="true" />RRA</span>
      </span>
      <span className="ital">de empresas</span>
      {sub && (
        <span className="sub">
          <span>{sub.left ?? 'Atlas Mundial'}</span>
          <span className="star">★</span>
          <span>{sub.right ?? 'Edición ’26'}</span>
        </span>
      )}
    </span>
  )
}

export function BrandTile({
  size = 32,
  onClick,
  ariaLabel = 'Porra Mundial 2026',
  spinning = false,
  className = '',
  as: As = onClick ? 'button' : 'span',
}) {
  const ballSize = Math.round(size * 0.56)
  return (
    <As
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick ? ariaLabel : undefined}
      className={`brand-tile ${spinning ? 'brand-tile-spin' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="brand-tile-ball"
        style={{ width: ballSize, height: ballSize }}
        aria-hidden="true"
      />
    </As>
  )
}
