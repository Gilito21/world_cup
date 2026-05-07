import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { LeagueProvider } from './contexts/LeagueContext'
import Layout from './components/Layout'
import Auth from './pages/Auth'
import ResetPassword from './pages/ResetPassword'
import Perfil from './pages/Perfil'
import Pronosticos from './pages/Pronosticos'
import Clasificacion from './pages/Clasificacion'
import Resultados from './pages/Resultados'
import Spinner from './components/Spinner'
import NotFound from './pages/NotFound'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><Spinner /></div>
  if (!user) return <Navigate to="/auth" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-50">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <LeagueProvider>
      <Routes>
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
          <Route path="clasificacion" element={<Clasificacion />} />
          <Route path="resultados"    element={<Resultados />} />
          <Route path="perfil"        element={<Perfil />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </LeagueProvider>
  )
}
