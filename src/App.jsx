import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense } from 'react'
import { useAuth } from './contexts/AuthContext'
import { LeagueProvider } from './contexts/LeagueContext'
import Layout from './components/Layout'
import Spinner from './components/Spinner'
import lazyWithRetry from './lib/lazyWithRetry'

// Landing + Auth are the cold-cache entry points for non-logged-in visitors,
// so we keep them eager. Everything else is lazy — Pronosticos is the most
// common post-login destination and its bundle is fetched in parallel with
// auth/profile resolution so it lands before the user can see the fallback.
import Landing from './pages/Landing'
import Auth from './pages/Auth'

const Pronosticos    = lazyWithRetry(() => import('./pages/Pronosticos'))
const Clasificacion  = lazyWithRetry(() => import('./pages/Clasificacion'))
const Resultados     = lazyWithRetry(() => import('./pages/Resultados'))
const Bracket        = lazyWithRetry(() => import('./pages/Bracket'))
const Reglas         = lazyWithRetry(() => import('./pages/Reglas'))
const Extras         = lazyWithRetry(() => import('./pages/Extras'))
const Perfil         = lazyWithRetry(() => import('./pages/Perfil'))
const AdminLeague    = lazyWithRetry(() => import('./pages/AdminLeague'))
const JoinLeague     = lazyWithRetry(() => import('./pages/JoinLeague'))
const ResetPassword  = lazyWithRetry(() => import('./pages/ResetPassword'))
const Privacidad     = lazyWithRetry(() => import('./pages/Privacidad'))
const NotFound       = lazyWithRetry(() => import('./pages/NotFound'))

function FullPageSpinner() {
  return <div className="flex items-center justify-center h-screen bg-stone-50"><Spinner size="lg" /></div>
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/auth" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  // LeagueProvider lives outside the auth-loading guard so that league data
  // starts fetching as soon as user?.id is known (set before fetchProfile
  // completes), running in parallel with the profile request instead of
  // waiting for it to finish first.
  return (
    <LeagueProvider>
      {loading ? (
        <FullPageSpinner />
      ) : (
        <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            <Route path="/"               element={user ? <Navigate to="/pronosticos" replace /> : <Landing />} />
            <Route path="/auth"           element={user ? <Navigate to="/pronosticos" replace /> : <Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* Layout sin path para no competir con el route "/" de Landing */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/pronosticos"   element={<Pronosticos />} />
              <Route path="/extras"        element={<Extras />} />
              <Route path="/clasificacion" element={<Clasificacion />} />
              <Route path="/resultados"    element={<Resultados />} />
              <Route path="/bracket"       element={<Bracket />} />
              <Route path="/reglas"        element={<Reglas />} />
              <Route path="/perfil"        element={<Perfil />} />
              <Route path="/admin-liga"    element={<AdminLeague />} />
            </Route>
            <Route path="/join/:code"  element={<JoinLeague />} />
            <Route path="/privacidad" element={<Privacidad />} />
            <Route path="*"           element={<NotFound />} />
          </Routes>
        </Suspense>
      )}
    </LeagueProvider>
  )
}
