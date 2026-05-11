import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import PWAPrompts from './components/PWAPrompts.jsx'
import './index.css'

// When Chrome restores a page from bfcache (back/forward navigation),
// React state is frozen at whatever it was when the page was frozen.
// If it was frozen mid-load (loading=true), the spinner never clears.
// A hard reload forces a clean re-execution.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <PWAPrompts />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
