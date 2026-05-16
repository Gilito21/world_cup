import { createContext, useContext, useEffect } from 'react'

// Lets pages register a refresh callback that the Layout will invoke when
// the user performs a pull-to-refresh gesture on the main scroll container.
// The callback is replaced (not stacked) so only the current page's handler
// is active at any time — that's what we want, since only one page is
// rendered via <Outlet> at a time.
export const PullRefreshContext = createContext({
  setRefreshHandler: () => {},
})

export default function usePullRefresh(handler) {
  const { setRefreshHandler } = useContext(PullRefreshContext)
  useEffect(() => {
    if (typeof handler !== 'function') return
    setRefreshHandler(() => handler)
    return () => setRefreshHandler(() => null)
  }, [handler, setRefreshHandler])
}
