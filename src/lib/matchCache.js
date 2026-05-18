// Matches change at most once per hour (GitHub Actions cron). 30 min is plenty
// and avoids re-fetching every time a page remounts after a brief tab switch.
//
// CONTRATO: el array cacheado SIEMPRE se almacena en orden ascendente
// por match_date. Esto era una asunción implícita de Pronosticos/Bracket
// pero Resultados rellenaba el cache con orden descendente, lo que rompía:
//   - el cálculo de cutoffTime en Pronosticos (cogía el último grupo en
//     vez del primero → contador de "40 días" en vez de 25)
//   - el orden de render del listado de partidos
// Normalizamos en el setter para que el cache sea canónico sin importar
// cómo lo pidió cada consumidor.
const TTL = 30 * 60 * 1000 // 30 minutes

let cached = null
let cachedAt = 0

export function getMatchCache() {
  if (cached && Date.now() - cachedAt < TTL) return cached
  return null
}

export function setMatchCache(matches) {
  if (!Array.isArray(matches)) { cached = matches; cachedAt = Date.now(); return }
  // slice() para no mutar el array que pasó el caller.
  cached   = matches.slice().sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
  cachedAt = Date.now()
}
