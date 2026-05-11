import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function CopyButton({ text, label = 'Copiar' }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {/* clipboard blocked — ignoramos */}
  }
  return (
    <button
      onClick={handleCopy}
      className="btn-secondary text-xs px-3 py-2 flex-shrink-0"
    >
      {copied ? '✓' : label}
    </button>
  )
}

// Modal de éxito tras crear una liga (founder o tras pago).
// Muestra el código y el link de invitación para compartir.
export default function LeagueCreatedModal({ league, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const inviteLink = `${window.location.origin}/join/${league.invite_code}`

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/60 backdrop-blur-md animate-fade-in px-4 py-4 sm:py-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl shadow-black/40 w-full max-w-md overflow-hidden animate-slide-up">
        {/* Hero */}
        <div className="relative bg-gradient-to-br from-amber-500 via-amber-400 to-orange-400 p-6 text-stone-950 text-center">
          <div className="text-4xl mb-1">🎉</div>
          <h2 className="text-xl font-bold">¡Liga creada!</h2>
          <p className="text-stone-900/80 text-sm mt-1">
            <span className="italic">"{league.name}"</span> está lista
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Código de invitación</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-stone-100 border border-amber-500/30 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold tracking-[0.3em] text-amber-500 font-mono">{league.invite_code}</p>
              </div>
              <CopyButton text={league.invite_code} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Link directo</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs text-stone-500 bg-stone-100 rounded-xl px-3 py-2.5 font-mono truncate">
                {inviteLink}
              </p>
              <CopyButton text={inviteLink} />
            </div>
            <p className="text-xs text-stone-400">
              Tus amigos hacen click y se unen al registrarse.
            </p>
          </div>

          <button onClick={onClose} className="btn-primary w-full">Perfecto</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
