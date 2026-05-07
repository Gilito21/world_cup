import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [step, setStep]         = useState('new-password') // 'new-password' | 'done'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // Supabase inyecta el token de reset en el hash de la URL.
  // Al cargar la página, onAuthStateChange lo detecta y establece la sesión.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStep('new-password')
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return }
    if (password.length < 6)  { setError('La contraseña debe tener al menos 6 caracteres.'); return }

    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (err) { setError(err.message); return }
    setStep('done')
    setTimeout(() => navigate('/auth'), 3000)
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold text-stone-900">
            Porra <span className="text-amber-500">Mundial 2026</span>
          </h1>
        </div>

        <div className="card p-6">
          {step === 'done' ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-4xl">✅</div>
              <p className="text-stone-900 font-semibold">Contraseña actualizada</p>
              <p className="text-stone-400 text-sm">Redirigiendo al inicio de sesión…</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-stone-900 mb-1">Nueva contraseña</h2>
              <p className="text-stone-400 text-sm mb-5">Elige una contraseña nueva para tu cuenta.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Nueva contraseña</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoFocus
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Confirmar contraseña</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Repite la contraseña"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading && <Spinner size="sm" />}
                  Guardar contraseña
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
