// Generic in-memory cache for arbitrary keys. Used to avoid re-fetching the
// same Supabase data every time a page remounts (e.g. when navigating between
// tabs of the SPA, or coming back from a backgrounded browser tab).

const DEFAULT_TTL = 10 * 60 * 1000 // 10 minutes

const store = new Map() // key → { value, expiresAt }

export function getCache(key, ttl = DEFAULT_TTL) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  // Refresh expiry on access so frequently-used data stays warm
  entry.expiresAt = Date.now() + ttl
  return entry.value
}

export function setCache(key, value, ttl = DEFAULT_TTL) {
  store.set(key, { value, expiresAt: Date.now() + ttl })
}

export function invalidateCache(prefix) {
  if (!prefix) { store.clear(); return }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}
