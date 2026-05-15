import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'
import { stripePromise, LEAGUE_PRICE_LABEL } from '../lib/stripe'
import { useLang } from '../contexts/LangContext'
import Spinner from './Spinner'

// ── Formulario interno: tiene acceso a useStripe/useElements ──
function PaymentForm({ leagueName, paymentIntentId, onSuccess, onClose }) {
  const { t } = useLang()
  const stripe   = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError('')

    // 1) Confirma el pago con Stripe (sin redirección — quedamos en el modal)
    const { error: stripeErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (stripeErr) {
      setError(stripeErr.message ?? 'No se pudo procesar el pago.')
      setSubmitting(false)
      return
    }
    if (paymentIntent?.status !== 'succeeded') {
      setError(`Pago en estado "${paymentIntent?.status}". Intenta de nuevo.`)
      setSubmitting(false)
      return
    }

    // 2) Verifica server-side y crea la liga
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('confirm-league-payment', {
        body: { payment_intent_id: paymentIntentId },
      })
      if (fnErr) throw new Error(fnErr.message ?? 'No se pudo crear la liga.')
      if (data?.error === 'league_name_taken') throw new Error('Ya existe una liga con ese nombre.')
      if (!data?.league) throw new Error(data?.error ?? 'Respuesta inesperada del servidor.')
      onSuccess(data.league)
    } catch (err) {
      setError(`El pago se realizó pero hubo un problema creando la liga (${err.message}). Contacta con soporte indicando el ID: ${paymentIntentId}`)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
          fields: { billingDetails: { name: 'auto', email: 'auto' } },
        }}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:from-amber-600 active:to-amber-500 text-stone-950 font-semibold py-3.5 rounded-2xl shadow-lg shadow-amber-500/30 hover:shadow-amber-500/40 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting
          ? <><Spinner size="sm" /> {t('payment.processing')}</>
          : t('payment.payBtn', { price: LEAGUE_PRICE_LABEL })}
      </button>

      <p className="text-center text-stone-400 text-xs flex items-center justify-center gap-1">
        {t('payment.secure')}
      </p>
    </form>
  )
}

// ── Wrapper que carga el clientSecret y monta <Elements> ──
export default function PaymentModal({ leagueName, onSuccess, onClose }) {
  const { t } = useLang()
  const [clientSecret,   setClientSecret]   = useState(null)
  const [paymentIntentId, setPaymentIntentId] = useState(null)
  const [error,          setError]          = useState('')
  const [loading,        setLoading]        = useState(true)

  const FEATURES = [
    t('payment.f1'), t('payment.f2'), t('payment.f3'), t('payment.f4'), t('payment.f5'),
  ]

  // Cerrar con Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Crea el PaymentIntent al montar
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('create-league-payment', {
          body: { league_name: leagueName },
        })
        if (fnErr) throw new Error(fnErr.message ?? 'No se pudo iniciar el pago.')
        if (!data?.client_secret) throw new Error(data?.error ?? 'Respuesta inesperada del servidor.')
        if (cancelled) return
        setClientSecret(data.client_secret)
        setPaymentIntentId(data.payment_intent_id)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [leagueName])

  if (!stripePromise) {
    return createPortal(
      <Backdrop onClose={onClose}>
        <div className="p-6 space-y-3 text-center">
          <span className="text-3xl">⚠️</span>
          <p className="text-stone-900 font-semibold">{t('payment.notConfigured')}</p>
          <p className="text-stone-500 text-sm">
            {t('payment.notConfiguredDesc')}
          </p>
          <button onClick={onClose} className="btn-secondary w-full">{t('common.close')}</button>
        </div>
      </Backdrop>,
      document.body
    )
  }

  return createPortal(
    <Backdrop onClose={onClose}>
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-amber-500 via-amber-400 to-orange-400 p-5 sm:p-6 text-stone-950">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/30 hover:bg-white/50 backdrop-blur-sm flex items-center justify-center text-stone-900 transition-colors"
          aria-label={t('common.close')}
        >
          ✕
        </button>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">⚽</span>
          <span className="text-xs font-bold uppercase tracking-wider opacity-80">Porra Mundial 2026</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold leading-tight">
          {t('payment.createTitle', { name: leagueName })}
        </h2>
        <p className="text-stone-900/70 text-xs sm:text-sm mt-1">
          {t('payment.createSubtitle')}
        </p>
      </div>

      <div className="p-5 sm:p-6 space-y-4">
        {/* Features */}
        <ul className="space-y-2">
          {FEATURES.map(f => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-stone-700">
              <span className="text-amber-500 font-bold flex-shrink-0 mt-0.5">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="border-t border-stone-200 my-2" />

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Spinner size="lg" />
            <p className="text-stone-400 text-xs">{t('payment.loading')}</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm space-y-2">
            <p className="font-semibold">{t('payment.errorTitle')}</p>
            <p className="text-xs">{error}</p>
            <button onClick={onClose} className="btn-secondary w-full mt-2">{t('common.close')}</button>
          </div>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: {
                  colorPrimary:    '#f59e0b',
                  colorBackground: '#ffffff',
                  colorText:       '#1c1917',
                  colorDanger:     '#dc2626',
                  fontFamily:      'Inter, system-ui, sans-serif',
                  borderRadius:    '12px',
                  spacingUnit:     '4px',
                },
                rules: {
                  '.Input': {
                    border:    '1px solid #e7e5e4',
                    boxShadow: 'none',
                    padding:   '12px 14px',
                  },
                  '.Input:focus': {
                    border:    '1px solid #f59e0b',
                    boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.15)',
                  },
                  '.Label': {
                    fontWeight: '500',
                    color:      '#57534e',
                    fontSize:   '13px',
                  },
                },
              },
            }}
          >
            <PaymentForm
              leagueName={leagueName}
              paymentIntentId={paymentIntentId}
              onSuccess={onSuccess}
              onClose={onClose}
            />
          </Elements>
        )}
      </div>
    </Backdrop>,
    document.body
  )
}

function Backdrop({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center sm:items-center justify-center bg-stone-900/60 backdrop-blur-md animate-fade-in px-3 sm:px-4 py-4 sm:py-8 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-md shadow-2xl shadow-black/40 overflow-hidden animate-slide-up max-h-[calc(100dvh-2rem)] flex flex-col">
        <div className="overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
