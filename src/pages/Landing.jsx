import { Link } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useLang } from '../contexts/LangContext'
import ReportButton from '../components/ReportButton'
import LangToggle from '../components/LangToggle'
import SoccerBall from '../components/SoccerBall'

const WORLD_CUP_TS = new Date('2026-06-11T21:00:00Z').getTime()

// ── Activity toast ─────────────────────────────────────────────────────────
function ActivityToast({ activities }) {
  const { t } = useLang()
  const [tick, setTick]   = useState(-1)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setTick(0), 2000)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (tick < 0) return
    setShown(true)
    const hide = setTimeout(() => setShown(false), 3200)
    const next = setTimeout(() => setTick(n => n + 1), 4600)
    return () => { clearTimeout(hide); clearTimeout(next) }
  }, [tick])

  if (!shown || tick < 0) return null

  return (
    <div
      key={tick}
      className="animate-slide-up flex items-center gap-3 bg-white/95 backdrop-blur-sm border border-stone-200 rounded-2xl px-4 py-3 shadow-lg shadow-stone-900/8 max-w-[270px]"
    >
      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <span className="text-sm">⚽</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-stone-800 leading-snug">{activities[tick % activities.length]}</p>
        <p className="text-[10px] text-stone-400 mt-0.5">{t('landing.agoMoment')}</p>
      </div>
    </div>
  )
}

// ── Countdown ──────────────────────────────────────────────────────────────
function CountdownUnit({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-14 sm:w-16 h-14 sm:h-16 bg-white border border-stone-200 rounded-2xl flex items-center justify-center shadow-sm">
        <span className="text-2xl sm:text-3xl font-black tabular-nums text-stone-900 leading-none">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] sm:text-xs text-stone-400 uppercase tracking-widest font-medium">{label}</span>
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

  if (left === 0) return <p className="text-emerald-600 font-bold text-lg">{t('landing.worldCupStarted')}</p>

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

// ── Feature card ───────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc }) {
  return (
    <div className="group bg-white border border-stone-200 rounded-3xl p-7 hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-500/8 transition-all duration-300 hover:-translate-y-1">
      <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl mb-5 group-hover:bg-emerald-100 transition-colors duration-200">
        {icon}
      </div>
      <h3 className="font-bold text-stone-900 text-base mb-2 leading-snug">{title}</h3>
      <p className="text-stone-500 text-sm leading-relaxed">{desc}</p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
export default function Landing() {
  const { t } = useLang()

  // Parallax refs — balls move at different speeds as the page scrolls.
  // Direct DOM writes inside rAF = zero React re-renders = buttery smooth.
  const ball1Ref = useRef(null)   // large main ball (right, slow)
  const ball2Ref = useRef(null)   // medium ball (left, medium)
  const ball3Ref = useRef(null)   // small ball (top-left, fast)

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return

    let raf = null
    function tick() {
      const sy = window.scrollY
      if (ball1Ref.current)
        ball1Ref.current.style.transform = `translateY(${(-sy * 0.40).toFixed(2)}px) rotate(${(sy * 0.08).toFixed(2)}deg)`
      if (ball2Ref.current)
        ball2Ref.current.style.transform = `translateY(${(-sy * 0.60).toFixed(2)}px) rotate(${(-sy * 0.14).toFixed(2)}deg)`
      if (ball3Ref.current)
        ball3Ref.current.style.transform = `translateY(${(-sy * 0.28).toFixed(2)}px) rotate(${(sy * 0.18).toFixed(2)}deg)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { if (raf != null) cancelAnimationFrame(raf) }
  }, [])

  const FEATURES = [
    { icon: '🎯', title: t('landing.f1title'), desc: t('landing.f1desc') },
    { icon: '🏆', title: t('landing.f2title'), desc: t('landing.f2desc') },
    { icon: '📊', title: t('landing.f3title'), desc: t('landing.f3desc') },
    { icon: '🎲', title: t('landing.f4title'), desc: t('landing.f4desc') },
  ]

  const ACTIVITIES = [
    t('landing.a1'),  t('landing.a2'),  t('landing.a3'),  t('landing.a4'),
    t('landing.a5'),  t('landing.a6'),  t('landing.a7'),  t('landing.a8'),
    t('landing.a9'),  t('landing.a10'), t('landing.a11'), t('landing.a12'),
  ]

  return (
    <div className="min-h-screen bg-white text-stone-900">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 pt-safe">
        <div className="bg-white/80 backdrop-blur-md border-b border-stone-200/60">
          <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SoccerBall className="w-6 h-6" />
              <span className="font-bold text-sm sm:text-base text-stone-900 tracking-tight">
                {t('common.appName')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <LangToggle />
              <Link
                to="/auth"
                className="text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-1.5 rounded-xl transition-colors duration-150"
              >
                {t('landing.enter')}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-[calc(100dvh-56px-env(safe-area-inset-top))] overflow-hidden px-5 pt-16 pb-24">

        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-white via-emerald-50/40 to-white pointer-events-none" />

        {/* Soft color blobs */}
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-emerald-100/40 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[400px] h-[400px] bg-amber-100/50 rounded-full blur-[80px] pointer-events-none" />

        {/* ── Parallax ball 1 — large, right side ─── */}
        <div
          ref={ball1Ref}
          className="absolute right-[-50px] sm:right-[-20px] lg:right-[5%] top-[12%] w-[260px] sm:w-[380px] lg:w-[500px] will-change-transform pointer-events-none"
          style={{ transform: 'translateY(0px) rotate(0deg)' }}
          aria-hidden="true"
        >
          <SoccerBall className="w-full h-full opacity-[0.18]" />
        </div>

        {/* ── Parallax ball 2 — medium, left ────────── */}
        <div
          ref={ball2Ref}
          className="absolute left-[-20px] sm:left-[3%] top-[52%] w-[90px] sm:w-[130px] lg:w-[160px] will-change-transform pointer-events-none"
          style={{ transform: 'translateY(0px) rotate(0deg)' }}
          aria-hidden="true"
        >
          <SoccerBall className="w-full h-full opacity-[0.13]" />
        </div>

        {/* ── Parallax ball 3 — small, top-left ─────── */}
        <div
          ref={ball3Ref}
          className="absolute left-[12%] sm:left-[18%] top-[6%] w-[50px] sm:w-[70px] will-change-transform pointer-events-none"
          style={{ transform: 'translateY(0px) rotate(0deg)' }}
          aria-hidden="true"
        >
          <SoccerBall className="w-full h-full opacity-[0.10]" />
        </div>

        {/* ── Hero text ─────────────────────────────── */}
        <div className="relative z-10 text-center max-w-3xl mx-auto">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-8">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            FIFA World Cup 2026 ⚽
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.92] tracking-tight mb-6 text-stone-900">
            {t('landing.heroTitle1')}
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 via-green-500 to-amber-500">
              {t('landing.heroTitle2')}
            </span>
          </h1>

          <p className="text-stone-500 text-lg sm:text-xl leading-relaxed mb-10 max-w-xl mx-auto">
            {t('landing.heroSubtitle')}
          </p>

          {/* Countdown */}
          <div className="mb-10 flex flex-col items-center gap-4">
            <p className="text-stone-400 text-xs font-semibold uppercase tracking-widest">{t('landing.firstMatch')}</p>
            <Countdown target={WORLD_CUP_TS} />
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white font-black text-lg sm:text-xl px-10 py-5 rounded-2xl transition-all duration-200 shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 w-full sm:w-auto justify-center"
            >
              {t('landing.cta')}
              <span className="text-xl">→</span>
            </Link>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30 pointer-events-none">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">{t('landing.scrollHint')}</span>
          <div className="w-px h-8 bg-gradient-to-b from-stone-400 to-transparent" />
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────────────────── */}
      <section className="bg-emerald-600 text-white">
        <div className="max-w-4xl mx-auto px-5 py-6 grid grid-cols-3 gap-4 text-center">
          {[
            ['48',  t('landing.statsTeams')],
            ['104', t('landing.statsMatches')],
            ['3',   t('landing.statsVenues')],
          ].map(([n, label]) => (
            <div key={label}>
              <div className="text-2xl sm:text-3xl font-black text-white">{n}</div>
              <div className="text-emerald-200 text-xs sm:text-sm uppercase tracking-wider mt-0.5 font-medium">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section className="px-5 py-24 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-emerald-600 text-xs font-bold uppercase tracking-widest mb-3">{t('landing.featuresTitle')}</p>
            <h2 className="text-3xl sm:text-4xl font-black text-stone-900 mb-3 leading-tight">{t('landing.featuresSubtitle')}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map(({ icon, title, desc }) => (
              <FeatureCard key={title} icon={icon} title={title} desc={desc} />
            ))}
          </div>
        </div>
      </section>

      {/* ── SCORING ─────────────────────────────────────────────────────── */}
      <section className="px-5 py-20 bg-stone-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">{t('landing.scoringSystem')}</p>
            <div className="w-8 h-0.5 bg-emerald-500 mx-auto rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-5 mb-6">
            {[
              { pts: '3', label: t('landing.exactScore'),    color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
              { pts: '1', label: t('landing.correctWinner'), color: 'text-amber-500',   bg: 'bg-amber-50 border-amber-200'     },
              { pts: '0', label: t('landing.wrongResult'),   color: 'text-stone-400',   bg: 'bg-stone-100 border-stone-200'    },
            ].map(({ pts, label, color, bg }) => (
              <div key={label} className={`text-center p-5 sm:p-7 rounded-2xl border ${bg}`}>
                <div className={`text-5xl sm:text-6xl font-black ${color}`}>{pts}</div>
                <div className="text-stone-500 text-xs mt-3 leading-snug font-medium">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 bg-white border border-stone-200 rounded-2xl px-4 py-3.5 shadow-sm">
            <span className="text-lg flex-shrink-0">🎲</span>
            <p className="text-stone-600 text-xs leading-relaxed">{t('landing.extraPointsNote')}</p>
          </div>
          <p className="text-center text-stone-400 text-xs mt-5">{t('landing.closingNote')}</p>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────────── */}
      <section className="relative px-5 py-28 text-center overflow-hidden bg-gradient-to-br from-emerald-500 to-green-600">
        {/* Decorative balls */}
        <div className="absolute top-[-40px] right-[-40px] w-[280px] h-[280px] opacity-10 pointer-events-none">
          <SoccerBall className="w-full h-full" />
        </div>
        <div className="absolute bottom-[-30px] left-[-20px] w-[180px] h-[180px] opacity-8 pointer-events-none">
          <SoccerBall className="w-full h-full" />
        </div>

        <div className="relative max-w-lg mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-white/90 text-xs font-bold uppercase tracking-widest mb-8">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            {t('landing.badge')}
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-white mb-4 leading-tight">
            {t('landing.ctaTitle1')}
            <br />
            <span className="text-emerald-100">{t('landing.ctaTitle2')}</span>
          </h2>
          <p className="text-emerald-100 mb-10 text-lg">{t('landing.ctaSubtitle')}</p>
          <Link
            to="/auth"
            className="inline-flex items-center gap-3 bg-white hover:bg-emerald-50 text-emerald-700 font-black text-lg px-10 py-5 rounded-2xl transition-all duration-200 shadow-xl shadow-emerald-900/20 hover:-translate-y-0.5"
          >
            {t('landing.cta')}
            <span className="text-xl">→</span>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-100 bg-stone-50 px-5 py-6 text-center space-y-1">
        <p className="text-stone-400 text-xs">{t('landing.footer')}</p>
        <p className="text-stone-400 text-xs">
          <Link to="/privacidad" className="hover:text-stone-600 underline underline-offset-2">
            {t('landing.privacyPolicy')}
          </Link>
        </p>
      </footer>

      {/* ── Activity toasts ─────────────────────────────────────────────── */}
      <div className="fixed bottom-5 left-4 sm:left-6 z-30 pointer-events-none">
        <ActivityToast activities={ACTIVITIES} />
      </div>

      <ReportButton />
    </div>
  )
}
