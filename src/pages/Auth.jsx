import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLang } from '../contexts/LangContext'
import { supabase } from '../lib/supabase'
import { appUrl } from '../lib/appUrl'
import { LEAGUE_PRICE_LABEL } from '../lib/stripe'
import Spinner from '../components/Spinner'
import ReportButton from '../components/ReportButton'
import LangToggle from '../components/LangToggle'

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
  // Require at least 2 characters to avoid over-broad matches (typing 'e'
  // shouldn't expand to every alias starting with 'e').
  if (lower.length < 2) return terms
  for (const [abbrev, fullNames] of Object.entries(COMPANY_ALIASES)) {
    if (lower === abbrev || abbrev.startsWith(lower) || lower.startsWith(abbrev)) {
      terms.push(...fullNames)
    }
  }
  return [...new Set(terms)]
}

// ── Shared light background ─────────────────────────────────────────────────
function AuthBg({ children }) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Subtle dot pattern */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #7d6f3a 0.8px, transparent 0.8px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Soft glows */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-terracotta/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-grass-300/20 rounded-full blur-3xl pointer-events-none" />
      <LangToggle className="absolute top-4 right-4 z-10" />
      {children}
    </div>
  )
}

// ── ForgotPassword ─────────────────────────────────────────────────────────
function ForgotPassword({ onBack }) {
  const { t } = useLang()
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const redirectTo = `${appUrl()}/reset-password`
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSent(true)
  }

  return (
    <AuthBg>
      <ReportButton />
      <div className="relative w-full max-w-sm animate-slide-up">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6 text-ink/70 hover:text-ink transition-colors text-sm font-medium">
          <span>⚽</span>
          <span className="font-bold text-ink">Porra <span className="text-terracotta">Mundial 2026</span></span>
        </Link>
        <div className="bg-paper rounded-3xl shadow-xl shadow-ink/8 border border-ink/20 overflow-hidden">
          <div className="bg-cream px-6 py-6 border-b border-ink/15 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-terracotta" />
            <h2 className="text-lg font-bold text-ink">{t('auth.recoverTitle')}</h2>
            <p className="text-ink/60 text-sm mt-1">{t('auth.recoverHint')}</p>
          </div>
          <div className="p-6">
            {sent ? (
              <div className="text-center space-y-3 py-4">
                <div className="text-4xl">📧</div>
                <p className="text-ink font-semibold">{t('auth.emailSent')}</p>
                <p className="text-ink/60 text-sm">{t('auth.emailSentDesc')}</p>
                <button onClick={onBack} className="btn-secondary w-full mt-2">{t('auth.backToLogin')}</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink/80 mb-1.5">{t('auth.email')}</label>
                  <input type="email" className="input" placeholder={t('auth.emailPlaceholder')}
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoFocus autoComplete="email" />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
                )}
                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading && <Spinner size="sm" />} {t('auth.sendLink')}
                </button>
                <button type="button" onClick={onBack} className="w-full text-center text-ink/50 text-sm hover:text-ink/80 transition-colors">
                  {t('auth.backToAuth')}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </AuthBg>
  )
}

function CopyLinkButton({ text }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy} className="btn-secondary text-xs px-3 py-2 flex-shrink-0">
      {copied ? '✓' : t('common.copy')}
    </button>
  )
}

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/

export default function Auth() {
  const { signIn, signUp } = useAuth()
  const { t } = useLang()
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
      const orFilter = terms.map(term => `company.ilike.%${term}%`).join(',')
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

    // Clear stale signup intents from any previous attempt. The user may
    // have switched leagueMode between attempts ('create' → 'none', or
    // changed leagueName/joinCode); the values from the prior attempt
    // would otherwise be picked up by Layout / LeagueContext after auth.
    if (mode === 'register') {
      try {
        localStorage.removeItem('porra-pending-league-create')
        localStorage.removeItem('porra-invite-code')
      } catch {}
    }

    try {
      if (mode === 'login') {
        await signIn(form.email, form.password)
      } else {
        if (form.username.trim().length < 3) throw new Error(t('auth.errUsernameShort'))
        if (!USERNAME_RE.test(form.username.trim())) throw new Error(t('auth.errUsernameChars'))
        if (usernameStatus === 'taken') throw new Error(t('auth.errUsernameTaken'))
        if (usernameStatus === 'checking') throw new Error(t('auth.errUsernameChecking'))
        if (leagueMode === 'create' && leagueName.trim().length < 2) throw new Error(t('auth.errLeagueNameShort'))
        if (leagueMode === 'join' && joinCode.trim().length !== 8) throw new Error(t('auth.errLeagueCodeLength'))

        if (leagueMode === 'create') {
          localStorage.setItem('porra-pending-league-create', leagueName.trim())
        }

        let authData
        try {
          ;({ data: authData } = await signUp(form.email, form.password, form.username.trim(), company.trim()))
        } catch (signUpErr) {
          localStorage.removeItem('porra-pending-league-create')
          throw signUpErr
        }

        // Supabase returns an obfuscated user with empty identities[] when the
        // email is already registered (anti-enumeration). Treat as error so we
        // don't show a false "account created" success banner.
        if (authData?.user && authData.user.identities?.length === 0) {
          localStorage.removeItem('porra-pending-league-create')
          throw new Error('User already registered')
        }

        if (authData?.session && leagueMode === 'join') {
          await setupLeague(authData.user.id)
        }

        if (!authData?.session) {
          // Email confirmation required — guardamos el código en localStorage
          // (no sessionStorage) para que sobreviva si el usuario abre el link
          // de confirmación en otra pestaña o ventana.
          if (leagueMode === 'join' && joinCode.trim()) {
            localStorage.setItem('porra-invite-code', joinCode.trim().toUpperCase())
          }
          setSuccess(t('auth.successCreated'))
        }
      }
    } catch (err) {
      const msgs = {
        'Invalid login credentials':                    t('auth.errInvalidCredentials'),
        'User already registered':                      t('auth.errAlreadyRegistered'),
        'Password should be at least 6 characters':    t('auth.errWeakPassword'),
        'Email rate limit exceeded':                    t('auth.errRateLimit'),
      }
      setError(msgs[err.message] ?? err.message)
    } finally {
      setLoading(false)
    }
  }

  async function setupLeague(userId) {
    if (leagueMode !== 'join') return
    const { data: league, error: findError } = await supabase
      .from('leagues').select('id').eq('invite_code', joinCode.trim().toUpperCase()).single()
    if (findError || !league) throw new Error(t('auth.errLeagueNotFound'))
    const { count } = await supabase
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id)
    if (count >= 40) throw new Error(t('auth.errLeagueFull'))
    const { error: memberError } = await supabase
      .from('league_members').insert({ league_id: league.id, user_id: userId, role: 'member' })
    if (memberError) {
      if (memberError.message?.includes('league_full')) throw new Error(t('auth.errLeagueFull'))
      if (memberError.code === '23505') return // ya es miembro, ok
      throw new Error(t('league.cantJoin'))
    }
  }

  function switchMode(newMode) {
    setMode(newMode)
    setError('')
    setSuccess('')
    setLeagueMode('none')
    setUsernameStatus('idle')
    setCompany('')
    setCompanySuggestions([])
    setForm(f => ({ ...f, username: '' }))
  }

  if (showForgot) return <ForgotPassword onBack={() => setShowForgot(false)} />

  return (
    <AuthBg>
      <ReportButton />
      <div className="relative w-full max-w-md animate-slide-up">

        {/* Back to landing */}
        <div className="text-center mb-5">
          <Link to="/" className="inline-flex items-center gap-1.5 text-ink/60 hover:text-ink text-sm transition-colors font-medium">
            {t('auth.backToLanding')}
          </Link>
        </div>

        {/* Card */}
        <div className="bg-paper rounded-3xl shadow-xl shadow-ink/8 border border-ink/20 overflow-hidden">

          {/* ── Light header ─────────────────────────────────── */}
          <div className="bg-cream px-6 pt-7 pb-5 border-b border-ink/15 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-terracotta" />
            {/* Logo */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="text-4xl mb-2.5">⚽</div>
              <h1 className="text-xl font-bold text-ink">
                Porra <span className="text-terracotta">Mundial 2026</span>
              </h1>
              <p className="text-ink/50 text-xs mt-1">{t('auth.firstMatchSub')}</p>
            </div>

            {/* Stats pills */}
            <div className="flex justify-center gap-2 mb-5">
              {[t('auth.stat48'), t('auth.stat104'), t('auth.stat1')].map(s => (
                <span
                  key={s}
                  className="text-[10px] sm:text-xs text-ink/60 bg-paper/80 border border-ink/20 px-2.5 py-1 rounded-full"
                >
                  {s}
                </span>
              ))}
            </div>

            {/* Tab switcher */}
            <div className="flex border border-ink/20 overflow-hidden bg-paper">
              {[['login', t('auth.loginTab')], ['register', t('auth.registerTab')]].map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                    mode === m
                      ? 'bg-ink text-cream'
                      : 'text-ink/60 hover:text-ink hover:bg-cream'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Form body ────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">

            {/* Username */}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-ink/80 mb-1.5">
                  {t('auth.username')} <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    className={`input pr-9 transition-colors ${
                      usernameStatus === 'available' ? 'border-green-500 focus:border-green-500 focus:ring-green-500/15' :
                      usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-400 focus:border-red-400 focus:ring-red-400/15' : ''
                    }`}
                    placeholder={t('auth.usernamePlaceholder')}
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
                  usernameStatus === 'available' ? 'text-green-600' :
                  usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'text-red-500' : 'text-ink/50'
                }`}>
                  {usernameStatus === 'available' && t('auth.usernameAvailable')}
                  {usernameStatus === 'taken'     && t('auth.usernameTaken')}
                  {usernameStatus === 'invalid'   && (form.username.length > 0 && form.username.length < 3
                    ? t('auth.usernameMinLength') : t('auth.usernameInvalidChars'))}
                  {(usernameStatus === 'idle' || usernameStatus === 'checking') && t('auth.usernameHint')}
                </p>
              </div>
            )}

            {/* Empresa */}
            {mode === 'register' && (
              <div ref={companyContainerRef} className="relative">
                <label className="block text-sm font-medium text-ink/80 mb-1.5">
                  {t('auth.company')} <span className="text-ink/50 font-normal text-xs">{t('auth.companyOptional')}</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder={t('auth.companyPlaceholder')}
                  value={company}
                  onChange={e => { setCompany(e.target.value); setCompanyHighlight(-1) }}
                  onFocus={() => companySuggestions.length > 0 && setShowCompanySug(true)}
                  onKeyDown={handleCompanyKeyDown}
                  autoComplete="off"
                  maxLength={80}
                />
                {showCompanySug && companySuggestions.length > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-paper border border-ink/20 rounded-xl shadow-lg overflow-hidden">
                    {companySuggestions.map((sug, i) => (
                      <button
                        key={sug}
                        type="button"
                        onMouseDown={() => { setCompany(sug); setShowCompanySug(false) }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          i === companyHighlight ? 'bg-terracotta/10 text-terracotta-700' : 'text-ink/80 hover:bg-cream'
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
              <label className="block text-sm font-medium text-ink/80 mb-1.5">{t('auth.email')}</label>
              <input
                type="email" className="input" placeholder={t('auth.emailPlaceholder')}
                value={form.email} onChange={update('email')}
                required autoComplete="email"
              />
            </div>

            {/* Contraseña */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-ink/80">{t('auth.password')}</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-terracotta-600 hover:text-terracotta hover:underline underline-offset-2"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                )}
              </div>
              <input
                type="password" className="input"
                placeholder={mode === 'register' ? t('auth.passwordRegisterPlaceholder') : t('auth.passwordPlaceholder')}
                value={form.password} onChange={update('password')}
                required minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {/* Liga (registro) */}
            {mode === 'register' && (
              <div className="space-y-3 pt-1">
                <p className="text-sm font-medium text-ink/80">
                  {t('auth.leagueSection')} <span className="text-ink/50 font-normal text-xs">{t('auth.leagueOptional')}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[['none','👋', t('auth.laterBtn')],['join','🔗', t('auth.joinBtn')],['create','👑', t('auth.createBtn')]].map(([val, icon, label]) => (
                    <button
                      key={val} type="button" onClick={() => setLeagueMode(val)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        leagueMode === val
                          ? 'bg-terracotta/10 border-terracotta/40 text-terracotta-700'
                          : 'bg-cream border-ink/20 text-ink/60 hover:border-ink/30 hover:text-ink/80'
                      }`}
                    >
                      <span className="text-base">{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                {leagueMode === 'create' && (
                  <div>
                    <label className="block text-xs text-ink/60 mb-1.5">{t('auth.leagueNameLabel')}</label>
                    <input
                      type="text" className="input"
                      placeholder={t('auth.leagueNamePlaceholder')}
                      value={leagueName} onChange={e => setLeagueName(e.target.value)}
                      maxLength={40} required
                    />
                    <p className="text-xs text-terracotta-600 mt-1.5 flex items-center gap-1.5">
                      <span>💳</span>
                      {t('auth.leaguePriceNote', { price: LEAGUE_PRICE_LABEL })}
                    </p>
                  </div>
                )}
                {leagueMode === 'join' && (
                  <div>
                    <label className="block text-xs text-ink/60 mb-1.5">{t('auth.inviteCodeLabel')}</label>
                    <input
                      type="text"
                      className="input uppercase tracking-widest font-mono text-center text-lg"
                      placeholder={t('auth.inviteCodePlaceholder')} value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={8} required
                    />
                  </div>
                )}
                {leagueMode === 'none' && (
                  <p className="text-xs text-ink/50 text-center">
                    {t('auth.laterHint')}
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">{success}</div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'register' && (usernameStatus === 'taken' || usernameStatus === 'checking' || usernameStatus === 'invalid'))}
              className="btn-primary w-full flex items-center justify-center gap-2 text-base"
            >
              {loading && <Spinner size="sm" />}
              {mode === 'login' ? t('auth.loginBtn') : t('auth.registerBtn')}
            </button>

            <p className="text-center text-ink/50 text-xs pt-1">
              {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                className="text-terracotta-600 hover:text-terracotta hover:underline underline-offset-2 font-semibold"
              >
                {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
              </button>
            </p>
            {mode === 'register' && (
              <p className="text-center text-ink/50 text-xs">
                {t('auth.privacyText')}{' '}
                <Link to="/privacidad" className="text-ink/60 hover:text-ink/80 underline underline-offset-2">
                  {t('auth.privacyLink')}
                </Link>
              </p>
            )}
          </form>
        </div>
      </div>
    </AuthBg>
  )
}
