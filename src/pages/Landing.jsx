import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'

const WORLD_CUP_TS = new Date('2026-06-11T21:00:00Z').getTime()

const FEATURES = [
  {
    icon: '🎯',
    title: 'Predice cada partido',
    desc: 'Elige el marcador exacto antes de que empiece. Cuanto más preciso, más puntos acumulas.',
  },
  {
    icon: '🏆',
    title: 'Crea tu liga privada',
    desc: 'Invita a tus amigos o compañeros con un código único y compite en un ranking propio.',
  },
  {
    icon: '📊',
    title: 'Clasificación en tiempo real',
    desc: 'Consulta el ranking global, el de tu liga y el de tu empresa a lo largo del torneo.',
  },
  {
    icon: '🎲',
    title: 'Preguntas extra',
    desc: 'MVP del Mundial, Mbappé vs Lamine, total de tarjetas… predice y suma puntos bonus.',
  },
]

const SCORING = [
  { pts: '3', label: 'Marcador exacto',  color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200' },
  { pts: '1', label: 'Ganador correcto', color: 'text-sky-500',   bg: 'bg-sky-50   border-sky-200'   },
  { pts: '0', label: 'Resultado errado', color: 'text-stone-400', bg: 'bg-stone-50 border-stone-200' },
]

const ACTIVITIES = [
  { icon: '🎯', text: 'Rafa_Griezmann ha enviado su pronóstico' },
  { icon: '🏆', text: 'MariaGol eligió a Mbappé como MVP' },
  { icon: '⚽', text: 'ElCrack_77 predijo España 2–1 Brasil' },
  { icon: '🔗', text: 'Pablo_FCB se unió a una liga privada' },
  { icon: '🎲', text: 'LauraGolazo apostó por Lamine Yamal' },
  { icon: '🏅', text: 'Juanma_10 completó todos sus pronósticos' },
  { icon: '⚽', text: 'Marta_Goals predijo Argentina en la final' },
  { icon: '🎯', text: 'FrancoDelMundo envió su pronóstico' },
  { icon: '🏆', text: 'CarlosGol eligió a Vinícius Jr como MVP' },
  { icon: '🎲', text: 'SofiaFútbol predijo 312 tarjetas totales' },
  { icon: '⚽', text: 'DiegoClásico predijo Francia 3–2 México' },
  { icon: '🔗', text: 'Nando_CF creó una liga con sus amigos' },
]

// ── Activity toast ─────────────────────────────────────────────────────────
function ActivityToast() {
  const [tick, setTick]   = useState(-1)
  const [shown, setShown] = useState(false)

  // Initial delay
  useEffect(() => {
    const t = setTimeout(() => setTick(0), 1800)
    return () => clearTimeout(t)
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

  const { icon, text } = ACTIVITIES[tick % ACTIVITIES.length]
  return (
    <div
      key={tick}
      className="animate-slide-up flex items-center gap-3 bg-white border border-stone-200 rounded-2xl px-4 py-3 shadow-lg shadow-stone-900/8 max-w-[270px]"
    >
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-stone-800 leading-snug">{text}</p>
        <p className="text-[10px] text-stone-400 mt-0.5">Hace un momento</p>
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
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()))
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, target - Date.now())), 1000)
    return () => clearInterval(t)
  }, [target])

  const d = Math.floor(left / 86400000)
  const h = Math.floor((left % 86400000) / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const s = Math.floor((left % 60000) / 1000)

  if (left === 0) return <p className="text-amber-500 font-bold text-lg">¡El Mundial ha empezado!</p>

  return (
    <div className="flex items-end gap-2 sm:gap-3">
      <CountdownUnit value={d} label="días" />
      <span className="text-stone-300 font-bold text-2xl pb-6">:</span>
      <CountdownUnit value={h} label="horas" />
      <span className="text-stone-300 font-bold text-2xl pb-6">:</span>
      <CountdownUnit value={m} label="min" />
      <span className="text-stone-300 font-bold text-2xl pb-6">:</span>
      <CountdownUnit value={s} label="seg" />
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-stone-900">

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-stone-100 bg-white/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚽</span>
            <span className="font-bold text-sm sm:text-base text-stone-900">
              Porra <span className="text-amber-500">Mundial 2026</span>
            </span>
          </div>
          <Link
            to="/auth"
            className="text-sm font-semibold text-stone-700 hover:text-stone-900 border border-stone-200 hover:border-stone-400 px-4 py-1.5 rounded-xl transition-all duration-150 bg-white hover:bg-stone-50"
          >
            Entrar →
          </Link>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center px-5 pt-20 pb-24 overflow-hidden min-h-[calc(100vh-56px)] bg-white">
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

        <div className="relative text-center max-w-3xl mx-auto animate-slide-up">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 text-amber-700 text-xs font-semibold uppercase tracking-wider mb-8">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            USA · México · Canadá · Junio 2026
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tight mb-6 text-stone-900">
            ¿Quién predice
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">
              el Mundial?
            </span>
          </h1>

          <p className="text-stone-500 text-lg sm:text-xl leading-relaxed mb-10 max-w-xl mx-auto">
            La porra definitiva del Mundial 2026. Predice marcadores, crea tu liga y demuestra que sabes más de fútbol que tus amigos.
          </p>

          {/* Countdown */}
          <div className="mb-10 flex flex-col items-center gap-3">
            <p className="text-stone-400 text-xs uppercase tracking-widest">Primer partido · 11 jun 2026</p>
            <Countdown target={WORLD_CUP_TS} />
          </div>

          {/* CTA */}
          <Link
            to="/auth"
            className="inline-flex items-center gap-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-white font-black text-lg sm:text-xl px-10 py-5 rounded-2xl transition-all duration-200 shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:-translate-y-1 active:translate-y-0"
          >
            Entrar a la app
            <span className="text-xl">→</span>
          </Link>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 opacity-25 pointer-events-none">
          <div className="w-px h-10 bg-gradient-to-b from-transparent to-stone-500" />
          <span className="text-[10px] uppercase tracking-widest text-stone-500">Más</span>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────── */}
      <section className="border-y border-stone-100 bg-stone-50">
        <div className="max-w-4xl mx-auto px-5 py-5 grid grid-cols-3 gap-4 text-center">
          {[['48', 'equipos'], ['104', 'partidos'], ['3', 'sedes']].map(([n, label]) => (
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
          <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-3">Todo lo que puedes predecir</h2>
          <p className="text-stone-500 text-base">Simple de entender, difícil de ganar.</p>
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
            Sistema de puntuación
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
              <strong>Puntos extra</strong> por preguntas como el MVP del Mundial, quién marcará más goles o el total de tarjetas del torneo.
            </p>
          </div>
          <p className="text-center text-stone-400 text-xs mt-5">
            Los pronósticos se cierran 1 hora antes del primer partido del Mundial.
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
            ¿Listo para demostrar
            <br />
            <span className="text-amber-500">que sabes de fútbol?</span>
          </h2>
          <p className="text-stone-500 mb-10">
            Crea tu cuenta, únete a una liga y empieza a predecir.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center gap-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-white font-black text-lg px-10 py-5 rounded-2xl transition-all duration-200 shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:-translate-y-1"
          >
            Entrar a la app
            <span className="text-xl">→</span>
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-stone-100 bg-stone-50 px-5 py-6 text-center">
        <p className="text-stone-400 text-xs">
          ⚽ Porra Mundial 2026 · Hecho con pasión por el fútbol
        </p>
      </footer>

      {/* ── Activity toasts ──────────────────────────────────── */}
      <div className="fixed bottom-5 left-4 sm:left-6 z-30 pointer-events-none">
        <ActivityToast />
      </div>

    </div>
  )
}
