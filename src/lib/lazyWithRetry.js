import { lazy } from 'react'

const RELOAD_FLAG = 'porra-chunk-reload-attempted'

// Wraps React.lazy with one-shot recovery for chunk-load failures.
//
// After a deploy the user's old service worker may keep serving an old
// index.html that references chunk filenames whose hashes no longer exist.
// React.lazy would then throw and Suspense would render its fallback (a
// full-page spinner) forever. This wrapper catches that case once: it
// flags sessionStorage and triggers a single window.location.reload() so
// the user picks up the freshly-deployed SW + chunks. A second back-to-back
// failure rejects the import — surfaces the error instead of looping.
export default function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      const mod = await importer()
      // Successful load: clear the recovery flag so future failures can
      // trigger one more reload.
      try { window.sessionStorage.removeItem(RELOAD_FLAG) } catch {}
      return mod
    } catch (err) {
      let alreadyTried = false
      try { alreadyTried = window.sessionStorage.getItem(RELOAD_FLAG) === '1' } catch {}
      if (alreadyTried) throw err
      try { window.sessionStorage.setItem(RELOAD_FLAG, '1') } catch {}
      // Force a hard reload — bypasses bfcache and lets the latest SW
      // claim the page so the freshly-deployed chunk filenames resolve.
      window.location.reload()
      // Return a never-resolving promise so React stays in the Suspense
      // fallback until the reload kicks in.
      return new Promise(() => {})
    }
  })
}
