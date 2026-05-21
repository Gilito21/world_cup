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
  if (cached && Date.now() - cachedAt < TTL) {
    console.log('[porra:matches] getMatchCache → in-memory hit', cached.length, 'matches')
    return cached
  }
  // In-memory miss (e.g. page refresh) — try localStorage
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const { data, at } = JSON.parse(raw)
      const ageMin = Math.round((Date.now() - at) / 60000)
      if (data && Date.now() - at < TTL) {
        console.log(`[porra:matches] getMatchCache → localStorage hit (${data.length} matches, ${ageMin}min old)`)
        cached = data
        cachedAt = at
        return cached
      }
      console.log(`[porra:matches] getMatchCache → localStorage EXPIRED (${ageMin}min old)`)
    } else {
      console.log('[porra:matches] getMatchCache → localStorage MISS (no data)')
    }
  } catch (e) {
    console.warn('[porra:matches] getMatchCache localStorage read error', e)
  }
  return null
}

export function setMatchCache(matches) {
  if (!Array.isArray(matches)) {
    console.log('[porra:matches] setMatchCache → CLEARED')
    cached = matches
    cachedAt = 0
    try { localStorage.removeItem(LS_KEY) } catch {}
    return
  }
  // slice() para no mutar el array que pasó el caller.
  cached   = matches.slice().sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
  cachedAt = Date.now()
  console.log('[porra:matches] setMatchCache → stored', cached.length, 'matches to memory + localStorage')
  try { localStorage.setItem(LS_KEY, JSON.stringify({ data: cached, at: cachedAt })) } catch {}
}
