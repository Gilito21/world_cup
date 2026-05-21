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
//
// localStorage persistence: el in-memory cache se pierde en cada refresh,
// así que persistimos también en localStorage (misma TTL de 30min). De esta
// forma en un refresh los 104 partidos aparecen al instante sin query de red.
const TTL = 30 * 60 * 1000 // 30 minutes
const LS_KEY = 'porra-matches-cache'

let cached = null
let cachedAt = 0

export function getMatchCache() {
  if (cached && Date.now() - cachedAt < TTL) return cached
  // In-memory miss (e.g. page refresh) — try localStorage
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const { data, at } = JSON.parse(raw)
      if (data && Date.now() - at < TTL) {
        cached = data
        cachedAt = at
        return cached
      }
    }
  } catch {}
  return null
}

export function setMatchCache(matches) {
  if (!Array.isArray(matches)) {
    cached = matches
    cachedAt = 0
    try { localStorage.removeItem(LS_KEY) } catch {}
    return
  }
  // slice() para no mutar el array que pasó el caller.
  cached   = matches.slice().sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
  cachedAt = Date.now()
  try { localStorage.setItem(LS_KEY, JSON.stringify({ data: cached, at: cachedAt })) } catch {}
}
