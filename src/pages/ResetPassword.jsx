import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LangContext'
import LangToggle from '../components/LangToggle'
import Spinner from '../components/Spinner'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [step, setStep]         = useState('new-password') // 'new-password' | 'done'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const redirectTimer = useRef(null)

  // Supabase inyecta el token de reset en el hash de la URL.
  // Al cargar la página, onAuthStateChange lo detecta y establece la sesión.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStep('new-password')
    })
    return () => {
      subscription.unsubscribe()
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError(t('auth.passwordsMismatch')); return }
    if (password.length < 6)  { setError(t('auth.errWeakPassword')); return }

    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (err) { setError(err.message); return }
    setStep('done')
    redirectTimer.current = setTimeout(() => navigate('/pronosticos', { replace: true }), 3000)
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 relative">
      <LangToggle className="absolute top-4 right-4" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-ink/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold text-ink">
            {t('common.appName')}
          </h1>
        </div>

        <div className="card p-6">
          {step === 'done' ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-4xl">✅</div>
              <p className="text-ink font-semibold">{t('auth.passwordUpdated')}</p>
              <p className="text-ink/50 text-sm">{t('auth.passwordUpdatedRedirect')}</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-ink mb-1">{t('auth.newPassword')}</h2>
              <p className="text-ink/50 text-sm mb-5">{t('auth.chooseNewPassword')}</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink/80 mb-1.5">{t('auth.newPassword')}</label>
                  <input
                    type="password"
                    className="input"
                    placeholder={t('auth.passwordRegisterPlaceholder')}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoFocus
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/80 mb-1.5">{t('auth.confirmPassword')}</label>
                  <input
                    type="password"
                    className="input"
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-none px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading && <Spinner size="sm" />}
                  {t('auth.savePassword')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
