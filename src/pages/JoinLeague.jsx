import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import Spinner from '../components/Spinner'

export default function JoinLeague() {
  const { code }                        = useParams()
  const { user, loading: authLoading }  = useAuth()
  const { joinLeague }                  = useLeague()
  const navigate                        = useNavigate()
  const [error, setError]               = useState('')

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      sessionStorage.setItem('porra-invite-code', code.toUpperCase())
      navigate(`/auth?join=${code.toUpperCase()}`, { replace: true })
      return
    }

    joinLeague(code.toUpperCase())
      .then(() => navigate('/clasificacion', { replace: true }))
      .catch(err => {
        if (err.message?.includes('Ya eres miembro')) {
          navigate('/clasificacion', { replace: true })
        } else {
          setError(err.message ?? 'Código de invitación inválido.')
        }
      })
  }, [authLoading, user])

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="card p-6 sm:p-8 max-w-sm w-full text-center space-y-3 sm:space-y-4">
          <div className="text-3xl sm:text-4xl">⚠️</div>
          <p className="text-stone-900 font-semibold text-sm sm:text-base">No se pudo unir a la liga</p>
          <p className="text-stone-500 text-xs sm:text-sm">{error}</p>
          <button onClick={() => navigate('/pronosticos')} className="btn-primary w-full">Ir al inicio</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <Spinner size="lg" />
        <p className="text-stone-500 text-sm">Uniéndote a la liga…</p>
      </div>
    </div>
  )
}
