import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Spinner from './Spinner'

export default function ReportButton({ username, userEmail }) {
  const [open, setOpen]       = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  function handleOpen() { setOpen(true); setDone(false); setError(''); setMessage('') }
  function handleClose() { setOpen(false) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!message.trim()) return
    setLoading(true)
    setError('')
    try {
      const { error: fnErr } = await supabase.functions.invoke('report-issue', {
        body: {
          message:   message.trim(),
          username:  username  ?? '',
          userEmail: userEmail ?? '',
          page:      window.location.pathname,
        },
      })
      if (fnErr) throw new Error(fnErr.message)
      setDone(true)
      setMessage('')
      setTimeout(() => setOpen(false), 2500)
    } catch {
      setError('No se pudo enviar. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={handleOpen}
        className="fixed bottom-20 sm:bottom-5 right-3 sm:right-4 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white border border-stone-200 shadow-md text-stone-400 hover:text-stone-700 hover:border-stone-300 hover:shadow-lg transition-all duration-150 text-xs font-medium"
        aria-label="Reportar un problema"
      >
        <span className="text-sm leading-none">⚠️</span>
        <span className="hidden sm:inline">Reportar problema</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-3 pb-3 sm:pb-0 bg-stone-900/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-stone-900/15 border border-stone-200 overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100">
              <div>
                <h2 className="font-semibold text-stone-900 text-base">Reportar un problema</h2>
                <p className="text-stone-400 text-xs mt-0.5">Te contestaremos lo antes posible.</p>
              </div>
              <button
                onClick={handleClose}
                className="text-stone-400 hover:text-stone-700 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-stone-100 transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              {done ? (
                <div className="text-center py-6 space-y-2">
                  <div className="text-4xl">✅</div>
                  <p className="font-semibold text-stone-900">Reporte enviado</p>
                  <p className="text-stone-400 text-sm">Gracias, lo revisaremos pronto.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <textarea
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 resize-none transition-colors"
                    rows={4}
                    placeholder="Describe el problema que encontraste…"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    maxLength={2000}
                    required
                    autoFocus
                  />
                  {error && (
                    <p className="text-red-500 text-xs">{error}</p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-stone-400">{message.length}/2000</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleClose} className="btn-secondary text-sm px-3 py-1.5">
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={loading || !message.trim()}
                        className="btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5"
                      >
                        {loading && <Spinner size="sm" />}
                        Enviar
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
