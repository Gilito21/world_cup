import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LangContext'
import ReportButton from '../components/ReportButton'
import LangToggle from '../components/LangToggle'
import SoccerBall from '../components/SoccerBall'
import useScrollRotation from '../lib/useScrollRotation'

const WORLD_CUP_TS = new Date('2026-06-11T21:00:00Z').getTime()

// ── Activity toast ─────────────────────────────────────────────────────────
function ActivityToast({ activities }) {
  const { t } = useLang()
  const [tick, setTick]   = useState(-1)
  const [shown, setShown] = useState(false)

  // Initial delay
  useEffect(() => {
    const id = setTimeout(() => setTick(0), 1800)
    return () => clearTimeout(id)
  }, [])

  // Cycle
  useEffect(() => {
    if (tick < 0) return
    setShown(true)
    const hide = setTimeout(() => setShown(false), 3200)
    const next = setTimeout(() => setTick(t => t + 1), 4600)
    return () => { clearTimeout(hide); clearTimeout(next) }
  }, [tick])

  if (!shown || tick < 0) return null

  const text = activities[tick % activities.length]
  return (
    <div
      key={tick}
      className="animate-slide-up flex items-center gap-3 bg-white border border-stone-200 rounded-2xl px-4 py-3 shadow-lg shadow-stone-900/8 max-w-[270px]"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-stone-800 leading-snug">{text}</p>
        <p className="text-[10px] text-stone-400 mt-0.5">{t('landing.agoMoment')}</p>
      </div>
    </div>
  )
}

// ── Countdown ──────────────────────────────────────────────────────────────
function CountdownUnit({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-14 sm:w-16 h-14 sm:h-16 bg-stone-100 border border-stone-200 rounded-xl flex items-center justify-center">
        <span className="text-2xl sm:text-3xl font-black tabular-nums text-stone-900 leading-none">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] sm:text-xs text-stone-400 uppercase tracking-widest">{label}</span>
    </div>
  )
}

function Countdown({ target }) {
  const { t } = useLang()
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()))
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, target - Date.now())), 1000)
    return () => clearInterval(id)
  }, [target])

  const d = Math.floor(left / 86400000)
  const h = Math.floor((left % 86400000) / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const s = Math.floor((left % 60000) / 1000)

  if (left === 0) return <p className="text-amber-500 font-bold text-lg">{t('landing.worldCupStarted')}</p>

  return (
    <div className="flex items-end gap-2 sm:gap-3">
      <CountdownUnit value={d} label={t('landing.days')} />
      <span className="text-stone-300 font-bold text-2xl pb-6">:</span>
      <CountdownUnit value={h} label={t('landing.hours')} />
      <span className="text-stone-300 font-bold text-2xl pb-6">:</span>
      <CountdownUnit value={m} label={t('landing.minutes')} />
      <span className="text-stone-300 font-bold text-2xl pb-6">:</span>
      <CountdownUnit value={s} label={t('landing.seconds')} />
    </div>
  )
}

export default function Landing() {
  const { t } = useLang()
  const ballRef = useScrollRotation(0.35)

  const FEATURES = [
    { icon: '🎯', title: t('landing.f1title'), desc: t('landing.f1desc') },
    { icon: '🏆', title: t('landing.f2title'), desc: t('landing.f2desc') },
    { icon: '📊', title: t('landing.f3title'), desc: t('landing.f3desc') },
    { icon: '🎲', title: t('landing.f4title'), desc: t('landing.f4desc') },
  ]

  const SCORING = [
    { pts: '3', label: t('landing.exactScore'),   color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200' },
    { pts: '1', label: t('landing.correctWinner'), color: 'text-sky-500',   bg: 'bg-sky-50   border-sky-200'   },
    { pts: '0', label: t('landing.wrongResult'),   color: 'text-stone-400', bg: 'bg-stone-50 border-stone-200' },
  ]

  const ACTIVITIES = [
    t('landing.a1'),
    t('landing.a2'),
    t('landing.a3'),
    t('landing.a4'),
    t('landing.a5'),
    t('landing.a6'),
    t('landing.a7'),
    t('landing.a8'),
    t('landing.a9'),
    t('landing.a10'),
    t('landing.a11'),
    t('landing.a12'),
  ]

  return (
    <div className="min-h-screen bg-white text-stone-900">

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-stone-100 bg-white/90 backdrop-blur-sm pt-safe">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SoccerBall className="w-6 h-6" />
            <span className="font-bold text-sm sm:text-base text-stone-900">
              {t('common.appName')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle />
            <Link
              to="/auth"
              className="text-sm font-semibold text-stone-700 hover:text-stone-900 border border-stone-200 hover:border-stone-400 px-4 py-1.5 rounded-xl transition-all duration-150 bg-white hover:bg-stone-50"
            >
              {t('landing.enter')}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center px-5 pt-20 pb-24 overflow-hidden min-h-[calc(100dvh-56px-env(safe-area-inset-top))] bg-white">
        {/* Subtle dot pattern */}
        <div
          className="absolute inset-0 opacity-60 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #e7e5e4 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        {/* Soft amber blob */}
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-amber-100/60 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-orange-50 rounded-full blur-3xl pointer-events-none" />

        {/* Scroll-rotating soccer ball — drives the "pro UI" feel.
            Position: top-right corner of the hero, partly off-edge so it
            looks like it's spilling out of the canvas. Sits ABOVE the
            blurred glows so the seams stay sharp, but below the centered
            text via z-index. */}
        <div
          ref={ballRef}
          className="absolute -top-4 -right-12 sm:top-10 sm:-right-16 lg:right-[-40px] w-44 h-44 sm:w-64 sm:h-64 lg:w-80 lg:h-80 pointer-events-none opacity-90 will-change-transform drop-shadow-2xl"
          style={{ transformOrigin: 'center' }}
        >
          <SoccerBall />
        </div>

        <div className="relative text-center max-w-3xl mx-auto animate-slide-up">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 text-amber-700 text-xs font-semibold uppercase tracking-wider mb-8">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            {t('landing.badge')}
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight mb-6 text-stone-900">
            {t('landing.heroTitle1')}
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">
              {t('landing.heroTitle2')}
            </span>
          </h1>

          <p className="text-stone-500 text-lg sm:text-xl leading-relaxed mb-10 max-w-xl mx-auto">
            {t('landing.heroSubtitle')}
          </p>

          {/* Countdown */}
          <div className="mb-10 flex flex-col items-center gap-3">
            <p className="text-stone-400 text-xs uppercase tracking-widest">{t('landing.firstMatch')}</p>
            <Countdown target={WORLD_CUP_TS} />
          </div>

          {/* CTA */}
          <Link
            to="/auth"
            className="inline-flex items-center gap-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-white font-black text-lg sm:text-xl px-10 py-5 rounded-2xl transition-all duration-200 shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:-translate-y-1 active:translate-y-0"
          >
            {t('landing.cta')}
            <span className="text-xl">→</span>
          </Link>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-25 pointer-events-none">
          <div className="w-px h-10 bg-gradient-to-b from-transparent to-stone-500" />
          <span className="text-[10px] uppercase tracking-widest text-stone-500">{t('landing.scrollHint')}</span>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────── */}
      <section className="border-y border-stone-100 bg-stone-50">
        <div className="max-w-4xl mx-auto px-5 py-5 grid grid-cols-3 gap-4 text-center">
          {[
            ['48',  t('landing.statsTeams')],
            ['104', t('landing.statsMatches')],
            ['3',   t('landing.statsVenues')],
          ].map(([n, label]) => (
            <div key={label}>
              <div className="text-2xl sm:text-3xl font-black text-amber-500">{n}</div>
              <div className="text-stone-400 text-xs sm:text-sm uppercase tracking-wider mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────── */}
      <section className="px-5 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-3">{t('landing.featuresTitle')}</h2>
          <p className="text-stone-500 text-base">{t('landing.featuresSubtitle')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="bg-white border border-stone-200 rounded-2xl p-6 hover:border-amber-300 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="text-3xl mb-4">{icon}</div>
              <h3 className="font-semibold text-stone-900 text-sm mb-2 leading-snug">{title}</h3>
              <p className="text-stone-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Puntuación ───────────────────────────────────────── */}
      <section className="px-5 pb-20 max-w-2xl mx-auto">
        <div className="bg-stone-50 border border-stone-200 rounded-3xl p-6 sm:p-10">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest text-center mb-8">
            {t('landing.scoringSystem')}
          </h3>
          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            {SCORING.map(({ pts, label, color, bg }) => (
              <div key={label} className={`text-center p-4 sm:p-6 rounded-2xl border ${bg}`}>
                <div className={`text-4xl sm:text-5xl font-black ${color}`}>{pts}</div>
                <div className="text-stone-500 text-xs mt-2 leading-snug">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <span className="text-lg flex-shrink-0">🎲</span>
            <p className="text-amber-700 text-xs leading-relaxed">
              {t('landing.extraPointsNote')}
            </p>
          </div>
          <p className="text-center text-stone-400 text-xs mt-5">
            {t('landing.closingNote')}
          </p>
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────── */}
      <section className="relative px-5 py-24 text-center overflow-hidden border-t border-stone-100 bg-stone-50">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-amber-100/60 rounded-full blur-[80px]" />
        </div>
        <div className="relative max-w-lg mx-auto">
          <div className="text-5xl mb-5">🏆</div>
          <h2 className="text-3xl sm:text-4xl font-black text-stone-900 mb-4 leading-tight">
            {t('landing.ctaTitle1')}
            <br />
            <span className="text-amber-500">{t('landing.ctaTitle2')}</span>
          </h2>
          <p className="text-stone-500 mb-10">
            {t('landing.ctaSubtitle')}
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center gap-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-white font-black text-lg px-10 py-5 rounded-2xl transition-all duration-200 shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:-translate-y-1"
          >
            {t('landing.cta')}
            <span className="text-xl">→</span>
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-stone-100 bg-stone-50 px-5 py-6 text-center space-y-1">
        <p className="text-stone-400 text-xs">
          {t('landing.footer')}
        </p>
        <p className="text-stone-400 text-xs">
          <Link to="/privacidad" className="hover:text-stone-600 underline underline-offset-2">{t('landing.privacyPolicy')}</Link>
        </p>
      </footer>

      {/* ── Activity toasts ──────────────────────────────────── */}
      <div className="fixed bottom-5 left-4 sm:left-6 z-30 pointer-events-none">
        <ActivityToast activities={ACTIVITIES} />
      </div>

      <ReportButton />

    </div>
  )
}
