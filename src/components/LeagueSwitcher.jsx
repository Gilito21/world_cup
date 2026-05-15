import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLeague } from '../contexts/LeagueContext'
import { useLang } from '../contexts/LangContext'
import LeagueModal from './LeagueModal'
import PaymentModal from './PaymentModal'
import LeagueCreatedModal from './LeagueCreatedModal'

export default function LeagueSwitcher() {
  const { leagues, activeLeague, setActiveLeague, onLeagueCreated } = useLeague()
  const { t } = useLang()
  const [open, setOpen]               = useState(false)
  const [showModal, setShowModal]     = useState(false)
  // Cuando LeagueModal pide pasar al pago, sube el nombre aquí:
  const [paymentName, setPaymentName] = useState(null)
  // Liga recién creada (founder bypass o tras pago) — muestra el código.
  // También usada para mostrar el modal de compartir de ligas existentes.
  const [createdLeague, setCreatedLeague] = useState(null)
  const ref = useRef(null)

  async function handlePaymentSuccess(league) {
    setPaymentName(null)
    if (onLeagueCreated) await onLeagueCreated(league)
    setCreatedLeague(league)
  }

  async function handleFounderCreated(league) {
    setShowModal(false)
    if (onLeagueCreated) await onLeagueCreated(league)
    setCreatedLeague(league)
  }

  // Cerrar al hacer click fuera o pulsar Escape
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const keyHandler = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [])

  if (leagues.length === 0) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors min-h-[36px]"
        >
          <span>+</span>
          <span>{t('league.joinShort')}</span>
          <span className="hidden sm:inline">{t('league.toLeague')}</span>
        </button>
        {showModal && createPortal(
          <LeagueModal
            onClose={() => setShowModal(false)}
            onPaymentRequested={(name) => { setShowModal(false); setPaymentName(name) }}
            onFounderCreated={handleFounderCreated}
          />,
          document.body
        )}
        {paymentName && (
          <PaymentModal
            leagueName={paymentName}
            onClose={() => setPaymentName(null)}
            onSuccess={handlePaymentSuccess}
          />
        )}
        {createdLeague && (
          <LeagueCreatedModal
            league={createdLeague}
            onClose={() => setCreatedLeague(null)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-stone-100 border border-stone-300 hover:border-stone-400 transition-colors max-w-[180px] sm:max-w-[220px] min-h-[36px]"
        >
          {/* Badge de admin */}
          {activeLeague?.role === 'admin' && (
            <span className="text-xs">👑</span>
          )}
          <span className="text-xs sm:text-sm font-medium text-stone-800 truncate">
            {activeLeague?.name ?? t('league.selectLeague')}
          </span>
          <svg
            className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-stone-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-0 top-full mt-1.5 w-[min(16rem,calc(100vw-1.5rem))] card shadow-2xl shadow-stone-300/50 py-1.5 z-40 animate-fade-in">
            <div className="px-3 py-1.5 text-xs font-semibold text-stone-400 uppercase tracking-wider">
              {t('league.yourLeagues')}
            </div>

            {leagues.map(league => (
              <div key={league.id} className={`flex items-center ${activeLeague?.id === league.id ? 'bg-stone-100' : ''}`}>
                <button
                  onClick={() => { setActiveLeague(league); setOpen(false) }}
                  className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-stone-100 transition-colors min-w-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {league.role === 'admin' && <span className="text-xs">👑</span>}
                      <span className="text-sm font-medium text-stone-900 truncate">{league.name}</span>
                    </div>
                    {league.role === 'admin' && (
                      <div className="text-xs text-stone-400 font-mono mt-0.5">
                        {t('league.codeLabel')} <span className="text-amber-500/80 tracking-wider">{league.invite_code}</span>
                      </div>
                    )}
                  </div>
                  {activeLeague?.id === league.id && (
                    <span className="text-amber-400 text-sm flex-shrink-0">✓</span>
                  )}
                </button>
                {league.role === 'admin' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpen(false); setCreatedLeague(league) }}
                    className="flex-shrink-0 px-2.5 py-2.5 text-stone-400 hover:text-amber-500 hover:bg-amber-50 transition-colors rounded-r-lg"
                    title={t('league.shareBtn')}
                  >
                    📤
                  </button>
                )}
              </div>
            ))}

            <div className="border-t border-stone-200 mt-1.5 pt-1.5">
              <button
                onClick={() => { setOpen(false); setShowModal(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-400 hover:bg-stone-100 transition-colors rounded-lg mx-0"
              >
                <span className="text-base">+</span>
                <span>{t('league.createOrJoin')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && createPortal(
        <LeagueModal
          onClose={() => setShowModal(false)}
          onPaymentRequested={(name) => { setShowModal(false); setPaymentName(name) }}
          onFounderCreated={handleFounderCreated}
        />,
        document.body
      )}
      {paymentName && (
        <PaymentModal
          leagueName={paymentName}
          onClose={() => setPaymentName(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
      {createdLeague && (
        <LeagueCreatedModal
          league={createdLeague}
          onClose={() => setCreatedLeague(null)}
        />
      )}
    </>
  )
}
