import { createContext, useContext } from 'react'

// True cuando el usuario está haciendo scroll hacia abajo en el contenedor
// principal: el Layout oculta la bottom-nav y los FABs (p.ej. el de
// clasificación) se minimizan, para una vista más limpia. Vuelve a false al
// subir o al llegar arriba.
export const ScrollChromeContext = createContext(false)

export const useChromeHidden = () => useContext(ScrollChromeContext)
