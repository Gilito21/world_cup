import { Link } from 'react-router-dom'

const FEATURES = [
  {
    icon: '📝',
    title: 'Predice cada partido',
    desc: 'Elige el marcador exacto antes de que empiece. Cuanto más preciso, más puntos acumulas.',
  },
  {
    icon: '🏆',
    title: 'Crea tu liga privada',
    desc: 'Invita a tus amigos o compañeros de trabajo con un código único y compite en un ranking solo entre vosotros.',
  },
  {
    icon: '📊',
    title: 'Sigue la clasificación',
    desc: 'Consulta el ranking global, el de tu liga y el de tu empresa en tiempo real a lo largo del torneo.',
  },
]

const SCORING = [
  { pts: '3', label: 'Marcador exacto', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  { pts: '1', label: 'Ganador correcto', color: 'text-blue-400',  bg: 'bg-blue-500/10  border-blue-500/20'  },
  { pts: '0', label: 'Resultado errado', color: 'text-stone-500', bg: 'bg-stone-500/10 border-stone-500/20' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 text-white flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className="border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">⚽</span>
            <span className="font-bold text-white text-lg hidden sm:block">
              Porra <span className="text-amber-400">Mundial 2026</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="text-stone-300 hover:text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-white/8 transition-all duration-150"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/auth"
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-150 shadow-sm shadow-amber-500/30"
            >
              Registrarse
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center justify-center px-6 py-20 relative overflow-hidden">
        {/* Background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-amber-500/6 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-orange-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-8">
            ⚽ Junio 2026 · USA, México y Canadá
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight mb-5">
            ¿Quién predice mejor
            <br />
            <span className="text-amber-400">el fútbol?</span>
          </h1>

          <p className="text-stone-300 text-lg sm:text-xl leading-relaxed mb-10 max-w-xl mx-auto">
            La porra del Mundial 2026. Predice marcadores, crea una liga con tus amigos
            y compite por ser el más listo del grupo.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/auth"
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/35 hover:-translate-y-px text-base"
            >
              Crear cuenta gratis →
            </Link>
            <Link
              to="/auth"
              className="w-full sm:w-auto border border-white/15 text-stone-300 hover:text-white hover:border-white/30 font-medium px-8 py-3.5 rounded-xl transition-all duration-150 text-base"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────── */}
      <section className="px-6 pb-20 max-w-5xl mx-auto w-full">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Cómo funciona</h2>
          <p className="text-stone-400 text-base max-w-md mx-auto">
            Simple de entender, difícil de ganar.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-16">
          {FEATURES.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="bg-white/5 border border-white/8 rounded-2xl p-6 hover:bg-white/8 hover:border-white/12 transition-all duration-200"
            >
              <div className="text-3xl mb-4">{icon}</div>
              <h3 className="font-semibold text-white text-base mb-2">{title}</h3>
              <p className="text-stone-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Puntuación */}
        <div className="bg-white/4 border border-white/8 rounded-2xl p-6 sm:p-8">
          <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-wider text-center mb-6">
            Sistema de puntuación
          </h3>
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            {SCORING.map(({ pts, label, color, bg }) => (
              <div key={label} className={`text-center p-4 rounded-xl border ${bg}`}>
                <div className={`text-3xl font-extrabold ${color}`}>{pts}</div>
                <div className="text-stone-400 text-xs mt-1 leading-snug">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-stone-500 text-xs mt-5">
            Los pronósticos se cierran cuando el árbitro pita el inicio del partido.
          </p>
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────── */}
      <section className="border-t border-white/5 px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">¿Listo para jugar?</h2>
        <p className="text-stone-400 text-sm mb-8 max-w-xs mx-auto">
          Regístrate gratis, crea tu liga y empieza a competir.
        </p>
        <Link
          to="/auth"
          className="inline-block bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/35 hover:-translate-y-px"
        >
          Crear cuenta gratis →
        </Link>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-5 text-center text-stone-600 text-xs">
        Mundial 2026 · USA · México · Canadá
      </footer>
    </div>
  )
}
