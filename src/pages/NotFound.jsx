import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useLang } from '../contexts/LangContext'

export default function NotFound() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [dots, setDots] = useState('')

  useEffect(() => {
    const timer = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4 overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ink/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-ink/5 rounded-full blur-3xl" />
      </div>

      <div className="relative text-center space-y-8 animate-slide-up max-w-md w-full">
        {/* Número grande */}
        <div className="relative select-none">
          <p className="text-[10rem] font-black leading-none tracking-tighter text-ink">
            404
          </p>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-7xl drop-shadow-lg">⚽</span>
          </div>
        </div>

        {/* Mensaje */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-cream">
            {t('notFound.title')}
          </h1>
          <p className="text-ink/50 text-sm leading-relaxed">
            {t('notFound.subtitle')}<br />
            {dots.length > 0
              ? <span className="font-mono text-ink">{t('notFound.searching')}{dots}</span>
              : <span>{t('notFound.goBack')}</span>}
          </p>
        </div>

        {/* Botones */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate('/', { replace: true })}
            className="btn-primary px-8 py-3 text-base flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            <span>🏠</span>
            {t('notFound.goHome')}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="btn-secondary px-6 py-3 text-base flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            <span>↺</span>
            {t('notFound.retry')}
          </button>
        </div>

        {/* Pie */}
        <p className="text-ink/70 text-xs">
          {t('notFound.footer')}
        </p>
      </div>
    </div>
  )
}
