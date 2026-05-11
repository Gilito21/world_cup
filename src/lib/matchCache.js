const TTL = 5 * 60 * 1000 // 5 minutes

let cached = null
let cachedAt = 0

export function getMatchCache() {
  if (cached && Date.now() - cachedAt < TTL) return cached
  return null
}

export function setMatchCache(matches) {
  cached = matches
  cachedAt = Date.now()
}
