import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import { supabase } from '../lib/supabase'
import { LEAGUE_PRICE_LABEL } from '../lib/stripe'
import Spinner from './Spinner'
import useScrollLock from '../lib/useScrollLock'

// LeagueModal — "Unirme a liga" (gratis) o "Crear liga" (paywall salvo founders).
// Para crear, NO renderiza el PaymentModal aquí: emite onPaymentRequested(name)
// y deja que el padre (LeagueSwitcher) gestione el modal de pago como hermano,
// para evitar portales anidados y bugs de stacking.
export default function LeagueModal({ onClose, onPaymentRequested, onFounderCreated }) {
  useScrollLock()
  const { profile }           = useAuth()
  const { joinLeague }        = useLeague()
  const { t }                 = useLang()
  const isFounder             = !!profile?.is_founder
  const [tab, setTab]         = useState('join')
  const [value, setValue]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

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
        const name = value.trim()
        if (name.length < 2) throw new Error(t('league.nameTooShort'))
        if (name.length > 40) throw new Error(t('league.nameTooLong'))

        if (isFounder) {
          // Founder bypass: la edge function valida is_founder y crea gratis.
          const { data, error: fnErr } = await supabase.functions.invoke('create-league-free', {
            body: { league_name: name },
          })
          if (fnErr) throw new Error(fnErr.message ?? 'No se pudo crear la liga.')
          if (data?.error === 'league_name_taken') throw new Error(t('league.nameTaken'))
          if (!data?.league) throw new Error(data?.error ?? 'Respuesta inesperada del servidor.')
          // Delegamos la pantalla de "Liga creada" al padre.
          if (onFounderCreated) await onFounderCreated(data.league)
        } else {
          // Salimos del modal y pedimos al padre que abra el PaymentModal.
          if (onPaymentRequested) onPaymentRequested(name)
          else onClose()
        }
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

  function switchTab(newTab) {
    setTab(newTab)
    setValue('')
    setError('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-3 sm:px-4 py-4 sm:py-8 bg-ink/40 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card w-full max-w-md animate-slide-up max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4 border-b border-ink/20 flex-shrink-0">
          <h2 className="font-semibold text-ink text-lg">{t('league.title')}</h2>
          <button
            onClick={onClose}
            className="text-ink/60 hover:text-ink w-10 h-10 flex items-center justify-center rounded-lg hover:bg-paper active:bg-paper-200 transition-colors -mr-2"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-paper mx-5 mt-5 rounded-xl">
          {[['join', t('league.joinTab')], ['create', t('league.createTab')]].map(([tabKey, label]) => (
            <button
              key={tabKey}
              onClick={() => switchTab(tabKey)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === tabKey ? 'bg-ink text-cream' : 'text-ink/60 hover:text-ink/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} className="space-y-4">
              {tab === 'join' ? (
                <>
                  <p className="text-ink/60 text-sm">
                    {t('league.joinHint')}
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
                  <p className="text-ink/60 text-sm">
                    {t('league.createHint')}
                  </p>
                  <input
                    type="text"
                    className="input"
                    placeholder={t('league.createPlaceholder')}
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
                  ? t('league.joinFree')
                  : isFounder
                    ? t('league.createFounder')
                    : t('league.continuePayment', { price: LEAGUE_PRICE_LABEL })}
              </button>

              {tab === 'create' && (
                <p className="text-center text-ink/50 text-xs">
                  {isFounder
                    ? t('league.founderNote')
                    : t('league.priceNote', { price: LEAGUE_PRICE_LABEL })}
                </p>
              )}
          </form>
        </div>
      </div>
    </div>
  )
}
