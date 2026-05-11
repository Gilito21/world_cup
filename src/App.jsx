import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { LeagueProvider } from './contexts/LeagueContext'
import Layout from './components/Layout'
import Auth from './pages/Auth'
import Landing from './pages/Landing'
import ResetPassword from './pages/ResetPassword'
import Perfil from './pages/Perfil'
import Pronosticos from './pages/Pronosticos'
import Clasificacion from './pages/Clasificacion'
import Resultados from './pages/Resultados'
import Bracket from './pages/Bracket'
import Reglas from './pages/Reglas'
import Extras from './pages/Extras'
import JoinLeague from './pages/JoinLeague'
import Spinner from './components/Spinner'
import NotFound from './pages/NotFound'

const dlog = (...args) => console.log('[DEBUG][App]', new Date().toISOString().slice(11, 23), ...args)

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) { dlog('ProtectedRoute → SPINNER (loading=true)'); return <div className="flex items-center justify-center h-screen"><Spinner /></div> }
  if (!user) { dlog('ProtectedRoute → /auth (no user)'); return <Navigate to="/auth" replace /> }
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  dlog('render loading=', loading, 'user=', user?.id ?? null)

  // LeagueProvider lives outside the auth-loading guard so that league data
  // starts fetching as soon as user?.id is known (set before fetchProfile
  // completes), running in parallel with the profile request instead of
  // waiting for it to finish first.
  return (
    <LeagueProvider>
      {loading ? (
        <div className="flex items-center justify-center h-screen bg-stone-50">
          <Spinner size="lg" />
        </div>
      ) : (
        <Routes>
          <Route path="/"               element={user ? <Navigate to="/pronosticos" replace /> : <Landing />} />
          <Route path="/auth"           element={user ? <Navigate to="/pronosticos" replace /> : <Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/pronosticos" replace />} />
            <Route path="pronosticos"   element={<Pronosticos />} />
            <Route path="extras"        element={<Extras />} />
            <Route path="clasificacion" element={<Clasificacion />} />
            <Route path="resultados"    element={<Resultados />} />
            <Route path="bracket"       element={<Bracket />} />
            <Route path="reglas"        element={<Reglas />} />
            <Route path="perfil"        element={<Perfil />} />
          </Route>
          <Route path="/join/:code" element={<JoinLeague />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      )}
    </LeagueProvider>
  )
}
