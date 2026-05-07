import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'

// Genera código de invitación (8 chars sin ambigüedades)
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function Auth() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode]       = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  // Datos base
  const [form, setForm] = useState({ email: '', password: '', username: '' })

  // Opciones de liga en el registro
  const [leagueMode, setLeagueMode] = useState('none') // 'none' | 'create' | 'join'
  const [leagueName, setLeagueName] = useState('')
  const [joinCode, setJoinCode]     = useState('')

  // Código de la liga recién creada (para mostrarlo al usuario)
  const [createdCode, setCreatedCode] = useState('')

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
        // AuthContext redirige automáticamente via App.jsx
      } else {
        // Validaciones
        if (form.username.trim().length < 3) throw new Error('El nombre debe tener al menos 3 caracteres.')
        if (leagueMode === 'create' && leagueName.trim().length < 2) throw new Error('El nombre de liga debe tener al menos 2 caracteres.')
        if (leagueMode === 'join' && joinCode.trim().length !== 8) throw new Error('El código de liga debe tener 8 caracteres.')

        const { data: authData } = await signUp(form.email, form.password, form.username.trim())

        // Si hay sesión activa (email confirm desactivado), gestionar liga ahora
        if (authData?.session && leagueMode !== 'none') {
          await setupLeague(authData.user.id)
        } else if (!authData?.session && leagueMode !== 'none') {
          // Email confirm activado: guardar intención para procesarla al confirmar
          localStorage.setItem('porra-league-intent', JSON.stringify({
            mode: leagueMode,
            leagueName: leagueName.trim(),
            joinCode: joinCode.trim().toUpperCase(),
          }))
        }

        if (!authData?.session) {
          setSuccess('¡Cuenta creada! Revisa tu email para confirmarla y luego inicia sesión.')
        }
      }
    } catch (err) {
      const msgs = {
        'Invalid login credentials':           'Email o contraseña incorrectos.',
        'User already registered':             'Este email ya está registrado.',
        'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
        'Email rate limit exceeded':           'Demasiados intentos. Espera un momento.',
      }
      setError(msgs[err.message] ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  async function setupLeague(userId) {
    if (leagueMode === 'create') {
      const code = generateCode()
      const { data: league, error: leagueError } = await supabase
        .from('leagues')
        .insert({ name: leagueName.trim(), invite_code: code, created_by: userId })
        .select()
        .single()
      if (leagueError) throw leagueError

      await supabase
        .from('league_members')
        .insert({ league_id: league.id, user_id: userId, role: 'admin' })

      setCreatedCode(code)
    } else if (leagueMode === 'join') {
      const { data: league, error: findError } = await supabase
        .from('leagues')
        .select('id')
        .eq('invite_code', joinCode.trim().toUpperCase())
        .single()
      if (findError || !league) throw new Error('Código de liga inválido. Comprueba que esté bien escrito.')

      await supabase
        .from('league_members')
        .insert({ league_id: league.id, user_id: userId, role: 'member' })
    }
  }

  function switchMode(newMode) {
    setMode(newMode)
    setError('')
    setSuccess('')
    setCreatedCode('')
    setLeagueMode('none')
  }

  // Si el registro se completó con liga creada, mostrar el código
  if (createdCode) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-5 animate-slide-up">
          <div className="text-5xl">🎉</div>
          <h2 className="text-xl font-bold text-stone-100">¡Liga creada!</h2>
          <p className="text-stone-400">Comparte este código con tus amigos para que se unan:</p>
          <div className="card p-6">
            <p className="text-4xl font-bold tracking-[0.35em] text-amber-400 font-mono">{createdCode}</p>
          </div>
          <p className="text-stone-500 text-sm">
            También lo encontrarás en el menú de ligas una vez dentro.
          </p>
          <p className="text-green-400 text-sm">Tu cuenta está lista. Inicia sesión para empezar.</p>
          <button onClick={() => switchMode('login')} className="btn-primary w-full">
            Iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center px-4 py-8">
      {/* Fondo decorativo */}
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

        <div className="card p-1">
          {/* Tabs login/register */}
          <div className="flex rounded-xl overflow-hidden bg-stone-800 p-1 mb-5">
            {[['login', 'Iniciar sesión'], ['register', 'Registrarse']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                  mode === m ? 'bg-amber-500 text-stone-950 shadow-sm' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="px-5 pb-6 space-y-4">
            {/* Registro: nombre */}
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

            {/* Registro: opciones de liga */}
            {mode === 'register' && (
              <div className="space-y-3 pt-1">
                <p className="text-sm font-medium text-stone-300">Liga (opcional)</p>

                {/* Botones de selección de modo */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['none',   '👋', 'Después'],
                    ['join',   '🔗', 'Unirme'],
                    ['create', '👑', 'Crear'],
                  ].map(([val, icon, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setLeagueMode(val)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        leagueMode === val
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-400'
                          : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-600 hover:text-stone-300'
                      }`}
                    >
                      <span className="text-base">{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* Campo dinámico según modo */}
                {leagueMode === 'create' && (
                  <div>
                    <label className="block text-xs text-stone-400 mb-1.5">Nombre de la liga</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="ej. Los Cracks del Trabajo"
                      value={leagueName}
                      onChange={e => setLeagueName(e.target.value)}
                      maxLength={40}
                      required
                    />
                    <p className="text-xs text-stone-600 mt-1">Recibirás un código para invitar a tus amigos.</p>
                  </div>
                )}

                {leagueMode === 'join' && (
                  <div>
                    <label className="block text-xs text-stone-400 mb-1.5">Código de invitación</label>
                    <input
                      type="text"
                      className="input uppercase tracking-widest font-mono text-center text-lg"
                      placeholder="XXXXXXXX"
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={8}
                      required
                    />
                  </div>
                )}

                {leagueMode === 'none' && (
                  <p className="text-xs text-stone-500 text-center">
                    Podrás crear o unirte a ligas desde el menú una vez dentro.
                  </p>
                )}
              </div>
            )}

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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Spinner size="sm" />}
              {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-stone-500 text-xs mt-4">
          {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-amber-500 hover:text-amber-400 hover:underline underline-offset-2"
          >
            {mode === 'login' ? 'Regístrate gratis' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  )
}
