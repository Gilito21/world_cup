// Matches change at most once per hour (GitHub Actions cron). 30 min is plenty
// and avoids re-fetching every time a page remounts after a brief tab switch.
const TTL = 30 * 60 * 1000 // 30 minutes

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
