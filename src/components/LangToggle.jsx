import { useLang } from '../contexts/LangContext'

export default function LangToggle({ className = '' }) {
  const { lang, setLang } = useLang()
  return (
    <div className={`flex items-center rounded-lg overflow-hidden border border-stone-200 bg-stone-100 ${className}`}>
      {['es', 'en'].map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2 py-1 text-xs font-semibold uppercase transition-colors ${
            lang === l
              ? 'bg-amber-500 text-stone-950'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
