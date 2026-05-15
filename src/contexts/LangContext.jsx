import { createContext, useCallback, useContext, useState } from 'react'
import es from '../i18n/es'
import en from '../i18n/en'

const TRANSLATIONS = { es, en }

const LangContext = createContext({})

function resolve(obj, key) {
  const parts = key.split('.')
  let cur = obj
  for (const p of parts) {
    cur = cur?.[p]
    if (cur == null) return null
  }
  return cur
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('porra-lang') ?? 'es')

  function setLang(l) {
    localStorage.setItem('porra-lang', l)
    setLangState(l)
  }

  const t = useCallback((key, vars) => {
    let str = resolve(TRANSLATIONS[lang], key) ?? resolve(TRANSLATIONS.es, key) ?? key
    if (!vars) return str
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`))
  }, [lang])

  const dateLocale = lang === 'es' ? 'es-ES' : 'en-US'

  return (
    <LangContext.Provider value={{ lang, setLang, t, dateLocale }}>
      {children}
    </LangContext.Provider>
  )
}

export const useLang = () => useContext(LangContext)
