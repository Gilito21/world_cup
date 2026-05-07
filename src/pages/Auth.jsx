import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'

function ForgotPassword({ onBack }) {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold text-stone-100">
            Porra <span className="text-amber-500">Mundial 2026</span>
          </h1>
        </div>
        <div className="card p-6">
          {sent ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-4xl">📧</div>
              <p className="text-stone-100 font-semibold">Email enviado</p>
              <p className="text-stone-400 text-sm">
                Revisa tu bandeja de entrada. El enlace caduca en 1 hora.
              </p>
              <button onClick={onBack} className="btn-secondary w-full mt-2">
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-stone-100 mb-1">Recuperar contraseña</h2>
              <p className="text-stone-400 text-sm mb-5">
                Te enviamos un enlace para crear una nueva contraseña.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-300 mb-1.5">Tu email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}
                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading && <Spinner size="sm" />}
                  Enviar enlace
                </button>
              </form>
              <button onClick={onBack} className="w-full text-center text-stone-500 text-sm mt-4 hover:text-stone-300 transition-colors">
                ← Volver
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Solo letras, números, guiones y guiones bajos
const USERNAME_RE = /^[a-zA-Z0-9_-]+$/

export default function Auth() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode]         = useState('login')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [showForgot, setShowForgot] = useState(false)

  const [form, setForm] = useState({ email: '', password: '', username: '' })

  // Estado de disponibilidad del username
  const [usernameStatus, setUsernameStatus] = useState('idle') // 'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  const debounceRef = useRef(null)

  // Opciones de liga en el registro
  const [leagueMode, setLeagueMode] = useState('none') // 'none' | 'create' | 'join'
  const [leagueName, setLeagueName] = useState('')
  const [joinCode, setJoinCode]     = useState('')

  // Código de la liga recién creada (para mostrarlo al usuario)
  const [createdCode, setCreatedCode] = useState('')

  // Comprobar disponibilidad del username con debounce
  useEffect(() => {
    if (mode !== 'register') return
    const name = form.username.trim()

    if (!name) { setUsernameStatus('idle'); return }
    if (name.length < 3) { setUsernameStatus('invalid'); return }
    if (!USERNAME_RE.test(name)) { setUsernameStatus('invalid'); return }

    setUsernameStatus('checking')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', name)
        .maybeSingle()
      setUsernameStatus(data ? 'taken' : 'available')
    }, 400)

    return () => clearTimeout(debounceRef.current)
  }, [form.username, mode])

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
        if (form.username.trim().length < 3) throw new Error('El nombre de usuario debe tener al menos 3 caracteres.')
        if (!USERNAME_RE.test(form.username.trim())) throw new Error('Solo letras, números, - y _ en el nombre de usuario.')
        if (usernameStatus === 'taken') throw new Error('Ese nombre de usuario ya está en uso.')
        if (usernameStatus === 'checking') throw new Error('Espera, comprobando disponibilidad del nombre...')
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
    setUsernameStatus('idle')
    setForm(f => ({ ...f, username: '' }))
  }

  if (showForgot) return <ForgotPassword onBack={() => setShowForgot(false)} />

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
            {/* Registro: username */}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-1.5">
                  Nombre de usuario <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    className={`input pr-9 transition-colors ${
                      usernameStatus === 'available' ? 'border-green-500 focus:border-green-500 focus:ring-green-500' :
                      usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500 focus:border-red-500 focus:ring-red-500' :
                      ''
                    }`}
                    placeholder="ej. ElCrack7"
                    value={form.username}
                    onChange={update('username')}
                    required
                    minLength={3}
                    maxLength={20}
                    autoComplete="username"
                    autoFocus
                  />
                  {/* Icono de estado */}
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking'  && <Spinner size="sm" />}
                    {usernameStatus === 'available' && <span className="text-green-400 text-base">✓</span>}
                    {usernameStatus === 'taken'     && <span className="text-red-400 text-base">✗</span>}
                    {usernameStatus === 'invalid'   && <span className="text-red-400 text-base">!</span>}
                  </div>
                </div>
                {/* Mensaje de estado */}
                <p className={`text-xs mt-1.5 ${
                  usernameStatus === 'available' ? 'text-green-400' :
                  usernameStatus === 'taken'     ? 'text-red-400' :
                  usernameStatus === 'invalid'   ? 'text-red-400' :
                  'text-stone-500'
                }`}>
                  {usernameStatus === 'available' && '✓ Nombre disponible'}
                  {usernameStatus === 'taken'     && 'Este nombre ya está en uso, elige otro'}
                  {usernameStatus === 'invalid'   && (form.username.length > 0 && form.username.length < 3
                    ? 'Mínimo 3 caracteres'
                    : 'Solo letras, números, guiones y guiones bajos')}
                  {(usernameStatus === 'idle' || usernameStatus === 'checking') && 'Con este nombre te verán el resto de jugadores'}
                </p>
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-stone-300">Contraseña</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-amber-500 hover:text-amber-400 hover:underline underline-offset-2"
                  >
                    ¿Olvidaste la contraseña?
                  </button>
                )}
              </div>
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
              disabled={
                loading ||
                (mode === 'register' && (usernameStatus === 'taken' || usernameStatus === 'checking' || usernameStatus === 'invalid'))
              }
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
