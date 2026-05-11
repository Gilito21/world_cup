import { useState, useEffect } from 'react'
import { useLeague } from '../contexts/LeagueContext'
import PaymentModal from './PaymentModal'
import { LEAGUE_PRICE_LABEL } from '../lib/stripe'
import Spinner from './Spinner'

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0 flex items-center gap-1.5"
    >
      {copied ? '✓ Copiado' : label}
    </button>
  )
}

export default function LeagueModal({ onClose }) {
  const { joinLeague, onLeagueCreated } = useLeague()
  const [tab, setTab]                   = useState('join')
  const [value, setValue]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [created, setCreated]           = useState(null)
  const [showPayment, setShowPayment]   = useState(false)
  const [pendingName, setPendingName]   = useState('')

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !showPayment) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, showPayment])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'create') {
        const name = value.trim()
        if (name.length < 2) throw new Error('El nombre debe tener al menos 2 caracteres.')
        if (name.length > 40) throw new Error('El nombre no puede superar 40 caracteres.')
        // Abre el modal de pago. La liga se crea server-side tras el pago.
        setPendingName(name)
        setShowPayment(true)
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

  async function handlePaymentSuccess(league) {
    // El edge function ya creó la liga + admin membership.
    // Refrescar el contexto y dejarla activa.
    if (onLeagueCreated) await onLeagueCreated(league)
    setShowPayment(false)
    setCreated(league)
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
            // Liga creada — mostrar código y link
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl mb-2">🎉</div>
                <p className="text-stone-700 font-medium">Liga <span className="text-amber-400">"{created.name}"</span> creada</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Código de invitación</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-stone-100 border border-amber-500/30 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold tracking-[0.3em] text-amber-400 font-mono">{created.invite_code}</p>
                  </div>
                  <CopyButton text={created.invite_code} label="Copiar" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Link directo</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs text-stone-500 bg-stone-100 rounded-xl px-3 py-2.5 font-mono truncate">
                    {`${window.location.origin}/join/${created.invite_code}`}
                  </p>
                  <CopyButton
                    text={`${window.location.origin}/join/${created.invite_code}`}
                    label="Copiar"
                  />
                </div>
                <p className="text-xs text-stone-400">
                  Tus amigos hacen click y se unen directamente al registrarse.
                </p>
              </div>

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
                {tab === 'join'
                  ? 'Unirme gratis'
                  : <>Continuar al pago · {LEAGUE_PRICE_LABEL}</>}
              </button>

              {tab === 'create' && (
                <p className="text-center text-stone-400 text-xs">
                  Crear una liga cuesta {LEAGUE_PRICE_LABEL} (pago único). Unirse a una liga existente es gratis.
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          leagueName={pendingName}
          onClose={() => setShowPayment(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  )
}
