import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../contexts/LangContext'
import { useChromeHidden } from '../lib/scrollChrome'
import Spinner from './Spinner'

export default function ReportButton({ username, userEmail }) {
  const { t } = useLang()
  const hidden = useChromeHidden()
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
      setError(t('report.sendError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={handleOpen}
        className={`fixed bottom-20 sm:bottom-5 right-3 sm:right-4 z-40 flex items-center px-2.5 py-1.5 rounded-full bg-paper border border-ink/20 shadow-md text-ink/50 hover:text-ink/80 hover:border-ink/30 hover:shadow-lg transition-all duration-200 text-xs font-medium group ${
          hidden ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
        } sm:opacity-100 sm:translate-y-0 sm:pointer-events-auto`}
        aria-label={t('report.btnLabel')}
      >
        <span className="text-sm leading-none">⚠️</span>
        <span className="overflow-hidden max-w-0 group-hover:max-w-[8rem] transition-all duration-200 whitespace-nowrap">
          <span className="pl-1.5">{t('report.btnLabel')}</span>
        </span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-3 pb-3 sm:pb-0 bg-ink/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="w-full max-w-md bg-paper rounded-none shadow-2xl shadow-ink/15 border border-ink/20 overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink/15">
              <div>
                <h2 className="font-semibold text-ink text-base">{t('report.title')}</h2>
                <p className="text-ink/50 text-xs mt-0.5">{t('report.subtitle')}</p>
              </div>
              <button
                onClick={handleClose}
                className="text-ink/50 hover:text-ink/80 w-10 h-10 flex items-center justify-center rounded-none hover:bg-paper active:bg-paper-200 transition-colors text-sm -mr-2"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>

            <div className="p-5">
              {done ? (
                <div className="text-center py-6 space-y-2">
                  <div className="text-4xl">✅</div>
                  <p className="font-semibold text-ink">{t('report.sent')}</p>
                  <p className="text-ink/50 text-sm">{t('report.sentDesc')}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <textarea
                    className="w-full rounded-none border border-ink/20 bg-cream px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/50 focus:outline-none focus:ring-2 focus:ring-ink/30 focus:border-ink resize-none transition-colors"
                    rows={4}
                    placeholder={t('report.placeholder')}
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
                    <span className="text-xs text-ink/50">{message.length}/2000</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleClose} className="btn-secondary text-sm px-3 py-1.5">
                        {t('report.cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={loading || !message.trim()}
                        className="btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5"
                      >
                        {loading && <Spinner size="sm" />}
                        {t('report.send')}
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
