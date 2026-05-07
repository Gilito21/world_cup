import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="text-center space-y-6 animate-slide-up">
        <div className="text-7xl">⚽</div>
        <div>
          <p className="text-8xl font-bold text-stone-200 leading-none">404</p>
          <p className="text-xl font-semibold text-stone-700 mt-3">Página no encontrada</p>
          <p className="text-stone-400 text-sm mt-2">Esta página no existe o ha sido movida.</p>
        </div>
        <Link to="/" className="btn-primary inline-flex items-center gap-2">
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )
}
