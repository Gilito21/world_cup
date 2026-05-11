// Genera los iconos de la PWA (manifest + apple-touch) a partir de un SVG inline.
// Ejecuta con: node scripts/generate-pwa-icons.js
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = resolve(__dirname, '..', 'public')
mkdirSync(PUBLIC_DIR, { recursive: true })

// SVG de marca (any-purpose): pelota sobre fondo ámbar redondeado.
const svgAny = ({ size = 512 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <radialGradient id="ball" cx="0.35" cy="0.30" r="0.85">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="70%" stop-color="#f5f5f4"/>
      <stop offset="100%" stop-color="#a8a29e"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="96" ry="96" fill="url(#bg)"/>
  <g transform="translate(256,256)">
    <circle r="170" fill="url(#ball)"/>
    <circle r="170" fill="none" stroke="#1c1917" stroke-width="6" opacity="0.9"/>
    <polygon points="0,-58 55,-18 34,46 -34,46 -55,-18" fill="#1c1917"/>
    <polygon points="0,-150 49,-115 30,-62 -30,-62 -49,-115" fill="#1c1917" opacity="0.85"/>
    <polygon points="92,-58 150,-30 138,30 92,42 60,-16" fill="#1c1917" opacity="0.85"/>
    <polygon points="-92,-58 -60,-16 -92,42 -138,30 -150,-30" fill="#1c1917" opacity="0.85"/>
    <polygon points="60,72 92,42 138,80 110,140 50,128" fill="#1c1917" opacity="0.85"/>
    <polygon points="-60,72 -50,128 -110,140 -138,80 -92,42" fill="#1c1917" opacity="0.85"/>
  </g>
</svg>`.trim()

// Versión "maskable": el icono completo dentro del 80 % central (safe zone),
// con el fondo de marca llenando todo el lienzo (sin esquinas redondeadas,
// el launcher se encarga de la forma).
const svgMaskable = ({ size = 512 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <radialGradient id="ball2" cx="0.35" cy="0.30" r="0.85">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="70%" stop-color="#f5f5f4"/>
      <stop offset="100%" stop-color="#a8a29e"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg2)"/>
  <g transform="translate(256,256) scale(0.78)">
    <circle r="170" fill="url(#ball2)"/>
    <circle r="170" fill="none" stroke="#1c1917" stroke-width="6" opacity="0.9"/>
    <polygon points="0,-58 55,-18 34,46 -34,46 -55,-18" fill="#1c1917"/>
    <polygon points="0,-150 49,-115 30,-62 -30,-62 -49,-115" fill="#1c1917" opacity="0.85"/>
    <polygon points="92,-58 150,-30 138,30 92,42 60,-16" fill="#1c1917" opacity="0.85"/>
    <polygon points="-92,-58 -60,-16 -92,42 -138,30 -150,-30" fill="#1c1917" opacity="0.85"/>
    <polygon points="60,72 92,42 138,80 110,140 50,128" fill="#1c1917" opacity="0.85"/>
    <polygon points="-60,72 -50,128 -110,140 -138,80 -92,42" fill="#1c1917" opacity="0.85"/>
  </g>
</svg>`.trim()

// SVG monocromo para favicon (apto para data-uri).
const svgFavicon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#f59e0b"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="44">⚽</text>
</svg>`.trim()

const targets = [
  { name: 'pwa-192x192.png',  size: 192, svg: svgAny },
  { name: 'pwa-512x512.png',  size: 512, svg: svgAny },
  { name: 'maskable-512.png', size: 512, svg: svgMaskable },
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

// Favicon SVG (se sirve directamente).
writeFileSync(resolve(PUBLIC_DIR, 'favicon.svg'), svgFavicon)
out.push('  ✓ public/favicon.svg')

console.log('PWA icons generated:\n' + out.join('\n'))
