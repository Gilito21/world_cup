import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Spinner from '../components/Spinner'

export default function Auth() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode]       = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({ email: '', password: '', username: '' })

  function update(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'login') {
        await signIn(form.email, form.password)
      } else {
        if (form.username.trim().length < 3) {
          throw new Error('El nombre de usuario debe tener al menos 3 caracteres.')
        }
        await signUp(form.email, form.password, form.username.trim())
        setSuccess('¡Cuenta creada! Revisa tu email para confirmarla.')
      }
    } catch (err) {
      const msgs = {
        'Invalid login credentials': 'Email o contraseña incorrectos.',
        'User already registered': 'Este email ya está registrado.',
        'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
      }
      setError(msgs[err.message] ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  function switchMode(newMode) {
    setMode(newMode)
    setError('')
    setSuccess('')
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center px-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute top-2/3 left-1/3 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold text-stone-100">
            Porra <span className="text-amber-500">Mundial 2026</span>
          </h1>
          <p className="text-stone-400 text-sm mt-1">USA · México · Canadá</p>
        </div>

        <div className="card p-1 mb-1">
          {/* Mode tabs */}
          <div className="flex rounded-xl overflow-hidden bg-stone-800 p-1 mb-6">
            {[['login', 'Iniciar sesión'], ['register', 'Registrarse']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                  mode === m
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="px-5 pb-6 space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-1.5">
                  Nombre en la porra
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="ej. ElCrack7"
                  value={form.username}
                  onChange={update('username')}
                  required
                  minLength={3}
                  maxLength={20}
                  autoComplete="username"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-stone-300 mb-1.5">Email</label>
              <input
                type="email"
                className="input"
                placeholder="tu@email.com"
                value={form.email}
                onChange={update('email')}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-300 mb-1.5">Contraseña</label>
              <input
                type="password"
                className="input"
                placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                value={form.password}
                onChange={update('password')}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm">
                {success}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading && <Spinner size="sm" />}
              {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-stone-500 text-xs mt-4">
          {mode === 'login'
            ? '¿No tienes cuenta? '
            : '¿Ya tienes cuenta? '}
          <button
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-amber-500 hover:text-amber-400 underline-offset-2 hover:underline"
          >
            {mode === 'login' ? 'Regístrate gratis' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  )
}
