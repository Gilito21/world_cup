import { useState, useEffect } from 'react'
import { useLeague } from '../contexts/LeagueContext'
import Spinner from './Spinner'

export default function LeagueModal({ onClose }) {
  const { createLeague, joinLeague } = useLeague()
  const [tab, setTab]         = useState('join')
  const [value, setValue]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [created, setCreated] = useState(null)

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'create') {
        if (value.trim().length < 2) throw new Error('El nombre debe tener al menos 2 caracteres.')
        const league = await createLeague(value)
        setCreated(league)
      } else {
        await joinLeague(value)
        onClose()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function switchTab(t) {
    setTab(t)
    setValue('')
    setError('')
    setCreated(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-stone-900/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-stone-200">
          <h2 className="font-semibold text-stone-900 text-lg">Ligas</h2>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-stone-100 mx-5 mt-5 rounded-xl">
          {[['join', 'Unirme a liga'], ['create', 'Crear liga']].map(([t, label]) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === t ? 'bg-amber-500 text-stone-950' : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {created ? (
            // Liga creada — mostrar código
            <div className="space-y-4 text-center">
              <div className="text-3xl">🎉</div>
              <div>
                <p className="text-stone-700 font-medium">Liga <span className="text-amber-400">"{created.name}"</span> creada</p>
                <p className="text-stone-500 text-sm mt-1">Comparte este código con tus amigos:</p>
              </div>
              <div className="bg-stone-100 border border-amber-500/30 rounded-xl p-4">
                <p className="text-3xl font-bold tracking-[0.3em] text-amber-400 font-mono">{created.invite_code}</p>
              </div>
              <p className="text-stone-400 text-xs">
                Tus amigos lo introducen al registrarse o desde "Ligas" en el menú.
              </p>
              <button onClick={onClose} className="btn-primary w-full">Perfecto</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === 'join' ? (
                <>
                  <p className="text-stone-500 text-sm">
                    Introduce el código que te ha dado el administrador de la liga.
                  </p>
                  <input
                    type="text"
                    className="input uppercase tracking-widest font-mono text-lg text-center"
                    placeholder="XXXXXXXX"
                    value={value}
                    onChange={e => setValue(e.target.value.toUpperCase())}
                    maxLength={8}
                    required
                    autoFocus
                  />
                </>
              ) : (
                <>
                  <p className="text-stone-500 text-sm">
                    Crea una liga privada. Recibirás un código para invitar a tus amigos.
                  </p>
                  <input
                    type="text"
                    className="input"
                    placeholder="Nombre de la liga (ej. Los Cracks)"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    maxLength={40}
                    required
                    autoFocus
                  />
                </>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !value.trim()} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading && <Spinner size="sm" />}
                {tab === 'join' ? 'Unirme' : 'Crear liga'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
