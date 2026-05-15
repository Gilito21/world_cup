// Genera los iconos de la PWA (manifest + apple-touch + favicon SVG) a partir
// del mismo dibujo: un balón flat sobre fondo navy con detalle dorado.
// Ejecuta con: node scripts/generate-pwa-icons.js
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = resolve(__dirname, '..', 'public')
mkdirSync(PUBLIC_DIR, { recursive: true })

// ── Brand palette ────────────────────────────────────────────────────────
const BG_NAVY_TOP    = '#0f1e3d'
const BG_NAVY_BOTTOM = '#0a1428'
const AMBER          = '#f59e0b'
const SEAM           = '#0f1e3d'

// Centered ball mark — used at the centre of any-purpose and maskable icons.
// Coordinates are relative to a viewBox where the ball center is (0,0) and
// the ball radius is 170.
const ball = (radius = 170) => `
  <circle r="${radius}" fill="url(#ballHi)"/>
  <circle r="${radius}" fill="url(#ballSh)"/>
  <polygon points="0,-58 55,-18 34,46 -34,46 -55,-18" fill="${SEAM}"/>
  <g stroke="${SEAM}" stroke-width="11" stroke-linecap="round" fill="none">
    <line x1="0"   y1="-58" x2="0"   y2="-150"/>
    <line x1="55"  y1="-18" x2="142" y2="-46"/>
    <line x1="34"  y1="46"  x2="88"  y2="130"/>
    <line x1="-34" y1="46"  x2="-88" y2="130"/>
    <line x1="-55" y1="-18" x2="-142" y2="-46"/>
  </g>
  <g fill="${SEAM}">
    <polygon points="0,-150 17,-156 23,-138 -23,-138 -17,-156"/>
    <polygon points="142,-46 156,-38 146,-20 122,-30 130,-46"/>
    <polygon points="88,130 80,142 60,128 75,114 95,118"/>
    <polygon points="-88,130 -80,142 -60,128 -75,114 -95,118"/>
    <polygon points="-142,-46 -156,-38 -146,-20 -122,-30 -130,-46"/>
  </g>
`

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="${BG_NAVY_TOP}"/>
      <stop offset="100%" stop-color="${BG_NAVY_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="ballHi" cx="35%" cy="30%" r="75%">
      <stop offset="0%"  stop-color="#ffffff"/>
      <stop offset="60%" stop-color="#f5f5f4"/>
      <stop offset="100%" stop-color="#d6d3d1"/>
    </radialGradient>
    <radialGradient id="ballSh" cx="65%" cy="80%" r="65%">
      <stop offset="0%"  stop-color="#000000" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
`

// SVG de marca (any-purpose): balón centrado sobre fondo navy con esquinas
// redondeadas + halo ámbar.
const svgAny = ({ size = 512 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  ${defs}
  <rect width="512" height="512" rx="96" ry="96" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="200" fill="none" stroke="${AMBER}" stroke-width="3" opacity="0.4"/>
  <g transform="translate(256,256)">
    ${ball(170)}
  </g>
</svg>`.trim()

// Versión "maskable": balón completo dentro del 80% central (safe zone), con
// el fondo de marca llenando todo el lienzo (sin esquinas redondeadas, el
// launcher se encarga de la forma).
const svgMaskable = ({ size = 512 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  ${defs}
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256,256) scale(0.78)">
    ${ball(170)}
  </g>
</svg>`.trim()

// SVG para favicon (16x16 / 32x32). Más simplificado para legibilidad a
// tamaños muy pequeños — el detalle de los pentágonos exteriores se pierde
// bajo 24px, así que aquí solo dejamos el pentágono central y las costuras.
const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BG_NAVY_TOP}"/>
  <circle cx="32" cy="32" r="23" fill="none" stroke="${AMBER}" stroke-width="0.6" opacity="0.45"/>
  <circle cx="32" cy="32" r="20" fill="#fafafa"/>
  <polygon points="32,26 37.71,30.15 35.53,36.85 28.47,36.85 26.3,30.15" fill="${SEAM}"/>
  <g stroke="${SEAM}" stroke-width="1.8" stroke-linecap="round" fill="none">
    <line x1="32"    y1="26"    x2="32"    y2="12.5"/>
    <line x1="37.71" y1="30.15" x2="50.6"  y2="26"/>
    <line x1="35.53" y1="36.85" x2="43.4"  y2="47.6"/>
    <line x1="28.47" y1="36.85" x2="20.6"  y2="47.6"/>
    <line x1="26.3"  y1="30.15" x2="13.4"  y2="26"/>
  </g>
</svg>`

const targets = [
  { name: 'pwa-192x192.png',     size: 192, svg: svgAny },
  { name: 'pwa-512x512.png',     size: 512, svg: svgAny },
  { name: 'maskable-512.png',    size: 512, svg: svgMaskable },
  { name: 'apple-touch-icon.png', size: 180, svg: svgAny },
]

const out = []
for (const t of targets) {
  const svg = Buffer.from(t.svg({ size: t.size }))
  const file = resolve(PUBLIC_DIR, t.name)
  await sharp(svg, { density: 384 })
    .resize(t.size, t.size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(file)
  out.push(`  ✓ public/${t.name} (${t.size}×${t.size})`)
}

writeFileSync(resolve(PUBLIC_DIR, 'favicon.svg'), svgFavicon)
out.push('  ✓ public/favicon.svg')

console.log('PWA icons generated:\n' + out.join('\n'))
