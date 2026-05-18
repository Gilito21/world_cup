import { useLang } from '../contexts/LangContext'

export default function LangToggle({ className = '' }) {
  const { lang, setLang } = useLang()
  return (
    <div className={`flex items-center overflow-hidden border border-ink ${className}`}>
      {['es', 'en'].map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em] transition-colors ${
            lang === l
              ? 'bg-ink text-cream'
              : 'bg-transparent text-ink/60 hover:text-ink'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
