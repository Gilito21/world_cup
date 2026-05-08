import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Spinner from '../components/Spinner'

// Aliases de empresa: abreviatura → nombre(s) canónico(s)
const COMPANY_ALIASES = {
  'ey':         ['Ernst & Young'],
  'e&y':        ['Ernst & Young'],
  'ernst':      ['Ernst & Young'],
  'pwc':        ['PricewaterhouseCoopers'],
  'kpmg':       ['KPMG'],
  'deloitte':   ['Deloitte'],
  'bcg':        ['Boston Consulting Group'],
  'mckinsey':   ['McKinsey & Company'],
  'bain':       ['Bain & Company'],
  'goldman':    ['Goldman Sachs'],
  'gs':         ['Goldman Sachs'],
  'jpmorgan':   ['JPMorgan Chase'],
  'jp morgan':  ['JPMorgan Chase'],
  'bofa':       ['Bank of America'],
  'ms':         ['Morgan Stanley'],
  'ibm':        ['International Business Machines'],
  'accenture':  ['Accenture'],
  'bb':         ['Banco de España', 'BBVA'],
  'bbva':       ['BBVA'],
}

function expandAliases(query) {
  const lower = query.toLowerCase().trim()
  const terms = [query]
  for (const [abbrev, fullNames] of Object.entries(COMPANY_ALIASES)) {
    if (lower === abbrev || abbrev.startsWith(lower) || lower.startsWith(abbrev)) {
      terms.push(...fullNames)
    }
  }
  return [...new Set(terms)]
}

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
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-orange-500/8 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center mb-5">
            <div className="absolute w-24 h-24 bg-amber-500/20 rounded-full blur-2xl" />
            <div className="relative w-16 h-16 bg-gradient-to-br from-amber-400/20 to-orange-500/10 rounded-full border border-amber-500/25 flex items-center justify-center text-4xl shadow-inner">
              ⚽
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">
            Porra <span className="text-amber-400">Mundial 2026</span>
          </h1>
        </div>
        <div className="bg-white rounded-3xl shadow-2xl shadow-black/30 p-6">
          {sent ? (
            <div className="text-center space-y-3 py-4">
              <div className="text-4xl">📧</div>
              <p className="text-stone-900 font-semibold">Email enviado</p>
              <p className="text-stone-400 text-sm">Revisa tu bandeja de entrada. El enlace caduca en 1 hora.</p>
              <button onClick={onBack} className="btn-secondary w-full mt-2">Volver al inicio de sesión</button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-stone-900 mb-1">Recuperar contraseña</h2>
              <p className="text-stone-400 text-sm mb-5">Te enviamos un enlace para crear una nueva contraseña.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">Tu email</label>
                  <input type="email" className="input" placeholder="tu@email.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoFocus autoComplete="email" />
                </div>
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
                )}
                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading && <Spinner size="sm" />} Enviar enlace
                </button>
              </form>
              <button onClick={onBack} className="w-full text-center text-stone-500 text-sm mt-4 hover:text-stone-700 transition-colors">
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

function CopyLinkButton({ text }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy} className="btn-secondary text-xs px-3 py-2 flex-shrink-0">
      {copied ? '✓' : 'Copiar'}
    </button>
  )
}

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/

export default function Auth() {
  const { signIn, signUp } = useAuth()
  const [searchParams]          = useSearchParams()
  const [mode, setMode]         = useState('login')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [showForgot, setShowForgot] = useState(false)

  const [form, setForm] = useState({ email: '', password: '', username: '' })

  // Username availability
  const [usernameStatus, setUsernameStatus] = useState('idle')
  const debounceRef = useRef(null)

  // Company autocomplete
  const [company, setCompany]                       = useState('')
  const [companySuggestions, setCompanySuggestions] = useState([])
  const [showCompanySug, setShowCompanySug]         = useState(false)
  const [companyHighlight, setCompanyHighlight]     = useState(-1)
  const companyDebounceRef  = useRef(null)
  const companyContainerRef = useRef(null)

  // Liga
  const [leagueMode, setLeagueMode] = useState('none')
  const [leagueName, setLeagueName] = useState('')
  const [joinCode, setJoinCode]     = useState('')
  const [createdCode, setCreatedCode] = useState('')

  // Pre-fill join code from invite link (?join=CODE)
  useEffect(() => {
    const code = searchParams.get('join')
    if (code) {
      setMode('register')
      setLeagueMode('join')
      setJoinCode(code.toUpperCase())
    }
  }, [])

  // Cerrar dropdown de empresa al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (companyContainerRef.current && !companyContainerRef.current.contains(e.target)) {
        setShowCompanySug(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Username availability check
  useEffect(() => {
    if (mode !== 'register') return
    const name = form.username.trim()
    if (!name) { setUsernameStatus('idle'); return }
    if (name.length < 3) { setUsernameStatus('invalid'); return }
    if (!USERNAME_RE.test(name)) { setUsernameStatus('invalid'); return }
    setUsernameStatus('checking')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').ilike('username', name).maybeSingle()
      setUsernameStatus(data ? 'taken' : 'available')
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [form.username, mode])

  // Company autocomplete search
  useEffect(() => {
    if (mode !== 'register') return
    const q = company.trim()
    if (!q || q.length < 2) { setCompanySuggestions([]); setShowCompanySug(false); return }

    clearTimeout(companyDebounceRef.current)
    companyDebounceRef.current = setTimeout(async () => {
      const terms = expandAliases(q)
      const orFilter = terms.map(t => `company.ilike.%${t}%`).join(',')
      const { data } = await supabase
        .from('profiles')
        .select('company')
        .or(orFilter)
        .not('company', 'is', null)
        .limit(8)
      const unique = [...new Set((data ?? []).map(p => p.company).filter(Boolean))]
      setCompanySuggestions(unique)
      setShowCompanySug(unique.length > 0)
      setCompanyHighlight(-1)
    }, 300)
    return () => clearTimeout(companyDebounceRef.current)
  }, [company, mode])

  function update(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function handleCompanyKeyDown(e) {
    if (!showCompanySug || companySuggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCompanyHighlight(h => Math.min(h + 1, companySuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCompanyHighlight(h => Math.max(h - 1, -1))
    } else if (e.key === 'Enter' && companyHighlight >= 0) {
      e.preventDefault()
      setCompany(companySuggestions[companyHighlight])
      setShowCompanySug(false)
    } else if (e.key === 'Escape') {
      setShowCompanySug(false)
    }
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
        if (form.username.trim().length < 3) throw new Error('El nombre de usuario debe tener al menos 3 caracteres.')
        if (!USERNAME_RE.test(form.username.trim())) throw new Error('Solo letras, números, - y _ en el nombre de usuario.')
        if (usernameStatus === 'taken') throw new Error('Ese nombre de usuario ya está en uso.')
        if (usernameStatus === 'checking') throw new Error('Espera, comprobando disponibilidad del nombre...')
        if (leagueMode === 'create' && leagueName.trim().length < 2) throw new Error('El nombre de liga debe tener al menos 2 caracteres.')
        if (leagueMode === 'join' && joinCode.trim().length !== 8) throw new Error('El código de liga debe tener 8 caracteres.')

        const { data: authData } = await signUp(form.email, form.password, form.username.trim(), company.trim())

        if (authData?.session && leagueMode !== 'none') {
          await setupLeague(authData.user.id)
        } else if (!authData?.session && leagueMode !== 'none') {
          localStorage.setItem('porra-league-intent', JSON.stringify({
            mode: leagueMode,
            leagueName: leagueName.trim(),
            joinCode: joinCode.trim().toUpperCase(),
          }))
        }

        if (!authData?.session) {
          setSuccess('¡Cuenta creada! Ya puedes iniciar sesión.')
        }
      }
    } catch (err) {
      const msgs = {
        'Invalid login credentials':                    'Email o contraseña incorrectos.',
        'User already registered':                      'Este email ya está registrado.',
        'Password should be at least 6 characters':    'La contraseña debe tener al menos 6 caracteres.',
        'Email rate limit exceeded':                    'Demasiados intentos. Espera un momento.',
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
        .select().single()
      if (leagueError) throw leagueError
      await supabase.from('league_members').insert({ league_id: league.id, user_id: userId, role: 'admin' })
      setCreatedCode(code)
    } else if (leagueMode === 'join') {
      const { data: league, error: findError } = await supabase
        .from('leagues').select('id').eq('invite_code', joinCode.trim().toUpperCase()).single()
      if (findError || !league) throw new Error('Código de liga inválido. Comprueba que esté bien escrito.')
      await supabase.from('league_members').insert({ league_id: league.id, user_id: userId, role: 'member' })
    }
  }

  function switchMode(newMode) {
    setMode(newMode)
    setError('')
    setSuccess('')
    setCreatedCode('')
    setLeagueMode('none')
    setUsernameStatus('idle')
    setCompany('')
    setCompanySuggestions([])
    setForm(f => ({ ...f, username: '' }))
  }

  if (showForgot) return <ForgotPassword onBack={() => setShowForgot(false)} />

  if (createdCode) {
    const inviteLink = `${window.location.origin}/join/${createdCode}`
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 flex items-center justify-center px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-3xl" />
        </div>
        <div className="relative w-full max-w-md space-y-5 animate-slide-up">
          <div className="text-center space-y-2">
            <div className="text-5xl mb-1">🎉</div>
            <h2 className="text-2xl font-bold text-white">¡Liga creada!</h2>
            <p className="text-stone-400 text-sm">Comparte el código o el link con tus amigos:</p>
          </div>
          <div className="bg-white rounded-3xl shadow-2xl shadow-black/30 p-5 space-y-4">
            <div className="text-center">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Código</p>
              <p className="text-4xl font-bold tracking-[0.35em] text-amber-500 font-mono">{createdCode}</p>
            </div>
            <div className="border-t border-stone-100 pt-4 space-y-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Link directo</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs text-stone-500 bg-stone-100 rounded-xl px-3 py-2 font-mono truncate">
                  {inviteLink}
                </p>
                <CopyLinkButton text={inviteLink} />
              </div>
            </div>
          </div>
          <p className="text-stone-500 text-xs text-center">Tu cuenta está lista. Inicia sesión para empezar.</p>
          <button onClick={() => switchMode('login')} className="btn-primary w-full">Iniciar sesión</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute top-2/3 left-1/4 w-80 h-80 bg-orange-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-amber-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center mb-5">
            <div className="absolute w-24 h-24 bg-amber-500/20 rounded-full blur-2xl" />
            <div className="relative w-16 h-16 bg-gradient-to-br from-amber-400/20 to-orange-500/10 rounded-full border border-amber-500/25 flex items-center justify-center text-4xl shadow-inner">
              ⚽
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">
            Porra <span className="text-amber-400">Mundial 2026</span>
          </h1>
          <p className="text-stone-400 text-sm mt-1.5">🇺🇸 USA · 🇲🇽 México · 🇨🇦 Canadá</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl shadow-black/30 overflow-hidden p-1.5">
          <div className="flex rounded-xl overflow-hidden bg-stone-100 p-1 mb-5">
            {[['login', 'Iniciar sesión'], ['register', 'Registrarse']].map(([m, label]) => (
              <button key={m} onClick={() => switchMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                  mode === m ? 'bg-amber-500 text-stone-950 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="px-5 pb-6 space-y-4">

            {/* Username */}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Nombre de usuario <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input type="text"
                    className={`input pr-9 transition-colors ${
                      usernameStatus === 'available' ? 'border-green-500 focus:border-green-500 focus:ring-green-500' :
                      usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                    placeholder="ej. ElCrack7"
                    value={form.username} onChange={update('username')}
                    required minLength={3} maxLength={20}
                    autoComplete="username" autoFocus
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking'  && <Spinner size="sm" />}
                    {usernameStatus === 'available' && <span className="text-green-500 text-base">✓</span>}
                    {usernameStatus === 'taken'     && <span className="text-red-400 text-base">✗</span>}
                    {usernameStatus === 'invalid'   && <span className="text-red-400 text-base">!</span>}
                  </div>
                </div>
                <p className={`text-xs mt-1.5 ${
                  usernameStatus === 'available' ? 'text-green-500' :
                  usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'text-red-400' : 'text-stone-400'
                }`}>
                  {usernameStatus === 'available' && '✓ Nombre disponible'}
                  {usernameStatus === 'taken'     && 'Este nombre ya está en uso, elige otro'}
                  {usernameStatus === 'invalid'   && (form.username.length > 0 && form.username.length < 3
                    ? 'Mínimo 3 caracteres' : 'Solo letras, números, guiones y guiones bajos')}
                  {(usernameStatus === 'idle' || usernameStatus === 'checking') && 'Con este nombre te verán el resto de jugadores'}
                </p>
              </div>
            )}

            {/* Empresa */}
            {mode === 'register' && (
              <div ref={companyContainerRef} className="relative">
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Empresa <span className="text-stone-400 font-normal text-xs">(opcional)</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="ej. Accenture, EY, McKinsey…"
                  value={company}
                  onChange={e => { setCompany(e.target.value); setCompanyHighlight(-1) }}
                  onFocus={() => companySuggestions.length > 0 && setShowCompanySug(true)}
                  onKeyDown={handleCompanyKeyDown}
                  autoComplete="off"
                  maxLength={80}
                />
                {showCompanySug && companySuggestions.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
                    {companySuggestions.map((sug, i) => (
                      <button
                        key={sug}
                        type="button"
                        onMouseDown={() => { setCompany(sug); setShowCompanySug(false) }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          i === companyHighlight ? 'bg-amber-50 text-amber-700' : 'text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Email</label>
              <input type="email" className="input" placeholder="tu@email.com"
                value={form.email} onChange={update('email')} required autoComplete="email" />
            </div>

            {/* Contraseña */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-stone-700">Contraseña</label>
                {mode === 'login' && (
                  <button type="button" onClick={() => setShowForgot(true)}
                    className="text-xs text-amber-500 hover:text-amber-400 hover:underline underline-offset-2">
                    ¿Olvidaste la contraseña?
                  </button>
                )}
              </div>
              <input type="password" className="input"
                placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                value={form.password} onChange={update('password')}
                required minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>

            {/* Liga (registro) */}
            {mode === 'register' && (
              <div className="space-y-3 pt-1">
                <p className="text-sm font-medium text-stone-700">Liga <span className="text-stone-400 font-normal text-xs">(opcional)</span></p>
                <div className="grid grid-cols-3 gap-2">
                  {[['none','👋','Después'],['join','🔗','Unirme'],['create','👑','Crear']].map(([val, icon, label]) => (
                    <button key={val} type="button" onClick={() => setLeagueMode(val)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        leagueMode === val
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-500'
                          : 'bg-stone-50 border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700'
                      }`}
                    >
                      <span className="text-base">{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                {leagueMode === 'create' && (
                  <div>
                    <label className="block text-xs text-stone-500 mb-1.5">Nombre de la liga</label>
                    <input type="text" className="input" placeholder="ej. Los Cracks del Trabajo"
                      value={leagueName} onChange={e => setLeagueName(e.target.value)} maxLength={40} required />
                    <p className="text-xs text-stone-400 mt-1">Recibirás un código para invitar a tus amigos.</p>
                  </div>
                )}
                {leagueMode === 'join' && (
                  <div>
                    <label className="block text-xs text-stone-500 mb-1.5">Código de invitación</label>
                    <input type="text" className="input uppercase tracking-widest font-mono text-center text-lg"
                      placeholder="XXXXXXXX" value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={8} required />
                  </div>
                )}
                {leagueMode === 'none' && (
                  <p className="text-xs text-stone-400 text-center">Podrás crear o unirte a ligas desde el menú una vez dentro.</p>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
            )}
            {success && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-500 text-sm">{success}</div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'register' && (usernameStatus === 'taken' || usernameStatus === 'checking' || usernameStatus === 'invalid'))}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Spinner size="sm" />}
              {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-stone-500 text-xs mt-5">
          {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-amber-400 hover:text-amber-300 hover:underline underline-offset-2 font-medium">
            {mode === 'login' ? 'Regístrate gratis' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </div>
  )
}
